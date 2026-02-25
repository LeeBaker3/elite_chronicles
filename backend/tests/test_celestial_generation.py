import math

from app.models.world import (
    CelestialBody,
    Faction,
    StarSystem,
    Station,
    StationArchetype,
)
from app.services.celestial_generation_service import (
    build_system_body_blueprints,
    ensure_system_bodies,
)


def _seed_system(db_session) -> tuple[StarSystem, int]:
    """Create a test system with two stations for deterministic generation tests."""

    faction = Faction(name="Celestial Faction",
                      alignment="neutral", reputation_scale=0)
    db_session.add(faction)
    db_session.flush()

    system = StarSystem(
        name="Celestial Test",
        seed="celestial-test-seed",
        position_x=100,
        position_y=0,
        position_z=-50,
        economy_type="mixed",
        tech_level=3,
        faction_id=faction.id,
        generation_version=1,
    )
    db_session.add(system)
    db_session.flush()

    archetype = StationArchetype(
        name="Coriolis",
        size_class="medium",
        shape="coriolis",
        palette_json={},
        features_json={"market": True},
    )
    db_session.add(archetype)
    db_session.flush()

    station_a = Station(
        system_id=system.id,
        name="Celestial Port A",
        archetype_id=archetype.id,
        position_x=0,
        position_y=0,
        position_z=0,
        services_json={"market": True},
        faction_id=faction.id,
        tech_level=3,
        ai_story_available=False,
    )
    station_b = Station(
        system_id=system.id,
        name="Celestial Port B",
        archetype_id=archetype.id,
        position_x=20,
        position_y=0,
        position_z=0,
        services_json={"market": True},
        faction_id=faction.id,
        tech_level=3,
        ai_story_available=False,
    )
    db_session.add_all([station_a, station_b])
    db_session.commit()

    return system, 2


def test_build_system_body_blueprints_is_deterministic(db_session):
    """Deterministic generation should return identical blueprints for same seed/version."""

    system, _station_count = _seed_system(db_session)

    first = build_system_body_blueprints(system=system, generation_version=1)
    second = build_system_body_blueprints(system=system, generation_version=1)

    assert len(first) >= 4
    assert len(first) == len(second)
    assert first == second


def test_build_system_body_blueprints_matches_golden_seed_snapshot(db_session):
    """Golden-seed snapshot should remain stable for seed/version contract."""

    system, _station_count = _seed_system(db_session)

    blueprints = build_system_body_blueprints(
        system=system, generation_version=1)
    snapshot = [
        (
            item.body_kind,
            item.body_type,
            item.parent_orbit_index,
            item.orbit_index,
            item.orbit_radius_km,
            item.radius_km,
            item.position_x,
            item.position_y,
            item.position_z,
        )
        for item in blueprints
    ]

    expected_snapshot = [
        ("star", "g-class", None, 0, 0, 697300, 100, 0, -50),
        ("planet", "desert", 0, 1, 111210, 8049, 111310, 0, 7457),
        ("moon", "rocky", 1, 1, 3504, 1903, 114814, 0, 7839),
        ("planet", "rocky", 0, 2, 182034, 2776, 182134, 0, -8042),
        ("moon", "rocky", 2, 1, 1056, 1264, 183190, 0, -9228),
        ("planet", "gas-giant", 0, 3, 246676, 42092, 246776, 0, -8017),
        ("moon", "ice", 3, 1, 1052, 2380, 247828, 0, -9199),
        ("moon", "rocky", 3, 2, 3912, 1555, 250688, 0, -9481),
        ("moon", "rocky", 3, 3, 7305, 2483, 254081, 0, -9021),
        ("moon", "rocky", 3, 4, 9060, 3281, 255836, 0, -8343),
        ("moon", "ice", 3, 5, 10879, 2820, 257655, 0, -7759),
    ]

    assert snapshot == expected_snapshot


def test_ensure_system_bodies_is_idempotent_and_assigns_station_hosts(db_session):
    """Persisting generated bodies multiple times should not duplicate records."""

    system, station_count = _seed_system(db_session)

    first = ensure_system_bodies(system=system, db=db_session)
    second = ensure_system_bodies(system=system, db=db_session)

    assert len(first) == len(second)

    body_count = (
        db_session.query(CelestialBody)
        .filter(CelestialBody.system_id == system.id)
        .count()
    )
    assert body_count == len(first)

    stations = (
        db_session.query(Station)
        .filter(Station.system_id == system.id)
        .order_by(Station.id.asc())
        .all()
    )
    assert len(stations) == station_count
    assert all(station.host_body_id is not None for station in stations)
    assert all(station.orbit_radius_km is not None for station in stations)
    assert all(station.orbit_phase_deg is not None for station in stations)


def test_generated_planets_are_distributed_around_star(db_session):
    """General seeded systems should not cluster all planets into one small arc."""

    faction = Faction(name="Spread Faction",
                      alignment="neutral", reputation_scale=0)
    db_session.add(faction)
    db_session.flush()

    system = StarSystem(
        name="Spread Test",
        seed="spread-test-seed",
        position_x=0,
        position_y=0,
        position_z=0,
        economy_type="mixed",
        tech_level=3,
        faction_id=faction.id,
        generation_version=1,
    )
    db_session.add(system)
    db_session.flush()

    blueprints = build_system_body_blueprints(system=system, generation_version=1)
    planets = [item for item in blueprints if item.body_kind == "planet"]

    assert len(planets) >= 3

    angles = sorted(
        math.degrees(math.atan2(item.position_z, item.position_x)) % 360
        for item in planets
    )
    wrapped_angles = angles + [angles[0] + 360]
    largest_gap = max(
        wrapped_angles[index + 1] - wrapped_angles[index]
        for index in range(len(angles))
    )
    covered_arc = 360 - largest_gap

    assert covered_arc >= 170
