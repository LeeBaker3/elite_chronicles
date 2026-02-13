"""User-oriented API smoke flow tests."""

import time

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


def seed_user_flow_data(db_session):
    """Create minimal world, market, and ship data for smoke flow tests."""
    faction = Faction(name="Smoke Faction",
                      alignment="neutral", reputation_scale=0)
    db_session.add(faction)
    db_session.flush()

    system = StarSystem(
        name="Smoke System",
        seed="smoke-seed",
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
        name="Smoke Hub",
        size_class="small",
        shape="coriolis",
        palette_json={},
        features_json={"market": True},
    )
    db_session.add(archetype)
    db_session.flush()

    station = Station(
        system_id=system.id,
        name="Smoke Tradeport",
        archetype_id=archetype.id,
        position_x=0,
        position_y=0,
        position_z=0,
        services_json={"market": True},
        faction_id=faction.id,
        tech_level=3,
        ai_story_available=True,
    )
    db_session.add(station)
    db_session.flush()

    commodity = Commodity(
        name="Smoke Ore",
        category="industrial",
        base_price=100,
        volatility=5,
        illegal_flag=False,
    )
    db_session.add(commodity)
    db_session.flush()

    inventory = StationInventory(
        station_id=station.id,
        commodity_id=commodity.id,
        quantity=25,
        max_capacity=200,
        buy_price=100,
        sell_price=120,
    )
    db_session.add(inventory)

    user = User(
        email="smoke-ship@example.com",
        username="smoke-ship",
        password_hash="hash",
        status="active",
    )
    db_session.add(user)
    db_session.flush()

    ship = Ship(
        owner_user_id=user.id,
        name="Smoke Runner",
        hull_max=100,
        hull_current=100,
        shields_max=100,
        shields_current=100,
        energy_cap=100,
        energy_current=100,
        fuel_cap=100,
        fuel_current=100,
        cargo_capacity=10,
        status="docked",
        docked_station_id=station.id,
    )
    db_session.add(ship)
    db_session.commit()

    return station.id, commodity.id, ship.id


def test_user_smoke_flow(client, db_session):
    """Verify a full user API flow across auth, market, cargo, and story."""
    station_id, commodity_id, ship_id = seed_user_flow_data(db_session)

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    stamp = int(time.time())
    register = client.post(
        "/api/auth/register",
        json={
            "email": f"smoke_{stamp}@elite.local",
            "username": f"smoke_{stamp}",
            "password": "pilot123",
        },
    )
    assert register.status_code == 200
    token = register.json()["token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    stations = client.get("/api/stations")
    assert stations.status_code == 200
    assert isinstance(stations.json(), list)
    assert any(item["id"] == station_id for item in stations.json())

    inventory = client.get(f"/api/stations/{station_id}/inventory")
    assert inventory.status_code == 200
    assert isinstance(inventory.json(), list)

    story_start = client.post(
        f"/api/story/start/{station_id}",
        headers=auth_headers,
    )
    assert story_start.status_code == 200
    assert "session_id" in story_start.json()

    story_sessions = client.get("/api/story/sessions", headers=auth_headers)
    assert story_sessions.status_code == 200
    assert isinstance(story_sessions.json(), list)

    cargo = client.get(f"/api/ships/{ship_id}/cargo")
    assert cargo.status_code == 200
    assert "cargo_capacity" in cargo.json()

    trade = client.post(
        f"/api/stations/{station_id}/trade",
        json={
            "ship_id": ship_id,
            "commodity_id": commodity_id,
            "qty": 1,
            "direction": "buy",
        },
        headers=auth_headers,
    )
    assert trade.status_code in (200, 409)
