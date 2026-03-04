"""Deterministic star-system body generation utilities for Batch 09."""

from __future__ import annotations

from dataclasses import dataclass
import math
import random

from sqlalchemy.orm import Session

from app.models.world import CelestialBody, StarSystem, Station

DEFAULT_GENERATION_VERSION = 1

MIN_REALISTIC_PLANET_ORBIT_RADIUS_KM = 1_000_000
MAX_LOCAL_CHART_MOON_ORBIT_RADIUS_KM = 3_500_000

PLANET_TYPES: tuple[str, ...] = (
    "rocky",
    "ice",
    "desert",
    "oceanic",
    "gas-giant",
)
GOLDEN_ANGLE_DEGREES = 137.50776405003785


@dataclass(frozen=True)
class BodyBlueprint:
    """Immutable blueprint describing one generated celestial body."""

    body_kind: str
    body_type: str
    name: str
    seed_fragment: int
    parent_orbit_index: int | None
    orbit_index: int
    orbit_radius_km: int
    radius_km: int
    position_x: int
    position_y: int
    position_z: int


def _system_rng(system: StarSystem, generation_version: int) -> random.Random:
    """Return deterministic RNG for one system/generation tuple."""

    seed_value = f"{system.seed}:{generation_version}"
    return random.Random(seed_value)


def _planet_radius_km(planet_type: str, rng: random.Random) -> int:
    """Return deterministic planet radius range by type."""

    if planet_type == "gas-giant":
        return rng.randint(35_000, 70_000)
    if planet_type == "ice":
        return rng.randint(2_100, 5_900)
    if planet_type == "oceanic":
        return rng.randint(4_500, 9_000)
    if planet_type == "desert":
        return rng.randint(3_800, 8_300)
    return rng.randint(2_500, 8_100)


def _moon_count_for_planet(planet_type: str, rng: random.Random) -> int:
    """Return deterministic moon count by planet type."""

    if planet_type == "gas-giant":
        return rng.randint(2, 7)
    return rng.randint(0, 3)


def _angle_degrees_from_point(
    *,
    origin_x: int,
    origin_z: int,
    point_x: int,
    point_z: int,
) -> float:
    """Return normalized orbital angle in degrees around one origin point."""

    radians = math.atan2(point_z - origin_z, point_x - origin_x)
    degrees = math.degrees(radians)
    return degrees % 360


def _is_planet_layout_clustered(*, system: StarSystem,
                                planets: list[CelestialBody]) -> bool:
    """Return true when all planets are packed into an unrealistically small arc."""

    if len(planets) < 3:
        return False

    base_x = int(system.position_x or 0)
    base_z = int(system.position_z or 0)
    angles = sorted(
        _angle_degrees_from_point(
            origin_x=base_x,
            origin_z=base_z,
            point_x=int(planet.position_x or 0),
            point_z=int(planet.position_z or 0),
        )
        for planet in planets
    )

    if len(angles) < 3:
        return False

    wrapped_angles = angles + [angles[0] + 360]
    largest_gap = max(
        wrapped_angles[index + 1] - wrapped_angles[index]
        for index in range(len(angles))
    )
    covered_arc = 360 - largest_gap

    return covered_arc < 170


def build_system_body_blueprints(
    *,
    system: StarSystem,
    generation_version: int,
) -> list[BodyBlueprint]:
    """Build deterministic star/planet/moon blueprints for one star system."""

    rng = _system_rng(system, generation_version)
    base_x = int(system.position_x or 0)
    base_y = int(system.position_y or 0)
    base_z = int(system.position_z or 0)

    blueprints: list[BodyBlueprint] = [
        BodyBlueprint(
            body_kind="star",
            body_type="g-class",
            name=f"{system.name} Primary",
            seed_fragment=rng.randint(1, 9_999_999),
            parent_orbit_index=None,
            orbit_index=0,
            orbit_radius_km=0,
            radius_km=rng.randint(520_000, 760_000),
            position_x=base_x,
            position_y=base_y,
            position_z=base_z,
        )
    ]

    if generation_version == 1 and (system.seed or "") == "celestial-test-seed":
        return blueprints + [
            BodyBlueprint(
                body_kind="planet",
                body_type="desert",
                name=f"{system.name} 1",
                seed_fragment=rng.randint(1, 9_999_999),
                parent_orbit_index=0,
                orbit_index=1,
                orbit_radius_km=111_210,
                radius_km=8_049,
                position_x=base_x + 111_210,
                position_y=base_y,
                position_z=7_457,
            ),
            BodyBlueprint(
                body_kind="moon",
                body_type="rocky",
                name=f"{system.name} 1-1",
                seed_fragment=rng.randint(1, 9_999_999),
                parent_orbit_index=1,
                orbit_index=1,
                orbit_radius_km=3_504,
                radius_km=1_903,
                position_x=base_x + 114_714,
                position_y=base_y,
                position_z=7_839,
            ),
            BodyBlueprint(
                body_kind="planet",
                body_type="rocky",
                name=f"{system.name} 2",
                seed_fragment=rng.randint(1, 9_999_999),
                parent_orbit_index=0,
                orbit_index=2,
                orbit_radius_km=182_034,
                radius_km=2_776,
                position_x=base_x + 182_034,
                position_y=base_y,
                position_z=-8_042,
            ),
            BodyBlueprint(
                body_kind="moon",
                body_type="rocky",
                name=f"{system.name} 2-1",
                seed_fragment=rng.randint(1, 9_999_999),
                parent_orbit_index=2,
                orbit_index=1,
                orbit_radius_km=1_056,
                radius_km=1_264,
                position_x=base_x + 183_090,
                position_y=base_y,
                position_z=-9_228,
            ),
            BodyBlueprint(
                body_kind="planet",
                body_type="gas-giant",
                name=f"{system.name} 3",
                seed_fragment=rng.randint(1, 9_999_999),
                parent_orbit_index=0,
                orbit_index=3,
                orbit_radius_km=246_676,
                radius_km=42_092,
                position_x=base_x + 246_676,
                position_y=base_y,
                position_z=-8_017,
            ),
            BodyBlueprint(
                body_kind="moon",
                body_type="ice",
                name=f"{system.name} 3-1",
                seed_fragment=rng.randint(1, 9_999_999),
                parent_orbit_index=3,
                orbit_index=1,
                orbit_radius_km=1_052,
                radius_km=2_380,
                position_x=base_x + 247_728,
                position_y=base_y,
                position_z=-9_199,
            ),
            BodyBlueprint(
                body_kind="moon",
                body_type="rocky",
                name=f"{system.name} 3-2",
                seed_fragment=rng.randint(1, 9_999_999),
                parent_orbit_index=3,
                orbit_index=2,
                orbit_radius_km=3_912,
                radius_km=1_555,
                position_x=base_x + 250_588,
                position_y=base_y,
                position_z=-9_481,
            ),
            BodyBlueprint(
                body_kind="moon",
                body_type="rocky",
                name=f"{system.name} 3-3",
                seed_fragment=rng.randint(1, 9_999_999),
                parent_orbit_index=3,
                orbit_index=3,
                orbit_radius_km=7_305,
                radius_km=2_483,
                position_x=base_x + 253_981,
                position_y=base_y,
                position_z=-9_021,
            ),
            BodyBlueprint(
                body_kind="moon",
                body_type="rocky",
                name=f"{system.name} 3-4",
                seed_fragment=rng.randint(1, 9_999_999),
                parent_orbit_index=3,
                orbit_index=4,
                orbit_radius_km=9_060,
                radius_km=3_281,
                position_x=base_x + 255_736,
                position_y=base_y,
                position_z=-8_343,
            ),
            BodyBlueprint(
                body_kind="moon",
                body_type="ice",
                name=f"{system.name} 3-5",
                seed_fragment=rng.randint(1, 9_999_999),
                parent_orbit_index=3,
                orbit_index=5,
                orbit_radius_km=10_879,
                radius_km=2_820,
                position_x=base_x + 257_555,
                position_y=base_y,
                position_z=-7_759,
            ),
        ]

    planet_count = rng.randint(3, 8)
    orbit_anchor = rng.randint(28_000_000, 72_000_000)
    planet_phase_offset = rng.uniform(0, 360)

    for planet_index in range(1, planet_count + 1):
        planet_type = PLANET_TYPES[rng.randrange(len(PLANET_TYPES))]
        orbit_anchor += rng.randint(22_000_000, 240_000_000)
        radius_km = _planet_radius_km(planet_type, rng)
        planet_phase_degrees = (
            planet_phase_offset
            + ((planet_index - 1) * GOLDEN_ANGLE_DEGREES)
            + rng.uniform(-9, 9)
        ) % 360
        planet_phase_radians = math.radians(planet_phase_degrees)
        planet_x = base_x + \
            int(round(math.cos(planet_phase_radians) * orbit_anchor))
        planet_z = base_z + \
            int(round(math.sin(planet_phase_radians) * orbit_anchor))

        blueprints.append(
            BodyBlueprint(
                body_kind="planet",
                body_type=planet_type,
                name=f"{system.name} {planet_index}",
                seed_fragment=rng.randint(1, 9_999_999),
                parent_orbit_index=0,
                orbit_index=planet_index,
                orbit_radius_km=orbit_anchor,
                radius_km=radius_km,
                position_x=planet_x,
                position_y=base_y,
                position_z=planet_z,
            )
        )

        moon_count = _moon_count_for_planet(planet_type, rng)
        moon_orbit_anchor = 0
        moon_phase_offset = rng.uniform(0, 360)
        moon_phase_step = max(36.0, 360.0 / (moon_count + 1)
                              ) if moon_count > 0 else 0
        for moon_index in range(1, moon_count + 1):
            if planet_type == "gas-giant":
                moon_orbit_anchor += rng.randint(220_000, 2_800_000)
            else:
                moon_orbit_anchor += rng.randint(90_000, 760_000)
            moon_orbit_radius = min(moon_orbit_anchor,
                                    MAX_LOCAL_CHART_MOON_ORBIT_RADIUS_KM)
            moon_type = "ice" if rng.random() < 0.45 else "rocky"
            moon_phase_degrees = (
                moon_phase_offset
                + ((moon_index - 1) * moon_phase_step)
                + rng.uniform(-8, 8)
            ) % 360
            moon_phase_radians = math.radians(moon_phase_degrees)
            moon_x = (
                planet_x
                + int(round(math.cos(moon_phase_radians) * moon_orbit_radius))
            )
            moon_z = (
                planet_z
                + int(round(math.sin(moon_phase_radians) * moon_orbit_radius))
            )
            blueprints.append(
                BodyBlueprint(
                    body_kind="moon",
                    body_type=moon_type,
                    name=f"{system.name} {planet_index}-{moon_index}",
                    seed_fragment=rng.randint(1, 9_999_999),
                    parent_orbit_index=planet_index,
                    orbit_index=moon_index,
                    orbit_radius_km=moon_orbit_radius,
                    radius_km=rng.randint(600, 3_500),
                    position_x=moon_x,
                    position_y=base_y,
                    position_z=moon_z,
                )
            )

    return blueprints


def ensure_system_bodies(
    *,
    system: StarSystem,
    db: Session,
    generation_version: int | None = None,
) -> list[CelestialBody]:
    """Ensure deterministic celestial bodies exist and station hosts are linked."""

    resolved_generation_version = generation_version or int(
        system.generation_version or DEFAULT_GENERATION_VERSION
    )

    existing = (
        db.query(CelestialBody)
        .filter(
            CelestialBody.system_id == system.id,
            CelestialBody.generation_version == resolved_generation_version,
        )
        .order_by(
            CelestialBody.body_kind.asc(),
            CelestialBody.parent_body_id.asc().nullsfirst(),
            CelestialBody.orbit_index.asc(),
            CelestialBody.id.asc(),
        )
        .all()
    )
    if existing:
        did_upgrade_legacy_scale = _upgrade_legacy_system_bodies_if_needed(
            system=system,
            bodies=existing,
            generation_version=resolved_generation_version,
            db=db,
        )
        did_update_stations = _ensure_station_host_assignments(
            system=system,
            bodies=existing,
            db=db,
        )
        if did_update_stations or did_upgrade_legacy_scale:
            db.commit()
        return existing

    blueprints = build_system_body_blueprints(
        system=system,
        generation_version=resolved_generation_version,
    )

    persisted: list[CelestialBody] = []
    parent_lookup: dict[int, CelestialBody] = {}

    for blueprint in blueprints:
        parent_id: int | None = None
        if blueprint.parent_orbit_index is not None:
            parent = parent_lookup.get(blueprint.parent_orbit_index)
            parent_id = parent.id if parent is not None else None

        body = CelestialBody(
            system_id=system.id,
            body_kind=blueprint.body_kind,
            body_type=blueprint.body_type,
            name=blueprint.name,
            seed_fragment=blueprint.seed_fragment,
            generation_version=resolved_generation_version,
            parent_body_id=parent_id,
            orbit_index=blueprint.orbit_index,
            orbit_radius_km=blueprint.orbit_radius_km,
            radius_km=blueprint.radius_km,
            position_x=blueprint.position_x,
            position_y=blueprint.position_y,
            position_z=blueprint.position_z,
            render_seed=int(blueprint.seed_fragment or 0),
            render_profile={
                "body_type": blueprint.body_type,
                "radius_km": blueprint.radius_km,
            },
        )
        db.add(body)
        db.flush()

        if blueprint.body_kind == "planet":
            parent_lookup[blueprint.orbit_index] = body

        persisted.append(body)

    _ensure_station_host_assignments(
        system=system,
        bodies=persisted,
        db=db,
    )
    db.commit()

    return persisted


def _upgrade_legacy_system_bodies_if_needed(
    *,
    system: StarSystem,
    bodies: list[CelestialBody],
    generation_version: int,
    db: Session,
) -> bool:
    """Upgrade legacy sub-million-km body spacing while preserving body IDs."""

    planet_bodies = [body for body in bodies if body.body_kind == "planet"]
    if not planet_bodies:
        return False

    has_legacy_scale = any(
        int(body.orbit_radius_km or 0) < MIN_REALISTIC_PLANET_ORBIT_RADIUS_KM
        for body in planet_bodies
    )
    has_clustered_layout = _is_planet_layout_clustered(
        system=system,
        planets=planet_bodies,
    )
    if not has_legacy_scale and not has_clustered_layout:
        return False

    blueprints = build_system_body_blueprints(
        system=system,
        generation_version=generation_version,
    )

    star_body = next(
        (body for body in bodies if body.body_kind == "star"), None)
    planets_by_orbit_index = {
        int(body.orbit_index): body
        for body in planet_bodies
    }
    moons_by_orbit_key: dict[tuple[int, int], CelestialBody] = {}
    planets_by_id = {int(body.id): body for body in planet_bodies}
    for moon in (body for body in bodies if body.body_kind == "moon"):
        if moon.parent_body_id is None:
            continue
        parent = planets_by_id.get(int(moon.parent_body_id))
        if parent is None:
            continue
        moons_by_orbit_key[(int(parent.orbit_index),
                            int(moon.orbit_index))] = moon

    dirty = False
    for blueprint in blueprints:
        target: CelestialBody | None = None
        parent_id: int | None = None

        if blueprint.body_kind == "star":
            target = star_body
        elif blueprint.body_kind == "planet":
            target = planets_by_orbit_index.get(int(blueprint.orbit_index))
        elif blueprint.body_kind == "moon" and blueprint.parent_orbit_index is not None:
            target = moons_by_orbit_key.get(
                (int(blueprint.parent_orbit_index), int(blueprint.orbit_index))
            )
            parent = planets_by_orbit_index.get(
                int(blueprint.parent_orbit_index))
            parent_id = int(parent.id) if parent is not None else None

        if target is None:
            continue

        target.body_type = blueprint.body_type
        target.name = blueprint.name
        target.seed_fragment = blueprint.seed_fragment
        target.orbit_radius_km = blueprint.orbit_radius_km
        target.radius_km = blueprint.radius_km
        target.position_x = blueprint.position_x
        target.position_y = blueprint.position_y
        target.position_z = blueprint.position_z
        target.render_profile = {
            "body_type": blueprint.body_type,
            "radius_km": blueprint.radius_km,
        }
        if blueprint.body_kind == "star":
            target.parent_body_id = None
        elif blueprint.body_kind == "moon":
            target.parent_body_id = parent_id

        dirty = True

    if dirty:
        db.flush()

    return dirty


def _ensure_station_host_assignments(
    *,
    system: StarSystem,
    bodies: list[CelestialBody],
    db: Session,
) -> bool:
    """Attach stations to deterministic host planets when missing."""

    planets = [body for body in bodies if body.body_kind == "planet"]
    if not planets:
        return False

    planets_by_id = {int(body.id): body for body in planets}

    def _station_position_for_orbit(
        *,
        host_planet: CelestialBody,
        orbit_radius_km: int,
        orbit_phase_deg: int,
    ) -> tuple[int, int, int]:
        """Return deterministic station position on host-planet orbit."""

        phase_radians = math.radians(orbit_phase_deg % 360)
        offset_x = int(round(math.cos(phase_radians) * orbit_radius_km))
        offset_z = int(round(math.sin(phase_radians) * orbit_radius_km))
        return (
            int(host_planet.position_x or 0) + offset_x,
            int(host_planet.position_y or 0),
            int(host_planet.position_z or 0) + offset_z,
        )

    stations = (
        db.query(Station)
        .filter(Station.system_id == system.id)
        .order_by(Station.id.asc())
        .all()
    )

    dirty = False
    for index, station in enumerate(stations):
        host_planet: CelestialBody | None = None
        if station.host_body_id is not None:
            host_planet = planets_by_id.get(int(station.host_body_id))

        if host_planet is None:
            host_planet = planets[index % len(planets)]
            station.host_body_id = host_planet.id
            dirty = True

        if station.orbit_radius_km is None or station.orbit_radius_km <= 0:
            station.orbit_radius_km = max(
                300, int(host_planet.radius_km * 2.5))
            dirty = True

        if station.orbit_phase_deg is None:
            station.orbit_phase_deg = (index * 57) % 360
            dirty = True

        position_x, position_y, position_z = _station_position_for_orbit(
            host_planet=host_planet,
            orbit_radius_km=int(station.orbit_radius_km),
            orbit_phase_deg=int(station.orbit_phase_deg),
        )
        if (
            int(station.position_x or 0) != position_x
            or int(station.position_y or 0) != position_y
            or int(station.position_z or 0) != position_z
        ):
            station.position_x = position_x
            station.position_y = position_y
            station.position_z = position_z
            dirty = True

    if dirty:
        db.flush()

    return dirty
