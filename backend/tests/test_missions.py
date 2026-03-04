from datetime import datetime, timedelta, timezone

from app.models.mission import Mission
from app.models.user import User
from app.models.world import Faction, StarSystem, Station, StationArchetype


def seed_mission_world(db_session):
    faction = Faction(name="Mission Faction",
                      alignment="lawful", reputation_scale=100)
    db_session.add(faction)
    db_session.flush()

    system = StarSystem(
        name="Mission System",
        seed="mission-seed",
        position_x=0,
        position_y=0,
        position_z=0,
        economy_type="mixed",
        tech_level=4,
        faction_id=faction.id,
    )
    db_session.add(system)
    db_session.flush()

    archetype = StationArchetype(
        name="Mission Hub",
        size_class="medium",
        shape="coriolis",
        palette_json={},
        features_json={"missions": True},
    )
    db_session.add(archetype)
    db_session.flush()

    station = Station(
        system_id=system.id,
        name="Mission Port",
        archetype_id=archetype.id,
        position_x=0,
        position_y=0,
        position_z=0,
        services_json={"missions": True},
        faction_id=faction.id,
        tech_level=5,
        ai_story_available=False,
    )
    db_session.add(station)
    db_session.flush()

    mission_open = Mission(
        station_id=station.id,
        faction_id=faction.id,
        title="Deliver Core Alloys",
        description="Transport alloys to orbital depot within one cycle.",
        reward_credits=600,
        status="open",
    )
    mission_expired = Mission(
        station_id=station.id,
        faction_id=faction.id,
        title="Expired Contract",
        description="Legacy mission to ensure expiry filtering.",
        reward_credits=200,
        status="open",
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=5),
    )
    db_session.add_all([mission_open, mission_expired])
    db_session.commit()

    return {
        "station_id": station.id,
        "mission_open_id": mission_open.id,
    }


def auth_headers_for(client, email: str, username: str):
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "username": username,
            "password": "pilot123",
        },
    )
    assert response.status_code == 200
    token = response.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_missions_available_requires_auth(client, db_session):
    state = seed_mission_world(db_session)
    response = client.get(
        f"/api/missions/available?station_id={state['station_id']}")
    assert response.status_code == 401


def test_missions_available_and_accept_flow(client, db_session):
    state = seed_mission_world(db_session)
    headers = auth_headers_for(
        client, "mission-pilot@example.com", "mission-pilot")

    available = client.get(
        f"/api/missions/available?station_id={state['station_id']}",
        headers=headers,
    )
    assert available.status_code == 200
    payload = available.json()
    assert len(payload) == 1
    assert payload[0]["id"] == state["mission_open_id"]
    assert payload[0]["station_name"] == "Mission Port"
    assert payload[0]["accepted"] is False

    accept = client.post(
        f"/api/missions/{state['mission_open_id']}/accept", headers=headers)
    assert accept.status_code == 200
    accepted_payload = accept.json()
    assert accepted_payload["mission_id"] == state["mission_open_id"]
    assert accepted_payload["status"] == "accepted"
    assert accepted_payload["reputation_value"] == 1

    duplicate = client.post(
        f"/api/missions/{state['mission_open_id']}/accept",
        headers=headers,
    )
    assert duplicate.status_code == 409

    mine = client.get("/api/missions/me", headers=headers)
    assert mine.status_code == 200
    my_payload = mine.json()
    assert len(my_payload) == 1
    assert my_payload[0]["mission_id"] == state["mission_open_id"]
    assert my_payload[0]["station_name"] == "Mission Port"

    available_after = client.get(
        f"/api/missions/available?station_id={state['station_id']}",
        headers=headers,
    )
    assert available_after.status_code == 200
    assert available_after.json()[0]["accepted"] is True


def test_mission_complete_awards_credits_and_updates_status(client, db_session):
    state = seed_mission_world(db_session)
    headers = auth_headers_for(
        client, "mission-complete@example.com", "mission-complete")

    user = db_session.query(User).filter(
        User.email == "mission-complete@example.com").first()
    assert user is not None
    user.location_type = "station"
    user.location_id = state["station_id"]
    starting_credits = int(user.credits)
    db_session.commit()

    accept = client.post(
        f"/api/missions/{state['mission_open_id']}/accept", headers=headers)
    assert accept.status_code == 200

    complete = client.post(
        f"/api/missions/{state['mission_open_id']}/complete",
        headers=headers,
    )
    assert complete.status_code == 200
    payload = complete.json()
    assert payload["status"] == "completed"
    assert payload["reward_credits"] == 600
    assert payload["credits_after"] == starting_credits + 600
    assert payload["reputation_value"] == 3

    mine = client.get("/api/missions/me", headers=headers)
    assert mine.status_code == 200
    my_payload = mine.json()
    assert len(my_payload) == 1
    assert my_payload[0]["status"] == "completed"
    assert my_payload[0]["completed_at"] is not None

    duplicate = client.post(
        f"/api/missions/{state['mission_open_id']}/complete",
        headers=headers,
    )
    assert duplicate.status_code == 409


def test_mission_complete_requires_docked_station_match(client, db_session):
    state = seed_mission_world(db_session)
    headers = auth_headers_for(
        client, "mission-location@example.com", "mission-location")

    accept = client.post(
        f"/api/missions/{state['mission_open_id']}/accept", headers=headers)
    assert accept.status_code == 200

    user = db_session.query(User).filter(
        User.email == "mission-location@example.com").first()
    assert user is not None
    user.location_type = "deep-space"
    user.location_id = None
    db_session.commit()

    response = client.post(
        f"/api/missions/{state['mission_open_id']}/complete",
        headers=headers,
    )
    assert response.status_code == 409


def test_mission_abandon_updates_status_without_reward(client, db_session):
    state = seed_mission_world(db_session)
    headers = auth_headers_for(
        client, "mission-abandon@example.com", "mission-abandon")

    user = db_session.query(User).filter(
        User.email == "mission-abandon@example.com").first()
    assert user is not None
    starting_credits = int(user.credits)

    accept = client.post(
        f"/api/missions/{state['mission_open_id']}/accept", headers=headers)
    assert accept.status_code == 200

    abandon = client.post(
        f"/api/missions/{state['mission_open_id']}/abandon",
        headers=headers,
    )
    assert abandon.status_code == 200
    payload = abandon.json()
    assert payload["status"] == "abandoned"
    assert payload["credits_after"] == starting_credits

    mine = client.get("/api/missions/me", headers=headers)
    assert mine.status_code == 200
    my_payload = mine.json()
    assert len(my_payload) == 1
    assert my_payload[0]["status"] == "abandoned"
    assert my_payload[0]["completed_at"] is not None

    duplicate = client.post(
        f"/api/missions/{state['mission_open_id']}/abandon",
        headers=headers,
    )
    assert duplicate.status_code == 409


def test_missions_available_requires_station_when_not_docked(client, db_session):
    seed_mission_world(db_session)
    headers = auth_headers_for(client, "deep-space@example.com", "deep-space")

    user = db_session.query(User).filter(
        User.email == "deep-space@example.com").first()
    assert user is not None
    user.location_type = "deep-space"
    user.location_id = None
    db_session.commit()

    response = client.get("/api/missions/available", headers=headers)
    assert response.status_code == 422


def test_create_dummy_mission_for_station(client, db_session):
    state = seed_mission_world(db_session)
    headers = auth_headers_for(
        client, "dummy-mission@example.com", "dummy-mission")

    create = client.post(
        f"/api/missions/dev/dummy?station_id={state['station_id']}",
        headers=headers,
    )
    assert create.status_code == 200
    payload = create.json()
    assert payload["station_id"] == state["station_id"]
    assert payload["station_name"] == "Mission Port"
    assert payload["title"] == "Dummy Test Mission"
    assert payload["created"] is True

    create_again = client.post(
        f"/api/missions/dev/dummy?station_id={state['station_id']}",
        headers=headers,
    )
    assert create_again.status_code == 200
    payload_again = create_again.json()
    assert payload_again["mission_id"] == payload["mission_id"]
    assert payload_again["station_name"] == "Mission Port"
    assert payload_again["created"] is False
