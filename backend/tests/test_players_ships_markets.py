from app.models.ship import Ship
from app.models.user import User
from app.models.world import (
    Commodity,
    Faction,
    StarSystem,
    Station,
    StationArchetype,
    StationInventory,
)


def seed_core_state(db_session, owner_user_id: int | None = None):
    faction = Faction(name="Core Faction", alignment="neutral", reputation_scale=0)
    db_session.add(faction)
    db_session.flush()

    system = StarSystem(
        name="Core System",
        seed="core-seed",
        position_x=0,
        position_y=0,
        position_z=0,
        economy_type="mixed",
        tech_level=3,
        faction_id=faction.id,
    )
    db_session.add(system)
    db_session.flush()

    archetype = StationArchetype(
        name="Core Hub",
        size_class="medium",
        shape="coriolis",
        palette_json={},
        features_json={"market": True},
    )
    db_session.add(archetype)
    db_session.flush()

    station_1 = Station(
        system_id=system.id,
        name="Core Station A",
        archetype_id=archetype.id,
        position_x=0,
        position_y=0,
        position_z=0,
        services_json={"market": True},
        faction_id=faction.id,
        tech_level=3,
        ai_story_available=True,
    )
    station_2 = Station(
        system_id=system.id,
        name="Core Station B",
        archetype_id=archetype.id,
        position_x=10,
        position_y=0,
        position_z=0,
        services_json={"market": True},
        faction_id=faction.id,
        tech_level=3,
        ai_story_available=False,
    )
    db_session.add_all([station_1, station_2])
    db_session.flush()

    commodity = Commodity(
        name="Core Alloy",
        category="industrial",
        base_price=120,
        volatility=4,
        illegal_flag=False,
    )
    db_session.add(commodity)
    db_session.flush()

    db_session.add_all(
        [
            StationInventory(
                station_id=station_1.id,
                commodity_id=commodity.id,
                quantity=10,
                max_capacity=100,
                buy_price=120,
                sell_price=140,
            ),
            StationInventory(
                station_id=station_2.id,
                commodity_id=commodity.id,
                quantity=95,
                max_capacity=100,
                buy_price=122,
                sell_price=142,
            ),
        ]
    )

    if owner_user_id is None:
        owner = User(
            email="owner-seed@example.com",
            username="owner-seed",
            password_hash="hash",
            status="active",
            credits=5000,
        )
        db_session.add(owner)
        db_session.flush()
        owner_id = owner.id
    else:
        owner_id = owner_user_id

    ship = Ship(
        owner_user_id=owner_id,
        name="Core Runner",
        hull_max=100,
        hull_current=100,
        shields_max=100,
        shields_current=100,
        energy_cap=100,
        energy_current=100,
        fuel_cap=120,
        fuel_current=30,
        cargo_capacity=20,
        status="docked",
        docked_station_id=station_1.id,
    )
    db_session.add(ship)
    db_session.commit()

    return {
        "system_id": system.id,
        "station_1_id": station_1.id,
        "station_2_id": station_2.id,
        "ship_id": ship.id,
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


def test_players_me_requires_auth(client):
    response = client.get("/api/players/me")
    assert response.status_code == 401


def test_players_me_returns_profile(client, auth_headers):
    response = client.get("/api/players/me", headers=auth_headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["email"] == "pilot@example.com"
    assert payload["username"] == "pilot"
    assert payload["is_alive"] is True


def test_ship_undock_and_refuel_flow(client, db_session):
    headers = auth_headers_for(client, "owner@example.com", "owner")
    owner = db_session.query(User).filter(User.email == "owner@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)

    undock = client.post(f"/api/ships/{state['ship_id']}/undock", headers=headers)
    assert undock.status_code == 200
    assert undock.json()["status"] == "in-space"

    refuel_while_undocked = client.post(
        f"/api/ships/{state['ship_id']}/refuel",
        json={},
        headers=headers,
    )
    assert refuel_while_undocked.status_code == 409

    dock = client.post(
        f"/api/ships/{state['ship_id']}/dock",
        json={"station_id": state["station_2_id"]},
        headers=headers,
    )
    assert dock.status_code == 200
    assert dock.json()["status"] == "docked"
    assert dock.json()["docked_station_id"] == state["station_2_id"]

    refuel = client.post(
        f"/api/ships/{state['ship_id']}/refuel",
        json={"amount": 40},
        headers=headers,
    )
    assert refuel.status_code == 200
    assert refuel.json()["fuel_current"] == 70



def test_ship_ops_forbid_non_owner(client, db_session):
    owner_headers = auth_headers_for(client, "owner@example.com", "owner")
    owner = db_session.query(User).filter(User.email == "owner@example.com").first()
    assert owner is not None
    state = seed_core_state(db_session, owner_user_id=owner.id)
    intruder_headers = auth_headers_for(client, "intruder@example.com", "intruder")

    owner_probe = client.get(f"/api/ships/{state['ship_id']}", headers=owner_headers)
    assert owner_probe.status_code == 200

    response = client.post(
        f"/api/ships/{state['ship_id']}/undock",
        headers=intruder_headers,
    )
    assert response.status_code == 403



def test_market_summary_returns_station_rows(client, db_session):
    state = seed_core_state(db_session)

    response = client.get(f"/api/markets/{state['system_id']}/summary")
    assert response.status_code == 200
    payload = response.json()

    assert len(payload) == 2
    station_a = next(item for item in payload if item["station_id"] == state["station_1_id"])
    assert station_a["commodity_count"] == 1
    assert station_a["scarcity_count"] == 1
