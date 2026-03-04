"""Developer ship tools for local state checks and quick top-ups.

Usage examples:
    cd backend
    ../.venv/bin/python scripts/dev_ship_tools.py status --ship-id 1
    ../.venv/bin/python scripts/dev_ship_tools.py top-up --ship-id 1
    ../.venv/bin/python scripts/dev_ship_tools.py top-up --all

This script intentionally operates on local development data only.
"""

from __future__ import annotations
from app.models.ship import Ship
from app.db.session import SessionLocal

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@dataclass(frozen=True)
class ShipSnapshot:
    """Immutable ship state snapshot for display output."""

    ship_id: int
    name: str
    status: str
    fuel_current: int
    fuel_cap: int
    shields_current: int
    shields_max: int
    energy_current: int
    energy_cap: int
    position_x: int
    position_y: int
    position_z: int


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments for dev ship tools."""

    parser = argparse.ArgumentParser(
        description="Inspect and top up local ship state for development.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    status_parser = subparsers.add_parser(
        "status",
        help="Print ship status snapshot.",
    )
    status_parser.add_argument("--ship-id", type=int, default=1)

    top_up_parser = subparsers.add_parser(
        "top-up",
        help="Set fuel, shields, and energy to capacity.",
    )
    top_up_parser.add_argument("--ship-id", type=int, default=1)
    top_up_parser.add_argument(
        "--all",
        action="store_true",
        help="Top up all ships instead of one ship id.",
    )

    return parser.parse_args()


def _snapshot(ship: Ship) -> ShipSnapshot:
    """Build a stable, display-friendly snapshot from ORM ship row."""

    return ShipSnapshot(
        ship_id=int(ship.id),
        name=str(ship.name or f"Ship #{ship.id}"),
        status=str(ship.status or "unknown"),
        fuel_current=int(ship.fuel_current or 0),
        fuel_cap=int(ship.fuel_cap or 0),
        shields_current=int(ship.shields_current or 0),
        shields_max=int(ship.shields_max or 0),
        energy_current=int(ship.energy_current or 0),
        energy_cap=int(ship.energy_cap or 0),
        position_x=int(ship.position_x or 0),
        position_y=int(ship.position_y or 0),
        position_z=int(ship.position_z or 0),
    )


def _print_snapshot(prefix: str, snapshot: ShipSnapshot) -> None:
    """Print one compact ship snapshot line."""

    print(
        f"{prefix} ship={snapshot.ship_id} ({snapshot.name}) "
        f"status={snapshot.status} "
        f"fuel={snapshot.fuel_current}/{snapshot.fuel_cap} "
        f"shields={snapshot.shields_current}/{snapshot.shields_max} "
        f"energy={snapshot.energy_current}/{snapshot.energy_cap} "
        f"pos=({snapshot.position_x}, {snapshot.position_y}, {snapshot.position_z})"
    )


def _resolve_ships(session, ship_id: int, top_up_all: bool) -> list[Ship]:
    """Resolve one or many ships for status/top-up operations."""

    if top_up_all:
        return session.query(Ship).order_by(Ship.id.asc()).all()

    ship = session.query(Ship).filter(Ship.id == ship_id).first()
    if ship is not None:
        return [ship]

    first_ship = session.query(Ship).order_by(Ship.id.asc()).first()
    return [first_ship] if first_ship is not None else []


def run_status(ship_id: int) -> int:
    """Print a status snapshot for the selected ship."""

    session = SessionLocal()
    try:
        ships = _resolve_ships(session, ship_id=ship_id, top_up_all=False)
        if not ships:
            print("No ships found.")
            return 1

        _print_snapshot("STATUS", _snapshot(ships[0]))
        return 0
    finally:
        session.close()


def run_top_up(ship_id: int, top_up_all: bool) -> int:
    """Top up selected ship(s) and print before/after snapshots."""

    session = SessionLocal()
    try:
        ships = _resolve_ships(session, ship_id=ship_id, top_up_all=top_up_all)
        if not ships:
            print("No ships found.")
            return 1

        before: list[ShipSnapshot] = [_snapshot(ship) for ship in ships]

        for ship in ships:
            ship.fuel_current = int(ship.fuel_cap or 0)
            ship.shields_current = int(ship.shields_max or 0)
            ship.energy_current = int(ship.energy_cap or 0)

        session.commit()

        refreshed: list[ShipSnapshot] = []
        for ship in ships:
            session.refresh(ship)
            refreshed.append(_snapshot(ship))

        for before_snapshot, after_snapshot in zip(before, refreshed, strict=True):
            _print_snapshot("BEFORE", before_snapshot)
            _print_snapshot("AFTER ", after_snapshot)

        return 0
    finally:
        session.close()


def main() -> int:
    """Entrypoint for CLI script execution."""

    args = parse_args()
    if args.command == "status":
        return run_status(ship_id=int(args.ship_id))

    return run_top_up(ship_id=int(args.ship_id), top_up_all=bool(args.all))


if __name__ == "__main__":
    raise SystemExit(main())
