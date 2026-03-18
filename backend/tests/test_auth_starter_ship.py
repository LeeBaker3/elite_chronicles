from app.models.ship import Ship
from app.models.user import User
from app.models.world import Faction, StarSystem, Station, StationArchetype
from app.core.config import settings
from app.services.auth_service import hash_password


def seed_station(db_session) -> int:
    """Create minimal world state required for docking starter ships."""
    faction = Faction(name="Auth Faction",
                      alignment="neutral", reputation_scale=0)
    db_session.add(faction)
    db_session.flush()

    system = StarSystem(
        name="Auth System",
        seed="auth-seed",
        position_x=0,
        position_y=0,
        position_z=0,
        economy_type="mixed",
        tech_level=2,
        faction_id=faction.id,
    )
    db_session.add(system)
    db_session.flush()

    archetype = StationArchetype(
        name="Auth Hub",
        size_class="small",
        shape="coriolis",
        palette_json={},
        features_json={"market": True},
    )
    db_session.add(archetype)
    db_session.flush()

    station = Station(
        system_id=system.id,
        name="Auth Tradeport",
        archetype_id=archetype.id,
        position_x=0,
        position_y=0,
        position_z=0,
        services_json={"market": True},
        faction_id=faction.id,
        tech_level=2,
        ai_story_available=False,
    )
    db_session.add(station)
    db_session.commit()
    return station.id


def test_register_creates_starter_ship_with_cargo(client, db_session):
    station_id = seed_station(db_session)

    response = client.post(
        "/api/auth/register",
        json={
            "email": "starter@example.com",
            "username": "starter",
            "password": "pilot123",
        },
    )

    assert response.status_code == 200
    user_id = response.json()["user_id"]

    user = db_session.query(User).filter(User.id == user_id).first()
    ship = db_session.query(Ship).filter(Ship.owner_user_id == user_id).first()
    assert user is not None
    assert ship is not None
    assert user.credits == settings.starter_credits
    assert ship.cargo_capacity == settings.starter_ship_cargo_capacity
    assert ship.status == "docked"
    assert ship.docked_station_id == station_id


def test_login_backfills_cargo_hold_for_existing_ship(client, db_session):
    station_id = seed_station(db_session)

    user = User(
        email="legacy@example.com",
        username="legacy",
        password_hash=hash_password("pilot123"),
        status="active",
    )
    db_session.add(user)
    db_session.flush()

    ship = Ship(
        owner_user_id=user.id,
        name="Legacy Ship",
        hull_max=100,
        hull_current=100,
        shields_max=50,
        shields_current=50,
        energy_cap=60,
        energy_current=60,
        fuel_cap=100,
        fuel_current=100,
        cargo_capacity=0,
        status="docked",
        docked_station_id=station_id,
    )
    db_session.add(ship)
    db_session.commit()

    response = client.post(
        "/api/auth/login",
        json={
            "email": "legacy@example.com",
            "password": "pilot123",
        },
    )

    assert response.status_code == 200

    db_session.refresh(ship)
    assert ship.cargo_capacity == settings.starter_ship_cargo_capacity


def test_register_prefers_lave_as_starter_system_when_available(client, db_session):
    faction = Faction(name="Lave Faction",
                      alignment="neutral", reputation_scale=0)
    db_session.add(faction)
    db_session.flush()

    lave_system = StarSystem(
        name="Lave",
        seed="lave-seed",
        position_x=0,
        position_y=0,
        position_z=0,
        economy_type="mixed",
        tech_level=5,
        faction_id=faction.id,
    )
    other_system = StarSystem(
        name="Other System",
        seed="other-seed",
        position_x=10,
        position_y=0,
        position_z=10,
        economy_type="mixed",
        tech_level=3,
        faction_id=faction.id,
    )
    db_session.add_all([lave_system, other_system])
    db_session.flush()

    archetype = StationArchetype(
        name="Starter Hub",
        size_class="small",
        shape="coriolis",
        palette_json={},
        features_json={"market": True},
    )
    db_session.add(archetype)
    db_session.flush()

    other_station = Station(
        system_id=other_system.id,
        name="Other Port",
        archetype_id=archetype.id,
        position_x=0,
        position_y=0,
        position_z=0,
        services_json={"market": True},
        faction_id=faction.id,
        tech_level=2,
        ai_story_available=False,
    )
    lave_station = Station(
        system_id=lave_system.id,
        name="Lave Station",
        archetype_id=archetype.id,
        position_x=5,
        position_y=0,
        position_z=5,
        services_json={"market": True},
        faction_id=faction.id,
        tech_level=5,
        ai_story_available=False,
    )
    db_session.add_all([other_station, lave_station])
    db_session.commit()

    response = client.post(
        "/api/auth/register",
        json={
            "email": "lave-starter@example.com",
            "username": "lave-starter",
            "password": "pilot123",
        },
    )
    assert response.status_code == 200

    user_id = response.json()["user_id"]
    ship = db_session.query(Ship).filter(Ship.owner_user_id == user_id).first()
    assert ship is not None
    assert ship.docked_station_id == lave_station.id
