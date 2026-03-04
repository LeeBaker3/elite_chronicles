from app.models.cargo import ShipCargo
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


def seed_inventory_with_ship(
    db,
    quantity: int = 10,
    cargo_capacity: int = 5,
    owner_user_id: int | None = None,
):
    station_id, commodity_id = seed_inventory(db, quantity=quantity)

    if owner_user_id is None:
        user = User(
            email="shiptest@example.com",
            username="shiptest",
            password_hash="hash",
            status="active",
        )
        db.add(user)
        db.flush()
        owner_id = user.id
    else:
        owner_id = owner_user_id

    ship = Ship(
        owner_user_id=owner_id,
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
    payload = response.json()
    token = payload["token"]
    return {"Authorization": f"Bearer {token}"}, payload["user_id"]


def test_trade_requires_authentication(client, db_session):
    station_id, commodity_id = seed_inventory(db_session, quantity=10)

    response = client.post(
        f"/api/stations/{station_id}/trade",
        json={
            "commodity_id": commodity_id,
            "qty": 1,
            "direction": "buy",
        },
    )

    assert response.status_code == 401


def test_trade_buy_reduces_inventory_and_credits(client, db_session):
    headers, user_id = auth_headers_for(
        client, "trader-1@example.com", "trader-1")
    station_id, commodity_id, ship_id = seed_inventory_with_ship(
        db_session,
        quantity=10,
        owner_user_id=user_id,
    )
    user = db_session.query(User).filter(User.id == user_id).first()
    assert user is not None
    user.credits = 5_000
    db_session.commit()

    response = client.post(
        f"/api/stations/{station_id}/trade",
        json={
            "ship_id": ship_id,
            "commodity_id": commodity_id,
            "qty": 3,
            "direction": "buy",
        },
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["remaining"] == 7
    assert response.json()["credits"] == 4_700


def test_trade_buy_insufficient_stock(client, db_session):
    headers, user_id = auth_headers_for(
        client, "trader-2@example.com", "trader-2")
    station_id, commodity_id, ship_id = seed_inventory_with_ship(
        db_session,
        quantity=2,
        owner_user_id=user_id,
    )
    user = db_session.query(User).filter(User.id == user_id).first()
    assert user is not None
    user.credits = 5_000
    db_session.commit()

    response = client.post(
        f"/api/stations/{station_id}/trade",
        json={
            "ship_id": ship_id,
            "commodity_id": commodity_id,
            "qty": 5,
            "direction": "buy",
        },
        headers=headers,
    )

    assert response.status_code == 409


def test_trade_buy_fails_with_insufficient_credits(client, db_session):
    headers, user_id = auth_headers_for(
        client, "low-credits@example.com", "low-credits")
    station_id, commodity_id, ship_id = seed_inventory_with_ship(
        db_session,
        quantity=10,
        owner_user_id=user_id,
    )
    user = db_session.query(User).filter(User.id == user_id).first()
    assert user is not None
    user.credits = 50
    db_session.commit()

    response = client.post(
        f"/api/stations/{station_id}/trade",
        json={
            "ship_id": ship_id,
            "commodity_id": commodity_id,
            "qty": 1,
            "direction": "buy",
        },
        headers=headers,
    )

    assert response.status_code == 409
    assert response.json()["error"]["message"] == "Insufficient credits"


def test_trade_invalid_direction(client, db_session):
    headers, user_id = auth_headers_for(
        client, "trader-3@example.com", "trader-3")
    station_id, commodity_id, ship_id = seed_inventory_with_ship(
        db_session,
        quantity=2,
        owner_user_id=user_id,
    )

    response = client.post(
        f"/api/stations/{station_id}/trade",
        json={
            "ship_id": ship_id,
            "commodity_id": commodity_id,
            "qty": 1,
            "direction": "invalid",
        },
        headers=headers,
    )

    assert response.status_code == 422


def test_trade_rejects_non_owner_ship(client, db_session):
    owner_headers, owner_id = auth_headers_for(
        client,
        "owner-trade@example.com",
        "owner-trade",
    )
    station_id, commodity_id, ship_id = seed_inventory_with_ship(
        db_session,
        quantity=10,
        owner_user_id=owner_id,
    )
    owner = db_session.query(User).filter(User.id == owner_id).first()
    assert owner is not None
    owner.credits = 5_000
    db_session.commit()

    intruder_headers, _intruder_id = auth_headers_for(
        client,
        "intruder-trade@example.com",
        "intruder-trade",
    )

    probe = client.post(
        f"/api/stations/{station_id}/trade",
        json={
            "ship_id": ship_id,
            "commodity_id": commodity_id,
            "qty": 1,
            "direction": "buy",
        },
        headers=owner_headers,
    )
    assert probe.status_code == 200

    response = client.post(
        f"/api/stations/{station_id}/trade",
        json={
            "ship_id": ship_id,
            "commodity_id": commodity_id,
            "qty": 1,
            "direction": "buy",
        },
        headers=intruder_headers,
    )

    assert response.status_code == 403


def test_trade_buy_fails_when_cargo_full(client, db_session):
    headers, user_id = auth_headers_for(
        client, "trader-4@example.com", "trader-4")
    station_id, commodity_id, ship_id = seed_inventory_with_ship(
        db_session,
        quantity=10,
        cargo_capacity=2,
        owner_user_id=user_id,
    )
    user = db_session.query(User).filter(User.id == user_id).first()
    assert user is not None
    user.credits = 5_000
    db_session.commit()

    response = client.post(
        f"/api/stations/{station_id}/trade",
        json={
            "ship_id": ship_id,
            "commodity_id": commodity_id,
            "qty": 3,
            "direction": "buy",
        },
        headers=headers,
    )

    assert response.status_code == 409
    assert response.json()["error"]["message"] == "Cargo hold is full"


def test_inventory_lists_zero_stock_for_missing_station_rows(client, db_session):
    station_id, commodity_id = seed_inventory(db_session, quantity=10)

    extra_commodity = Commodity(
        name="Test Grain",
        category="agricultural",
        base_price=80,
        volatility=0,
        illegal_flag=False,
    )
    db_session.add(extra_commodity)
    db_session.commit()

    response = client.get(f"/api/stations/{station_id}/inventory")
    assert response.status_code == 200
    payload = response.json()

    by_id = {item["commodity_id"]: item for item in payload}
    assert commodity_id in by_id
    assert extra_commodity.id in by_id
    assert by_id[extra_commodity.id]["quantity"] == 0
    assert by_id[extra_commodity.id]["buy_price"] == extra_commodity.base_price
    assert by_id[extra_commodity.id]["sell_price"] == extra_commodity.base_price


def test_trade_sell_fails_when_insufficient_cargo(client, db_session):
    headers, user_id = auth_headers_for(
        client, "trader-5@example.com", "trader-5")
    station_id, commodity_id, ship_id = seed_inventory_with_ship(
        db_session,
        quantity=10,
        cargo_capacity=10,
        owner_user_id=user_id,
    )

    response = client.post(
        f"/api/stations/{station_id}/trade",
        json={
            "ship_id": ship_id,
            "commodity_id": commodity_id,
            "qty": 1,
            "direction": "sell",
        },
        headers=headers,
    )

    assert response.status_code == 409
    assert response.json()["error"]["message"] == "Insufficient cargo"


def test_trade_sell_creates_missing_station_inventory_row(client, db_session):
    headers, user_id = auth_headers_for(
        client, "trader-6b@example.com", "trader-6b")
    station_id, _commodity_id, ship_id = seed_inventory_with_ship(
        db_session,
        quantity=10,
        cargo_capacity=10,
        owner_user_id=user_id,
    )

    extra_commodity = Commodity(
        name="Test Luxury",
        category="luxury",
        base_price=250,
        volatility=0,
        illegal_flag=False,
    )
    db_session.add(extra_commodity)
    db_session.flush()

    cargo_row = ShipCargo(
        ship_id=ship_id,
        commodity_id=extra_commodity.id,
        quantity=3,
    )
    db_session.add(cargo_row)
    db_session.commit()

    response = client.post(
        f"/api/stations/{station_id}/trade",
        json={
            "ship_id": ship_id,
            "commodity_id": extra_commodity.id,
            "qty": 2,
            "direction": "sell",
        },
        headers=headers,
    )

    assert response.status_code == 200

    station_row = (
        db_session.query(StationInventory)
        .filter(
            StationInventory.station_id == station_id,
            StationInventory.commodity_id == extra_commodity.id,
        )
        .first()
    )
    assert station_row is not None
    assert station_row.quantity == 2


def test_trade_buy_then_sell_updates_cargo_and_credits(client, db_session):
    headers, user_id = auth_headers_for(
        client, "trader-6@example.com", "trader-6")
    station_id, commodity_id, ship_id = seed_inventory_with_ship(
        db_session,
        quantity=10,
        cargo_capacity=10,
        owner_user_id=user_id,
    )
    user = db_session.query(User).filter(User.id == user_id).first()
    assert user is not None
    user.credits = 5_000
    db_session.commit()

    buy = client.post(
        f"/api/stations/{station_id}/trade",
        json={
            "ship_id": ship_id,
            "commodity_id": commodity_id,
            "qty": 4,
            "direction": "buy",
        },
        headers=headers,
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
        headers=headers,
    )
    assert sell.status_code == 200
    assert sell.json()["credits"] == 4_840

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
