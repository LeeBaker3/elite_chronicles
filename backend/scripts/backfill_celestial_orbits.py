"""Backfill celestial body orbit scales for one or more star systems.

Usage:
    cd backend
    ../.venv/bin/python scripts/backfill_celestial_orbits.py
    ../.venv/bin/python scripts/backfill_celestial_orbits.py --system-id 1
    ../.venv/bin/python scripts/backfill_celestial_orbits.py --all-systems

By default this script only processes systems whose planet orbit radii are still
in legacy small-scale ranges (< 1,000,000 km). Use ``--all-systems`` to force a
full pass across every system.
"""

from __future__ import annotations
from app.services.celestial_generation_service import (
    MIN_REALISTIC_PLANET_ORBIT_RADIUS_KM,
    ensure_system_bodies,
)
from app.models.world import CelestialBody, StarSystem
from app.db.session import SessionLocal

import argparse
import sys
from pathlib import Path

from sqlalchemy import func

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments for celestial orbit backfill."""

    parser = argparse.ArgumentParser(
        description=(
            "Backfill celestial body orbit scales for one or more star systems. "
            "Defaults to systems that still have legacy small planet orbits."
        )
    )
    parser.add_argument(
        "--system-id",
        type=int,
        default=None,
        help="Only process a single system ID (default: auto-select legacy systems).",
    )
    parser.add_argument(
        "--all-systems",
        action="store_true",
        help="Force processing for all systems even if already upgraded.",
    )
    return parser.parse_args()


def _minimum_planet_orbit_radius_km(
    *,
    system_id: int,
    generation_version: int,
    db,
) -> int | None:
    """Return the minimum planet orbit radius for one system/version tuple."""

    minimum_radius = (
        db.query(func.min(CelestialBody.orbit_radius_km))
        .filter(
            CelestialBody.system_id == system_id,
            CelestialBody.generation_version == generation_version,
            CelestialBody.body_kind == "planet",
        )
        .scalar()
    )
    if minimum_radius is None:
        return None
    return int(minimum_radius)


def _needs_legacy_upgrade(
    *,
    system: StarSystem,
    db,
) -> bool:
    """Return whether a system still uses pre-realism planet distance ranges."""

    generation_version = int(system.generation_version or 1)
    minimum_radius = _minimum_planet_orbit_radius_km(
        system_id=int(system.id),
        generation_version=generation_version,
        db=db,
    )
    if minimum_radius is None:
        return True
    return minimum_radius < MIN_REALISTIC_PLANET_ORBIT_RADIUS_KM


def main() -> int:
    """Run celestial orbit backfill and print per-system outcomes."""

    args = parse_args()
    db = SessionLocal()
    try:
        query = db.query(StarSystem).order_by(StarSystem.id.asc())
        if args.system_id is not None:
            query = query.filter(StarSystem.id == args.system_id)

        systems = query.all()
        if not systems:
            target = f" #{args.system_id}" if args.system_id is not None else ""
            print(f"No star systems found{target}.")
            return 1

        candidates = (
            systems
            if args.all_systems or args.system_id is not None
            else [system for system in systems if _needs_legacy_upgrade(system=system, db=db)]
        )

        if not candidates:
            print("No legacy celestial orbit scales found. Nothing to backfill.")
            return 0

        print(
            f"Backfilling celestial orbits for {len(candidates)} system(s)...")

        upgraded_count = 0
        generated_count = 0
        unchanged_count = 0

        for system in candidates:
            generation_version = int(system.generation_version or 1)
            before_minimum = _minimum_planet_orbit_radius_km(
                system_id=int(system.id),
                generation_version=generation_version,
                db=db,
            )

            ensure_system_bodies(system=system, db=db)

            after_minimum = _minimum_planet_orbit_radius_km(
                system_id=int(system.id),
                generation_version=generation_version,
                db=db,
            )

            if before_minimum is None and after_minimum is not None:
                generated_count += 1
                action = "generated"
            elif (
                before_minimum is not None
                and before_minimum < MIN_REALISTIC_PLANET_ORBIT_RADIUS_KM
                and after_minimum is not None
                and after_minimum >= MIN_REALISTIC_PLANET_ORBIT_RADIUS_KM
            ):
                upgraded_count += 1
                action = "upgraded"
            else:
                unchanged_count += 1
                action = "unchanged"

            before_label = (
                "none" if before_minimum is None else f"{before_minimum:,} km"
            )
            after_label = "none" if after_minimum is None else f"{after_minimum:,} km"
            print(
                f"- System {system.id}: {system.name} "
                f"[{action}] min planet orbit {before_label} -> {after_label}"
            )

        print(
            "Celestial orbit backfill complete. "
            f"Upgraded: {upgraded_count}, generated: {generated_count}, "
            f"unchanged: {unchanged_count}."
        )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
