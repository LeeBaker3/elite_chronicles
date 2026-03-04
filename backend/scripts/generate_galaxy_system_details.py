"""Generate deterministic body details for galaxy systems.

Usage:
    cd backend
    ../.venv/bin/python scripts/generate_galaxy_system_details.py
    ../.venv/bin/python scripts/generate_galaxy_system_details.py --system-id 1

This script ensures each target system has generated celestial body details
(planets/moons) and station host linkage context ready for Batch-11 overview
payloads.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from app.db.session import SessionLocal
from app.models.world import StarSystem, Station
from app.services.celestial_generation_service import ensure_system_bodies

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments for galaxy detail generation."""

    parser = argparse.ArgumentParser(
        description=(
            "Generate deterministic celestial details for one or more systems "
            "for galactic chart overview usage."
        )
    )
    parser.add_argument(
        "--system-id",
        type=int,
        default=None,
        help="Optional single system ID to process (default: all systems).",
    )
    return parser.parse_args()


def main() -> int:
    """Run generation for target systems and print summary output."""

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

        print(
            f"Generating Batch-11 system details for {len(systems)} system(s)...")

        for system in systems:
            bodies = ensure_system_bodies(system=system, db=db)
            planets = [body for body in bodies if body.body_kind == "planet"]
            moons = [body for body in bodies if body.body_kind == "moon"]
            stations = (
                db.query(Station)
                .filter(Station.system_id == system.id)
                .order_by(Station.id.asc())
                .all()
            )
            linked_stations = sum(
                1 for station in stations if station.host_body_id is not None
            )

            print(
                f"- System {system.id}: {system.name} | "
                f"planets={len(planets)} moons={len(moons)} "
                f"stations={len(stations)} linked={linked_stations}"
            )

        print("Galaxy system detail generation complete.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
