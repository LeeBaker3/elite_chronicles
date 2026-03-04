from app.models.world import StarSystem

from test_players_ships_markets import auth_headers_for
from test_players_ships_markets import seed_core_state
from app.models.user import User


def test_galaxy_systems_include_dataset_source_metadata(client, db_session):
    headers = auth_headers_for(
        client, "galaxy-meta@example.com", "galaxy-meta")
    owner = db_session.query(User).filter(
        User.email == "galaxy-meta@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    response = client.get(
        f"/api/systems/galaxy/systems?ship_id={state['ship_id']}",
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["dataset_source"]["mode"] == "canonical"
    assert payload["dataset_source"]["source_name"] == "elite-canonical"
    assert isinstance(payload["systems"], list)


def test_galaxy_systems_accept_real_inspired_dataset_mode(client, db_session):
    headers = auth_headers_for(
        client, "galaxy-real@example.com", "galaxy-real")
    owner = db_session.query(User).filter(
        User.email == "galaxy-real@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    response = client.get(
        f"/api/systems/galaxy/systems?ship_id={state['ship_id']}&dataset_mode=real_inspired",
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["dataset_source"]["mode"] == "real_inspired"


def test_galaxy_overview_returns_multihop_route_for_range_limited_target(
    client,
    db_session,
):
    headers = auth_headers_for(
        client, "galaxy-route@example.com", "galaxy-route")
    owner = db_session.query(User).filter(
        User.email == "galaxy-route@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    core_system = db_session.query(StarSystem).filter(
        StarSystem.id == state["system_id"]
    ).first()
    assert core_system is not None

    relay_system = StarSystem(
        name="Relay System",
        seed="relay-seed",
        position_x=320,
        position_y=0,
        position_z=0,
        economy_type="mixed",
        tech_level=3,
        faction_id=core_system.faction_id,
        generation_version=1,
    )
    destination_system = StarSystem(
        name="Outer Destination",
        seed="outer-seed",
        position_x=620,
        position_y=0,
        position_z=0,
        economy_type="mixed",
        tech_level=4,
        faction_id=core_system.faction_id,
        generation_version=1,
    )
    db_session.add_all([relay_system, destination_system])
    db_session.commit()

    response = client.get(
        (
            "/api/systems/galaxy/systems/"
            f"{destination_system.id}/overview?ship_id={state['ship_id']}"
        ),
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["jump"]["reachable"] is False
    assert payload["jump"]["reason"] == "range-limit"
    assert payload["jump"]["route_hops"]
    assert payload["jump"]["route_hop_names"]
    assert payload["jump"]["route_hop_names"][-1] == "Outer Destination"


def test_galaxy_endpoints_reject_invalid_dataset_mode(client, db_session):
    headers = auth_headers_for(
        client, "galaxy-invalid@example.com", "galaxy-invalid")
    owner = db_session.query(User).filter(
        User.email == "galaxy-invalid@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    systems_response = client.get(
        (
            "/api/systems/galaxy/systems"
            f"?ship_id={state['ship_id']}&dataset_mode=bad_mode"
        ),
        headers=headers,
    )
    assert systems_response.status_code == 422

    overview_response = client.get(
        (
            "/api/systems/galaxy/systems/"
            f"{state['system_id']}/overview?ship_id={state['ship_id']}&dataset_mode=bad_mode"
        ),
        headers=headers,
    )
    assert overview_response.status_code == 422
