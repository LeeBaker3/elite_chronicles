from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.user import User
from app.models.ship import Ship
from app.models.world import (
    Commodity,
    Faction,
    StarSystem,
    Station,
    StationArchetype,
    StationInventory,
)
from app.services.auth_service import hash_password


def get_or_create_faction(db: Session) -> Faction:
    faction = db.query(Faction).filter(Faction.name == "Pilots Guild").first()
    if faction:
        return faction
    faction = Faction(name="Pilots Guild",
                      alignment="neutral", reputation_scale=0)
    db.add(faction)
    db.commit()
    db.refresh(faction)
    return faction


def get_or_create_system(db: Session, faction_id: int) -> StarSystem:
    system = db.query(StarSystem).filter(
        StarSystem.name == "Vega Prime").first()
    if system:
        return system
    system = StarSystem(
        name="Vega Prime",
        seed="vega-prime-001",
        position_x=0,
        position_y=0,
        position_z=0,
        economy_type="industrial",
        tech_level=6,
        faction_id=faction_id,
    )
    db.add(system)
    db.commit()
    db.refresh(system)
    return system


def get_or_create_archetype(db: Session) -> StationArchetype:
    archetype = (
        db.query(StationArchetype)
        .filter(StationArchetype.name == "Coriolis Hub")
        .first()
    )
    if archetype:
        return archetype
    archetype = StationArchetype(
        name="Coriolis Hub",
        size_class="medium",
        shape="coriolis",
        palette_json={"primary": "#2bb3ff", "accent": "#ffb347"},
        features_json={"docking_slots": 12, "market": True},
    )
    db.add(archetype)
    db.commit()
    db.refresh(archetype)
    return archetype


def get_or_create_station(
    db: Session, system_id: int, archetype_id: int, faction_id: int
) -> Station:
    station = db.query(Station).filter(
        Station.name == "Vega Tradeport").first()
    if station:
        return station
    station = Station(
        system_id=system_id,
        name="Vega Tradeport",
        archetype_id=archetype_id,
        position_x=1000,
        position_y=0,
        position_z=0,
        services_json={"market": True, "repairs": True, "upgrades": True},
        faction_id=faction_id,
        tech_level=5,
        ai_story_available=True,
    )
    db.add(station)
    db.commit()
    db.refresh(station)
    return station


def get_or_create_commodities(db: Session) -> list[Commodity]:
    definitions = [
        ("Food", "agricultural", 100, 10, False),
        ("Alloys", "industrial", 250, 15, False),
        ("Medical Supplies", "medical", 400, 12, False),
        ("Narcotics", "illegal", 1200, 30, True),
    ]
    created = []
    for name, category, base_price, volatility, illegal_flag in definitions:
        commodity = db.query(Commodity).filter(Commodity.name == name).first()
        if commodity:
            created.append(commodity)
            continue
        commodity = Commodity(
            name=name,
            category=category,
            base_price=base_price,
            volatility=volatility,
            illegal_flag=illegal_flag,
        )
        db.add(commodity)
        db.commit()
        db.refresh(commodity)
        created.append(commodity)
    return created


def ensure_inventory(
    db: Session, station_id: int, commodities: list[Commodity]
) -> None:
    for commodity in commodities:
        existing = (
            db.query(StationInventory)
            .filter(
                StationInventory.station_id == station_id,
                StationInventory.commodity_id == commodity.id,
            )
            .first()
        )
        if existing:
            continue
        inventory = StationInventory(
            station_id=station_id,
            commodity_id=commodity.id,
            quantity=50,
            max_capacity=200,
            buy_price=commodity.base_price,
            sell_price=int(commodity.base_price * 1.2),
        )
        db.add(inventory)
    db.commit()


def get_or_create_user(db: Session, faction_id: int) -> User:
    user = db.query(User).filter(User.email == "pilot@elite.local").first()
    if user:
        return user
    user = User(
        email="pilot@elite.local",
        username="pilot",
        password_hash=hash_password("pilot123"),
        credits=5000,
        faction_id=faction_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_or_create_ship(db: Session, user_id: int, station_id: int) -> Ship:
    ship = db.query(Ship).filter(Ship.owner_user_id == user_id).first()
    if ship:
        if ship.cargo_capacity <= 0:
            ship.cargo_capacity = 40
            db.commit()
            db.refresh(ship)
        return ship
    ship = Ship(
        owner_user_id=user_id,
        name="Cobra Mk I",
        hull_max=100,
        hull_current=100,
        shields_max=50,
        shields_current=50,
        energy_cap=60,
        energy_current=60,
        fuel_cap=100,
        fuel_current=100,
        cargo_capacity=40,
        status="docked",
        docked_station_id=station_id,
    )
    db.add(ship)
    db.commit()
    db.refresh(ship)
    return ship


def run_seed() -> None:
    db = SessionLocal()
    try:
        faction = get_or_create_faction(db)
        system = get_or_create_system(db, faction.id)
        archetype = get_or_create_archetype(db)
        station = get_or_create_station(
            db, system.id, archetype.id, faction.id)
        commodities = get_or_create_commodities(db)
        ensure_inventory(db, station.id, commodities)
        user = get_or_create_user(db, faction.id)
        get_or_create_ship(db, user.id, station.id)
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
    print("Seed complete.")
