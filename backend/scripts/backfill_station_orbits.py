"""Backfill station host-orbit metadata and positions for star systems.

Usage:
    cd backend
    ../.venv/bin/python scripts/backfill_station_orbits.py
    ../.venv/bin/python scripts/backfill_station_orbits.py --system-id 1
"""

from __future__ import annotations
from app.services.celestial_generation_service import ensure_system_bodies
from app.models.world import StarSystem
from app.db.session import SessionLocal

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments for station orbit backfill."""

    parser = argparse.ArgumentParser(
        description=(
            "Backfill station host assignments and orbital world positions "
            "for one or more star systems."
        )
    )
    parser.add_argument(
        "--system-id",
        type=int,
        default=None,
        help="Only process a single system ID (default: all systems).",
    )
    return parser.parse_args()


def main() -> int:
    """Run deterministic station orbit backfill and print summary."""

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

        print(f"Backfilling station orbits for {len(systems)} system(s)...")
        for system in systems:
            ensure_system_bodies(system=system, db=db)
            print(f"- System {system.id}: {system.name}")

        print("Station orbit backfill complete.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
