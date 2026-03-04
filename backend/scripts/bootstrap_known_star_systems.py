"""Bootstrap deterministic known-star inspired systems for galaxy navigation.

Usage:
    cd backend
    ../.venv/bin/python scripts/bootstrap_known_star_systems.py
    ../.venv/bin/python scripts/bootstrap_known_star_systems.py --dry-run
    ../.venv/bin/python scripts/bootstrap_known_star_systems.py --target-count 1000
    ../.venv/bin/python scripts/bootstrap_known_star_systems.py --skip-regenerate

This script supports Batch-11 data-generation operations by providing:
- deterministic initial generation of known-star inspired systems,
- idempotent reruns (upsert behavior),
- optional regeneration/backfill via celestial generation service.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import math
from collections.abc import Iterable
from dataclasses import dataclass
from urllib import error as urllib_error
from urllib import request as urllib_request

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.world import Faction, StarSystem, Station, StationArchetype
from app.services.celestial_generation_service import ensure_system_bodies

COORDINATE_SCALE_PER_LIGHT_YEAR = 10
DEFAULT_TARGET_SYSTEM_COUNT = 1000
DEFAULT_DATASET_TIMEOUT_SECONDS = 20
DEFAULT_MAX_REAL_NAMES = 3000
HYG_REAL_NAME_DATASET_URL = (
    "https://raw.githubusercontent.com/astronexus/HYG-Database/"
    "main/hyg/CURRENT/hygdata_v41.csv"
)


@dataclass(frozen=True)
class KnownStarSpec:
    """Deterministic known-star inspired system bootstrap definition."""

    name: str
    seed: str
    x_ly: float
    y_ly: float
    z_ly: float
    economy_type: str
    tech_level: int


@dataclass(frozen=True)
class RealStarNameCatalog:
    """Container for real-star names and preferred-name cutover index."""

    names: tuple[str, ...]
    preferred_count: int


KNOWN_STAR_SYSTEMS: tuple[KnownStarSpec, ...] = (
    KnownStarSpec(
        name="Vega Prime",
        seed="known-vega-prime-v1",
        x_ly=25.0,
        y_ly=0.2,
        z_ly=-2.4,
        economy_type="industrial",
        tech_level=6,
    ),
    KnownStarSpec(
        name="Sol",
        seed="known-sol-v1",
        x_ly=0.0,
        y_ly=0.0,
        z_ly=0.0,
        economy_type="mixed",
        tech_level=7,
    ),
    KnownStarSpec(
        name="Alpha Centauri",
        seed="known-alpha-centauri-v1",
        x_ly=4.37,
        y_ly=-0.1,
        z_ly=0.3,
        economy_type="industrial",
        tech_level=6,
    ),
    KnownStarSpec(
        name="Barnard",
        seed="known-barnard-v1",
        x_ly=5.96,
        y_ly=0.2,
        z_ly=-1.1,
        economy_type="agricultural",
        tech_level=4,
    ),
    KnownStarSpec(
        name="Sirius",
        seed="known-sirius-v1",
        x_ly=8.60,
        y_ly=-0.3,
        z_ly=1.5,
        economy_type="high-tech",
        tech_level=7,
    ),
    KnownStarSpec(
        name="Procyon",
        seed="known-procyon-v1",
        x_ly=11.46,
        y_ly=0.4,
        z_ly=1.9,
        economy_type="industrial",
        tech_level=6,
    ),
    KnownStarSpec(
        name="Tau Ceti",
        seed="known-tau-ceti-v1",
        x_ly=11.90,
        y_ly=-0.2,
        z_ly=-2.1,
        economy_type="agricultural",
        tech_level=5,
    ),
    KnownStarSpec(
        name="Lave",
        seed="known-lave-v1",
        x_ly=14.2,
        y_ly=0.1,
        z_ly=-1.6,
        economy_type="mixed",
        tech_level=5,
    ),
    KnownStarSpec(
        name="Epsilon Eridani",
        seed="known-epsilon-eridani-v1",
        x_ly=10.50,
        y_ly=0.1,
        z_ly=-3.8,
        economy_type="mixed",
        tech_level=5,
    ),
)


PROCEDURAL_ECONOMY_TYPES: tuple[str, ...] = (
    "industrial",
    "agricultural",
    "mixed",
    "high-tech",
)

PROCEDURAL_GREEK_PREFIXES: tuple[str, ...] = (
    "Alpha",
    "Beta",
    "Gamma",
    "Delta",
    "Epsilon",
    "Zeta",
    "Eta",
    "Theta",
    "Iota",
    "Kappa",
)

PROCEDURAL_CONSTELLATION_STEMS: tuple[str, ...] = (
    "Lyrae",
    "Cygni",
    "Draconis",
    "Aquilae",
    "Eridani",
    "Pavonis",
    "Hydrae",
    "Persei",
    "Centauri",
    "Ceti",
    "Andromedae",
    "Sagittarii",
)


def parse_args() -> argparse.Namespace:
    """Parse command-line options for known-star bootstrap."""

    parser = argparse.ArgumentParser(
        description=(
            "Bootstrap deterministic known-star inspired systems and "
            "optionally regenerate celestial bodies/station backfill."
        )
    )
    parser.add_argument(
        "--target-count",
        type=int,
        default=DEFAULT_TARGET_SYSTEM_COUNT,
        help=(
            "Target total number of star systems to upsert "
            f"(default: {DEFAULT_TARGET_SYSTEM_COUNT})."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print intended operations without writing database changes.",
    )
    parser.add_argument(
        "--skip-regenerate",
        action="store_true",
        help="Skip ensure_system_bodies regeneration/backfill step.",
    )
    parser.add_argument(
        "--disable-online-names",
        action="store_true",
        help="Skip online real-star name ingestion and use procedural names only.",
    )
    parser.add_argument(
        "--dataset-url",
        type=str,
        default=HYG_REAL_NAME_DATASET_URL,
        help="Source URL for real-star naming dataset.",
    )
    parser.add_argument(
        "--dataset-timeout-seconds",
        type=int,
        default=DEFAULT_DATASET_TIMEOUT_SECONDS,
        help=(
            "HTTP timeout used for online star-name dataset download "
            f"(default: {DEFAULT_DATASET_TIMEOUT_SECONDS})."
        ),
    )
    parser.add_argument(
        "--max-real-names",
        type=int,
        default=DEFAULT_MAX_REAL_NAMES,
        help=(
            "Maximum number of unique real star names to ingest "
            f"(default: {DEFAULT_MAX_REAL_NAMES})."
        ),
    )
    return parser.parse_args()


def _hash_fraction(seed: str) -> float:
    """Return deterministic normalized fraction in [0, 1) from a seed."""

    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    value = int.from_bytes(digest[:8], byteorder="big", signed=False)
    return float(value % 10_000_000) / 10_000_000.0


def _normalize_star_name(value: str) -> str:
    """Normalize candidate star name and reject low-quality values."""

    normalized = " ".join((value or "").strip().split())
    if not normalized:
        return ""
    if not any(character.isalpha() for character in normalized):
        return ""
    return normalized


def _extract_real_star_names_from_rows(
    rows: Iterable[dict[str, str]],
    *,
    max_names: int,
) -> RealStarNameCatalog:
    """Extract unique, human-readable real star names from CSV rows."""

    reserved = {spec.name.casefold() for spec in KNOWN_STAR_SYSTEMS}
    seen: set[str] = set()
    preferred_names: list[str] = []
    fallback_designations: list[str] = []

    if max_names <= 0:
        return RealStarNameCatalog(names=(), preferred_count=0)

    for row in rows:
        proper_name = _normalize_star_name(row.get("proper", ""))
        if proper_name:
            key = proper_name.casefold()
            if key not in reserved and key not in seen:
                seen.add(key)
                preferred_names.append(proper_name)
                if len(preferred_names) >= max_names:
                    return RealStarNameCatalog(
                        names=tuple(preferred_names),
                        preferred_count=len(preferred_names),
                    )

        designation = _normalize_star_name(row.get("bf", ""))
        if designation:
            key = designation.casefold()
            if key in reserved or key in seen:
                continue
            seen.add(key)
            fallback_designations.append(designation)

    names = tuple((preferred_names + fallback_designations)[:max_names])
    preferred_count = min(len(preferred_names), len(names))
    return RealStarNameCatalog(names=names, preferred_count=preferred_count)


def _load_real_star_names_from_dataset(
    *,
    dataset_url: str,
    timeout_seconds: int,
    max_names: int,
) -> RealStarNameCatalog:
    """Load real star names from online dataset, with safe fallback behavior."""

    if max_names <= 0:
        return RealStarNameCatalog(names=(), preferred_count=0)

    try:
        with urllib_request.urlopen(dataset_url, timeout=timeout_seconds) as response:
            text_stream = io.TextIOWrapper(
                response,
                encoding="utf-8",
                errors="ignore",
                newline="",
            )
            reader = csv.DictReader(text_stream)
            return _extract_real_star_names_from_rows(
                reader,
                max_names=max_names,
            )
    except (urllib_error.URLError, TimeoutError, ValueError) as exc:
        print(
            "! Online star-name dataset unavailable. "
            f"Proceeding with deterministic procedural naming. error={exc}"
        )
        return RealStarNameCatalog(names=(), preferred_count=0)


def _select_real_star_name(
    *,
    base_key: str,
    real_star_catalog: RealStarNameCatalog,
    used_real_names: set[str],
) -> str | None:
    """Select a deterministic unused real-star name when one is available."""

    if not real_star_catalog.names:
        return None

    preferred_count = max(0, int(real_star_catalog.preferred_count or 0))
    preferred_names = real_star_catalog.names[:preferred_count]
    if preferred_names:
        preferred_start = int(
            _hash_fraction(f"{base_key}-real-name-preferred") *
            len(preferred_names)
        )
        for offset in range(len(preferred_names)):
            candidate = preferred_names[
                (preferred_start + offset) % len(preferred_names)
            ]
            if candidate.casefold() in used_real_names:
                continue
            used_real_names.add(candidate.casefold())
            return candidate

    all_names = real_star_catalog.names
    start_index = int(_hash_fraction(f"{base_key}-real-name") * len(all_names))
    for offset in range(len(all_names)):
        candidate = all_names[(start_index + offset) % len(all_names)]
        if candidate.casefold() in used_real_names:
            continue
        used_real_names.add(candidate.casefold())
        return candidate

    return None


def _build_procedural_specs(
    target_count: int,
    *,
    real_star_catalog: RealStarNameCatalog,
) -> tuple[KnownStarSpec, ...]:
    """Build deterministic procedural systems to reach the target count."""

    additional_count = max(0, target_count - len(KNOWN_STAR_SYSTEMS))
    generated: list[KnownStarSpec] = []
    used_real_names: set[str] = {spec.name.casefold()
                                 for spec in KNOWN_STAR_SYSTEMS}
    for index in range(additional_count):
        item_number = index + 1
        base_key = f"procedural-chart-system-{item_number:04d}-v1"

        radial_ly = 20.0 + (_hash_fraction(f"{base_key}-r") * 240.0)
        azimuth = _hash_fraction(f"{base_key}-a") * (2.0 * math.pi)
        vertical_ly = -8.0 + (_hash_fraction(f"{base_key}-y") * 16.0)

        economy_index = int(_hash_fraction(
            f"{base_key}-e") * len(PROCEDURAL_ECONOMY_TYPES))
        economy_type = PROCEDURAL_ECONOMY_TYPES[min(
            economy_index, len(PROCEDURAL_ECONOMY_TYPES) - 1)]
        tech_level = 2 + int(_hash_fraction(f"{base_key}-t") * 8)
        generated_name = _build_procedural_system_name(
            item_number=item_number,
            base_key=base_key,
            real_star_catalog=real_star_catalog,
            used_real_names=used_real_names,
        )

        generated.append(
            KnownStarSpec(
                name=generated_name,
                seed=base_key,
                x_ly=math.cos(azimuth) * radial_ly,
                y_ly=vertical_ly,
                z_ly=math.sin(azimuth) * radial_ly,
                economy_type=economy_type,
                tech_level=tech_level,
            )
        )

    return tuple(generated)


def _build_procedural_system_name(
    *,
    item_number: int,
    base_key: str,
    real_star_catalog: RealStarNameCatalog,
    used_real_names: set[str],
) -> str:
    """Return deterministic, believable procedural system naming."""

    selected_real_name = _select_real_star_name(
        base_key=base_key,
        real_star_catalog=real_star_catalog,
        used_real_names=used_real_names,
    )
    if selected_real_name is not None:
        return selected_real_name

    style_bucket = int(_hash_fraction(f"{base_key}-name-style") * 100)
    if style_bucket < 82:
        greek = PROCEDURAL_GREEK_PREFIXES[
            int(_hash_fraction(f"{base_key}-greek")
                * len(PROCEDURAL_GREEK_PREFIXES))
            % len(PROCEDURAL_GREEK_PREFIXES)
        ]
        stem = PROCEDURAL_CONSTELLATION_STEMS[
            int(_hash_fraction(f"{base_key}-stem") *
                len(PROCEDURAL_CONSTELLATION_STEMS))
            % len(PROCEDURAL_CONSTELLATION_STEMS)
        ]
        sector = 10 + (item_number % 89)
        return f"{greek} {stem} {sector}"

    if style_bucket < 92:
        stem = PROCEDURAL_CONSTELLATION_STEMS[
            int(_hash_fraction(f"{base_key}-stem-alt")
                * len(PROCEDURAL_CONSTELLATION_STEMS))
            % len(PROCEDURAL_CONSTELLATION_STEMS)
        ]
        designation = 100 + (item_number % 900)
        return f"{stem} {designation}"

    if style_bucket < 97:
        return f"Gliese {1000 + item_number}"

    if style_bucket < 99:
        return f"HD {100000 + (item_number * 13)}"

    return f"HIP {200000 + (item_number * 17)}"


def _scaled_coordinate(light_year_value: float) -> int:
    """Convert light-year coordinate to deterministic map coordinate units."""

    return int(round(light_year_value * COORDINATE_SCALE_PER_LIGHT_YEAR))


def _get_or_create_faction(db: Session) -> Faction:
    """Return deterministic default faction for generated systems."""

    faction = db.query(Faction).filter(Faction.name == "Pilots Guild").first()
    if faction is not None:
        return faction

    faction = Faction(name="Pilots Guild",
                      alignment="neutral", reputation_scale=0)
    db.add(faction)
    db.flush()
    return faction


def _get_or_create_station_archetype(db: Session) -> StationArchetype:
    """Return deterministic station archetype used for bootstrap stations."""

    archetype = (
        db.query(StationArchetype)
        .filter(StationArchetype.name == "Coriolis Hub")
        .first()
    )
    if archetype is not None:
        return archetype

    archetype = StationArchetype(
        name="Coriolis Hub",
        size_class="medium",
        shape="coriolis",
        palette_json={"primary": "#2bb3ff", "accent": "#ffb347"},
        features_json={"docking_slots": 12, "market": True},
    )
    db.add(archetype)
    db.flush()
    return archetype


def _upsert_known_system(
    *,
    db: Session,
    spec: KnownStarSpec,
    faction_id: int,
) -> tuple[StarSystem, str]:
    """Upsert one known-star system and return status for reporting."""

    system = db.query(StarSystem).filter(StarSystem.seed == spec.seed).first()
    if system is None:
        system = db.query(StarSystem).filter(
            StarSystem.name == spec.name).first()
    status = "updated"
    if system is None:
        system = StarSystem(name=spec.name, seed=spec.seed)
        db.add(system)
        status = "created"

    system.name = spec.name
    system.seed = spec.seed
    system.position_x = _scaled_coordinate(spec.x_ly)
    system.position_y = _scaled_coordinate(spec.y_ly)
    system.position_z = _scaled_coordinate(spec.z_ly)
    system.economy_type = spec.economy_type
    system.tech_level = int(spec.tech_level)
    system.faction_id = int(faction_id)
    if int(system.generation_version or 0) <= 0:
        system.generation_version = 1

    db.flush()
    return system, status


def _upsert_system_station(
    *,
    db: Session,
    system: StarSystem,
    archetype_id: int,
    faction_id: int,
) -> tuple[Station, str]:
    """Upsert one default station for a system and return status for reporting."""

    station_name = f"{system.name} Port"
    station = (
        db.query(Station)
        .filter(Station.system_id == system.id, Station.name == station_name)
        .first()
    )

    if station is None:
        station = (
            db.query(Station)
            .filter(Station.system_id == system.id)
            .order_by(Station.id.asc())
            .first()
        )

    status = "updated"
    if station is None:
        station = Station(
            system_id=int(system.id),
            name=station_name,
            archetype_id=int(archetype_id),
            position_x=int(system.position_x) + 1200,
            position_y=int(system.position_y),
            position_z=int(system.position_z),
            services_json={"market": True, "repairs": True, "upgrades": True},
            faction_id=int(faction_id),
            tech_level=max(1, int(system.tech_level or 1) - 1),
            ai_story_available=False,
            render_seed=((int(system.id) * 40503) + 1200) % 2147483647 or 1,
        )
        db.add(station)
        status = "created"
    else:
        station.name = station_name
        station.archetype_id = int(archetype_id)
        station.faction_id = int(faction_id)
        if int(station.render_seed or 0) <= 0:
            station.render_seed = (
                (int(system.id) * 40503) + 1200) % 2147483647 or 1

    db.flush()
    return station, status


def main() -> int:
    """Run known-star bootstrap and optional regeneration/backfill operations."""

    args = parse_args()
    db = SessionLocal()
    try:
        faction = _get_or_create_faction(db)
        archetype = _get_or_create_station_archetype(db)

        real_star_catalog = RealStarNameCatalog(names=(), preferred_count=0)
        if not args.disable_online_names:
            real_star_catalog = _load_real_star_names_from_dataset(
                dataset_url=str(args.dataset_url),
                timeout_seconds=max(1, int(args.dataset_timeout_seconds or 1)),
                max_names=max(0, int(args.max_real_names or 0)),
            )
            print(
                "Loaded online real-star names "
                f"count={len(real_star_catalog.names)} "
                f"preferred={real_star_catalog.preferred_count} "
                f"url={args.dataset_url}"
            )

        target_count = max(len(KNOWN_STAR_SYSTEMS),
                           int(args.target_count or 0))
        specs = KNOWN_STAR_SYSTEMS + _build_procedural_specs(
            target_count,
            real_star_catalog=real_star_catalog,
        )

        created_systems = 0
        created_stations = 0
        for spec in specs:
            system, system_status = _upsert_known_system(
                db=db,
                spec=spec,
                faction_id=int(faction.id),
            )
            station, station_status = _upsert_system_station(
                db=db,
                system=system,
                archetype_id=int(archetype.id),
                faction_id=int(faction.id),
            )
            if system_status == "created":
                created_systems += 1
            if station_status == "created":
                created_stations += 1

            if not args.skip_regenerate:
                ensure_system_bodies(system=system, db=db)

            print(
                f"- {system.name}: system={system_status} "
                f"station={station_status} station_id={station.id}"
            )

        if args.dry_run:
            db.rollback()
            print(
                "Dry run complete. "
                f"target_systems={target_count} "
                f"would_create_systems={created_systems} "
                f"would_create_stations={created_stations}"
            )
            return 0

        db.commit()
        total_systems = db.query(StarSystem).count()
        print(
            "Known-star bootstrap complete. "
            f"target_systems={target_count} "
            f"created_systems={created_systems} "
            f"created_stations={created_stations} "
            f"total_systems={total_systems}"
        )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
