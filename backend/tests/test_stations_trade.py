from app.models.world import (
    Commodity,
    Faction,
    StarSystem,
    Station,
    StationArchetype,
    StationInventory,
)
from app.models.ship import Ship
from app.models.user import User
from app.models.cargo import ShipCargo


def seed_inventory(db, quantity: int = 10):
    faction = Faction(name="Test Faction",
                      alignment="neutral", reputation_scale=0)
    db.add(faction)
    db.flush()

    system = StarSystem(
        name="Test System",
        seed="test-seed",
        position_x=0,
        position_y=0,
        position_z=0,
        economy_type="mixed",
        tech_level=1,
        faction_id=faction.id,
    )
    db.add(system)
    db.flush()

    archetype = StationArchetype(
        name="Test Hub",
        size_class="small",
        shape="coriolis",
        palette_json={},
        features_json={},
    )
    db.add(archetype)
    db.flush()

    station = Station(
        system_id=system.id,
        name="Test Station",
        archetype_id=archetype.id,
        position_x=1,
        position_y=2,
        position_z=3,
        services_json={"market": True},
        faction_id=faction.id,
        tech_level=1,
        ai_story_available=False,
    )
    db.add(station)
    db.flush()

    commodity = Commodity(
        name="Test Ore",
        category="industrial",
        base_price=100,
        volatility=0,
        illegal_flag=False,
    )
    db.add(commodity)
    db.flush()

    inventory = StationInventory(
        station_id=station.id,
        commodity_id=commodity.id,
        quantity=quantity,
        max_capacity=200,
        buy_price=100,
        sell_price=120,
    )
    db.add(inventory)
    db.commit()

    return station.id, commodity.id


def seed_inventory_with_ship(db, quantity: int = 10, cargo_capacity: int = 5):
    station_id, commodity_id = seed_inventory(db, quantity=quantity)

    user = User(
        email="shiptest@example.com",
        username="shiptest",
        password_hash="hash",
        status="active",
    )
    db.add(user)
    db.flush()

    ship = Ship(
        owner_user_id=user.id,
        name="Test Ship",
        hull_max=100,
        hull_current=100,
        shields_max=100,
        shields_current=100,
        energy_cap=100,
        energy_current=100,
        fuel_cap=100,
        fuel_current=100,
        cargo_capacity=cargo_capacity,
        status="docked",
        docked_station_id=station_id,
    )
    db.add(ship)
    db.commit()

    return station_id, commodity_id, ship.id


def test_trade_buy_reduces_inventory(client, db_session):
    station_id, commodity_id = seed_inventory(db_session, quantity=10)

    response = client.post(
        f"/api/stations/{station_id}/trade",
        json={"commodity_id": commodity_id, "qty": 3, "direction": "buy"},
    )

    assert response.status_code == 200
    assert response.json()["remaining"] == 7


def test_trade_buy_insufficient_stock(client, db_session):
    station_id, commodity_id = seed_inventory(db_session, quantity=2)

    response = client.post(
        f"/api/stations/{station_id}/trade",
        json={"commodity_id": commodity_id, "qty": 5, "direction": "buy"},
    )

    assert response.status_code == 409


def test_trade_invalid_direction(client, db_session):
    station_id, commodity_id = seed_inventory(db_session, quantity=2)

    response = client.post(
        f"/api/stations/{station_id}/trade",
        json={"commodity_id": commodity_id, "qty": 1, "direction": "invalid"},
    )

    assert response.status_code == 422


def test_trade_buy_fails_when_cargo_full(client, db_session):
    station_id, commodity_id, ship_id = seed_inventory_with_ship(
        db_session,
        quantity=10,
        cargo_capacity=2,
    )

    response = client.post(
        f"/api/stations/{station_id}/trade",
        json={
            "ship_id": ship_id,
            "commodity_id": commodity_id,
            "qty": 3,
            "direction": "buy",
        },
    )

    assert response.status_code == 409
    assert response.json()["error"]["message"] == "Cargo hold is full"


def test_trade_sell_fails_when_insufficient_cargo(client, db_session):
    station_id, commodity_id, ship_id = seed_inventory_with_ship(
        db_session,
        quantity=10,
        cargo_capacity=10,
    )

    response = client.post(
        f"/api/stations/{station_id}/trade",
        json={
            "ship_id": ship_id,
            "commodity_id": commodity_id,
            "qty": 1,
            "direction": "sell",
        },
    )

    assert response.status_code == 409
    assert response.json()["error"]["message"] == "Insufficient cargo"


def test_trade_buy_then_sell_updates_cargo(client, db_session):
    station_id, commodity_id, ship_id = seed_inventory_with_ship(
        db_session,
        quantity=10,
        cargo_capacity=10,
    )

    buy = client.post(
        f"/api/stations/{station_id}/trade",
        json={
            "ship_id": ship_id,
            "commodity_id": commodity_id,
            "qty": 4,
            "direction": "buy",
        },
    )
    assert buy.status_code == 200

    cargo_after_buy = (
        db_session.query(ShipCargo)
        .filter(
            ShipCargo.ship_id == ship_id,
            ShipCargo.commodity_id == commodity_id,
        )
        .first()
    )
    assert cargo_after_buy is not None
    assert cargo_after_buy.quantity == 4

    sell = client.post(
        f"/api/stations/{station_id}/trade",
        json={
            "ship_id": ship_id,
            "commodity_id": commodity_id,
            "qty": 2,
            "direction": "sell",
        },
    )
    assert sell.status_code == 200

    cargo_after_sell = (
        db_session.query(ShipCargo)
        .filter(
            ShipCargo.ship_id == ship_id,
            ShipCargo.commodity_id == commodity_id,
        )
        .first()
    )
    assert cargo_after_sell is not None
    assert cargo_after_sell.quantity == 2
