from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.user import User
from app.models.ship import Ship
from app.models.world import (
    Commodity,
    Faction,
    ShipArchetype,
    StarSystem,
    Station,
    StationArchetype,
    StationInventory,
)
from app.models.mission import Mission
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


def get_or_create_ship_archetype(db: Session) -> ShipArchetype:
    archetype = (
        db.query(ShipArchetype)
        .filter(ShipArchetype.key == "cobra-mk1")
        .first()
    )
    if archetype:
        return archetype
    archetype = ShipArchetype(
        key="cobra-mk1",
        name="Cobra Mk I",
        hull_class="light",
        archetype_version=1,
        render_profile_json={},
    )
    db.add(archetype)
    db.commit()
    db.refresh(archetype)
    return archetype


def get_or_create_stations(
    db: Session,
    system_id: int,
    archetype_id: int,
    faction_id: int,
) -> list[Station]:
    station_specs = [
        {
            "name": "Vega Tradeport",
            "legacy_names": [],
            "position": (1000, 0, 0),
            "services": {"market": True, "repairs": True, "upgrades": True},
            "tech_level": 5,
            "story": True,
        },
        {
            "name": "Vega Relay",
            "legacy_names": ["Vega Tradeport Annex"],
            "position": (1320, 0, 160),
            "services": {"market": True, "repairs": True},
            "tech_level": 4,
            "story": False,
        },
        {
            "name": "Vega Prospect",
            "legacy_names": [],
            "position": (1680, 0, -120),
            "services": {"market": True, "upgrades": True},
            "tech_level": 4,
            "story": False,
        },
    ]

    stations: list[Station] = []
    for spec in station_specs:
        station = (
            db.query(Station)
            .filter(
                Station.system_id == system_id,
                Station.name == spec["name"],
            )
            .first()
        )
        if station is None and spec["legacy_names"]:
            station = (
                db.query(Station)
                .filter(
                    Station.system_id == system_id,
                    Station.name.in_(spec["legacy_names"]),
                )
                .order_by(Station.id.asc())
                .first()
            )

        position_x, position_y, position_z = spec["position"]
        if station is None:
            station = Station(
                system_id=system_id,
                name=spec["name"],
                archetype_id=archetype_id,
                position_x=position_x,
                position_y=position_y,
                position_z=position_z,
                services_json=spec["services"],
                faction_id=faction_id,
                tech_level=spec["tech_level"],
                ai_story_available=spec["story"],
                render_seed=((int(system_id) * 40503) + (position_x * 131) + (position_z * 37)) % 2147483647 or 1,
            )
            db.add(station)
            db.commit()
            db.refresh(station)
        else:
            station.system_id = system_id
            station.name = spec["name"]
            station.archetype_id = archetype_id
            station.position_x = position_x
            station.position_y = position_y
            station.position_z = position_z
            station.services_json = spec["services"]
            station.faction_id = faction_id
            station.tech_level = spec["tech_level"]
            station.ai_story_available = spec["story"]
            if int(station.render_seed or 0) <= 0:
                station.render_seed = ((int(system_id) * 40503) + (position_x * 131) + (position_z * 37)) % 2147483647 or 1
            db.commit()
            db.refresh(station)

        stations.append(station)

    return stations


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
    db: Session,
    station_id: int,
    commodities: list[Commodity],
    buy_multiplier: float = 1.0,
    sell_multiplier: float = 1.2,
    quantity: int = 50,
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
            quantity=quantity,
            max_capacity=200,
            buy_price=int(commodity.base_price * buy_multiplier),
            sell_price=int(commodity.base_price * sell_multiplier),
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
        ship_seed = ((int(ship.id) * 1103515245) + 12345) % 2147483647 or 1
        if ship.cargo_capacity <= 0:
            ship.cargo_capacity = 40
        if int(ship.render_seed or 0) <= 0:
            ship.render_seed = ship_seed
        if ship.ship_archetype_id is None:
            cobra_archetype = get_or_create_ship_archetype(db)
            ship.ship_archetype_id = cobra_archetype.id
        db.commit()
        db.refresh(ship)
        return ship
    cobra_archetype = get_or_create_ship_archetype(db)
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
        ship_archetype_id=cobra_archetype.id,
        render_seed=((int(user_id) * 1103515245) + 12345) % 2147483647 or 1,
    )
    db.add(ship)
    db.commit()
    db.refresh(ship)
    return ship


def ensure_missions(db: Session, station_id: int, faction_id: int) -> None:
    definitions = [
        (
            "Courier Run",
            "Deliver encrypted dispatches to the orbital relay.",
            450,
        ),
        (
            "Medical Priority",
            "Secure and transfer emergency medical supplies.",
            700,
        ),
        (
            "Hull Parts Pickup",
            "Collect structural parts for shipyard repair queues.",
            520,
        ),
    ]

    for title, description, reward_credits in definitions:
        existing = (
            db.query(Mission)
            .filter(
                Mission.station_id == station_id,
                Mission.title == title,
            )
            .first()
        )
        if existing:
            continue

        db.add(
            Mission(
                station_id=station_id,
                faction_id=faction_id,
                title=title,
                description=description,
                reward_credits=reward_credits,
                status="open",
            )
        )

    db.commit()


def run_seed() -> None:
    db = SessionLocal()
    try:
        faction = get_or_create_faction(db)
        system = get_or_create_system(db, faction.id)
        archetype = get_or_create_archetype(db)
        get_or_create_ship_archetype(db)
        stations = get_or_create_stations(
            db, system.id, archetype.id, faction.id)
        commodities = get_or_create_commodities(db)
        ensure_inventory(
            db,
            stations[0].id,
            commodities,
            buy_multiplier=1.1,
            sell_multiplier=1.35,
            quantity=55,
        )
        ensure_inventory(
            db,
            stations[1].id,
            commodities,
            buy_multiplier=1.05,
            sell_multiplier=1.25,
            quantity=70,
        )
        ensure_inventory(
            db,
            stations[2].id,
            commodities,
            buy_multiplier=0.95,
            sell_multiplier=1.15,
            quantity=95,
        )
        ensure_missions(db, stations[0].id, faction.id)
        user = get_or_create_user(db, faction.id)
        get_or_create_ship(db, user.id, stations[0].id)
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
    print("Seed complete.")
