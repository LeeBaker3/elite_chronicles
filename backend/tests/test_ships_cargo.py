from app.models.cargo import ShipCargo
from app.models.ship import Ship
from app.models.user import User
from app.models.world import (
    Commodity,
    Faction,
    StarSystem,
    Station,
    StationArchetype,
)


def seed_ship_with_cargo(db):
    faction = Faction(name="Cargo Faction",
                      alignment="neutral", reputation_scale=0)
    db.add(faction)
    db.flush()

    system = StarSystem(
        name="Cargo System",
        seed="cargo-seed",
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
        name="Cargo Hub",
        size_class="small",
        shape="coriolis",
        palette_json={},
        features_json={},
    )
    db.add(archetype)
    db.flush()

    station = Station(
        system_id=system.id,
        name="Cargo Station",
        archetype_id=archetype.id,
        position_x=0,
        position_y=0,
        position_z=0,
        services_json={"market": True},
        faction_id=faction.id,
        tech_level=1,
        ai_story_available=False,
    )
    db.add(station)
    db.flush()

    commodity = Commodity(
        name="Cargo Ore",
        category="industrial",
        base_price=100,
        volatility=0,
        illegal_flag=False,
    )
    db.add(commodity)
    db.flush()

    user = User(
        email="cargo-user@example.com",
        username="cargo-user",
        password_hash="hash",
        status="active",
    )
    db.add(user)
    db.flush()

    ship = Ship(
        owner_user_id=user.id,
        name="Cargo Ship",
        hull_max=100,
        hull_current=100,
        shields_max=100,
        shields_current=100,
        energy_cap=100,
        energy_current=100,
        fuel_cap=100,
        fuel_current=100,
        cargo_capacity=12,
        status="docked",
        docked_station_id=station.id,
    )
    db.add(ship)
    db.flush()

    cargo = ShipCargo(
        ship_id=ship.id,
        commodity_id=commodity.id,
        quantity=5,
    )
    db.add(cargo)
    db.commit()

    return ship.id


def test_get_ship_includes_cargo_capacity(client, db_session):
    ship_id = seed_ship_with_cargo(db_session)

    response = client.get(f"/api/ships/{ship_id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["cargo_capacity"] == 12


def test_get_ship_cargo_summary(client, db_session):
    ship_id = seed_ship_with_cargo(db_session)

    response = client.get(f"/api/ships/{ship_id}/cargo")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ship_id"] == ship_id
    assert payload["cargo_capacity"] == 12
    assert payload["cargo_used"] == 5
    assert payload["cargo_free"] == 7
    assert len(payload["items"]) == 1
    assert payload["items"][0]["commodity_name"] == "Cargo Ore"
