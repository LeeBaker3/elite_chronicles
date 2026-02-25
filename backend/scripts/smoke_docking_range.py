"""Run a live docking range smoke flow against the local backend API.

This script verifies three behaviors:
1. In-range docking succeeds.
2. Out-of-range docking fails naturally when possible.
3. Out-of-range docking fails via a controlled fallback when station layout
   does not provide a natural out-of-range target.
"""

from __future__ import annotations
from app.models.world import StarSystem, Station
from app.models.ship import Ship
from app.db.session import SessionLocal

import json
import math
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


BASE_URL = "http://127.0.0.1:8000"

DOCKING_RANGE_BY_TIER_KM: dict[str, int] = {
    "basic": 20,
    "standard": 40,
    "advanced": 80,
}


def request_json(
    method: str,
    path: str,
    token: str | None = None,
    body: dict[str, Any] | None = None,
) -> tuple[int, Any]:
    """Send a JSON HTTP request and return status code and parsed payload."""

    data = None
    headers: dict[str, str] = {}

    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=data,
        headers=headers,
        method=method,
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = response.read().decode("utf-8")
            if not payload:
                return response.status, None
            return response.status, json.loads(payload)
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8")
        if not payload:
            return error.code, None
        try:
            return error.code, json.loads(payload)
        except json.JSONDecodeError:
            return error.code, payload


def distance_km(ship: Ship, station: Station) -> int:
    """Return Euclidean distance between ship and station coordinates."""

    delta_x = int(ship.position_x or 0) - int(station.position_x or 0)
    delta_y = int(ship.position_y or 0) - int(station.position_y or 0)
    delta_z = int(ship.position_z or 0) - int(station.position_z or 0)
    return int(math.sqrt((delta_x * delta_x) + (delta_y * delta_y) + (delta_z * delta_z)))


def extract_error_message(payload: Any) -> str:
    """Extract a compact error message from standard API error payload."""

    if isinstance(payload, dict):
        return (
            payload.get("detail")
            or payload.get("message")
            or payload.get("error", {}).get("message")
            or ""
        )
    return str(payload)


def register_smoke_user() -> tuple[str, int]:
    """Create a unique user and return auth token and user id."""

    timestamp = int(time.time())
    status, payload = request_json(
        "POST",
        "/api/auth/register",
        body={
            "email": f"smoke.docking.range.{timestamp}@example.com",
            "username": f"smoke_docking_range_{timestamp}",
            "password": "SmokePass123!",
        },
    )
    print("register_status", status)

    if status != 200 or not isinstance(payload, dict):
        raise RuntimeError("Failed to register smoke user")

    token = payload.get("token")
    user_id = payload.get("user_id")
    if not isinstance(token, str) or not token:
        raise RuntimeError("Register response missing token")
    if not isinstance(user_id, int):
        raise RuntimeError("Register response missing user_id")

    return token, user_id


def resolve_user_ship(user_id: int) -> Ship:
    """Find starter ship for a user."""

    session = SessionLocal()
    try:
        ship = (
            session.query(Ship)
            .filter(Ship.owner_user_id == user_id)
            .order_by(Ship.id.asc())
            .first()
        )
        if ship is None:
            raise RuntimeError("No starter ship found for smoke user")

        session.expunge(ship)
        return ship
    finally:
        session.close()


def resolve_system_stations(system_id: int) -> list[Station]:
    """List stations in a system ordered by id."""

    session = SessionLocal()
    try:
        stations = (
            session.query(Station)
            .filter(Station.system_id == system_id)
            .order_by(Station.id.asc())
            .all()
        )
        for station in stations:
            session.expunge(station)
        return stations
    finally:
        session.close()


def force_ship_far_away(ship_id: int) -> None:
    """Move a test ship far from stations to force out-of-range docking."""

    session = SessionLocal()
    try:
        ship = session.query(Ship).filter(Ship.id == ship_id).first()
        if ship is None:
            raise RuntimeError(
                "Ship not found while forcing out-of-range scenario")

        ship.position_x = 999
        ship.position_y = 999
        ship.position_z = 999
        ship.version = (ship.version or 0) + 1
        session.commit()
    finally:
        session.close()


def get_first_system_id() -> int:
    """Return the first available star system id."""

    session = SessionLocal()
    try:
        first_system = session.query(StarSystem).order_by(
            StarSystem.id.asc()).first()
        if first_system is None:
            raise RuntimeError("No star systems available")
        return int(first_system.id)
    finally:
        session.close()


def run() -> None:
    """Execute docking range smoke checks and print deterministic results."""

    token, user_id = register_smoke_user()
    starter_ship = resolve_user_ship(user_id)
    ship_id = int(starter_ship.id)
    print("user_id", user_id)
    print("ship_id", ship_id)

    undock_status, undock_payload = request_json(
        "POST", f"/api/ships/{ship_id}/undock", token=token)
    print("undock_status", undock_status)
    if undock_status != 200:
        raise RuntimeError(
            f"Undock failed: {extract_error_message(undock_payload)}")

    system_id = get_first_system_id()
    stations = resolve_system_stations(system_id)
    if not stations:
        raise RuntimeError("No stations available for docking smoke")

    ship_for_distance = resolve_user_ship(user_id)
    docking_tier = str(
        ship_for_distance.docking_computer_tier or "standard").lower()
    docking_range_km = DOCKING_RANGE_BY_TIER_KM.get(docking_tier, 40)
    print("docking_computer_tier", docking_tier)
    print("docking_range_km", docking_range_km)

    station_distances = sorted(
        [(int(station.id), distance_km(ship_for_distance, station), station.name)
         for station in stations],
        key=lambda item: item[1],
    )

    in_range = next(
        (row for row in station_distances if row[1] <= docking_range_km), None)
    if in_range is None:
        raise RuntimeError("No in-range station found for docking smoke")

    in_station_id, in_distance, in_name = in_range
    print("in_range_station", in_station_id, in_name, in_distance)

    dock_ok_status, dock_ok_payload = request_json(
        "POST",
        f"/api/ships/{ship_id}/dock",
        token=token,
        body={"station_id": in_station_id},
    )
    print("dock_in_range_status", dock_ok_status)
    if dock_ok_status != 200:
        raise RuntimeError(
            f"In-range dock failed: {extract_error_message(dock_ok_payload)}")

    undock_again_status, undock_again_payload = request_json(
        "POST",
        f"/api/ships/{ship_id}/undock",
        token=token,
    )
    print("undock_again_status", undock_again_status)
    if undock_again_status != 200:
        raise RuntimeError(
            f"Second undock failed: {extract_error_message(undock_again_payload)}")

    natural_out_of_range = next(
        (row for row in reversed(station_distances)
         if row[1] > docking_range_km),
        None,
    )

    if natural_out_of_range is None:
        print("out_of_range_mode", "forced")
        target_station_id = int(stations[0].id)
        force_ship_far_away(ship_id)
    else:
        print("out_of_range_mode", "natural")
        target_station_id = int(natural_out_of_range[0])
        print(
            "out_range_station",
            natural_out_of_range[0],
            natural_out_of_range[2],
            natural_out_of_range[1],
        )

    dock_fail_status, dock_fail_payload = request_json(
        "POST",
        f"/api/ships/{ship_id}/dock",
        token=token,
        body={"station_id": target_station_id},
    )
    print("dock_out_range_status", dock_fail_status)

    failure_message = extract_error_message(dock_fail_payload)
    print("dock_out_range_message", failure_message)

    if dock_fail_status != 409:
        raise RuntimeError("Out-of-range dock did not return 409")

    if "docking computer range exceeded" not in failure_message.lower():
        raise RuntimeError("Out-of-range dock error message mismatch")

    print("SMOKE_DOCKING_RANGE_OK")


if __name__ == "__main__":
    run()
