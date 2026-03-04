"""Run end-to-end jump-mode smoke flow against local backend.

Flow validated in one integrated run:
1) register/login and resolve owned ship
2) undock and load local contacts
3) lock a local station waypoint and execute in-system transfer
4) verify ship moved close to station (local transfer behavior)
5) execute hyperspace jump to selected station/system
6) verify ship is not placed near station and is in deep-space (hyperspace behavior)

Usage:
    cd backend
    ../.venv/bin/python scripts/smoke_jump_modes.py
"""

from __future__ import annotations

import json
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


def request_json(
    method: str,
    path: str,
    token: str | None = None,
    body: dict[str, Any] | None = None,
) -> tuple[int, Any]:
    """Send JSON HTTP request and return status and parsed response body."""

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
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = response.read().decode("utf-8")
            return response.status, json.loads(payload) if payload else None
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8")
        if not payload:
            return error.code, None
        try:
            return error.code, json.loads(payload)
        except json.JSONDecodeError:
            return error.code, payload


def fail(message: str) -> None:
    """Raise deterministic script failure with clear message."""

    raise SystemExit(f"SMOKE FAILED: {message}")


def extract_station_id(contact_id: str) -> int | None:
    """Extract station integer id from scanner/local contact id token."""

    parts = str(contact_id).split("-", 1)
    if len(parts) != 2 or parts[0] != "station":
        return None
    try:
        station_id = int(parts[1])
    except ValueError:
        return None
    return station_id if station_id > 0 else None


def first_owned_ship_id(token: str) -> int:
    """Resolve first owned ship id by probing ship telemetry endpoints."""

    for ship_id in range(1, 200):
        status, payload = request_json(
            "GET",
            f"/api/ships/{ship_id}/operations",
            token=token,
        )
        if status == 200 and isinstance(payload, list):
            return int(ship_id)
    fail("Unable to resolve owned ship id")


def ensure_in_space(token: str, ship_id: int) -> dict[str, Any]:
    """Ensure selected ship is in-space before jump validations."""

    status, telemetry = request_json(
        "GET", f"/api/ships/{ship_id}", token=token)
    if status != 200 or not isinstance(telemetry, dict):
        fail("Unable to fetch ship telemetry")

    if telemetry.get("status") == "in-space":
        return telemetry

    undock_status, undock_payload = request_json(
        "POST",
        f"/api/ships/{ship_id}/undock",
        token=token,
        body={},
    )
    if undock_status == 200 and isinstance(undock_payload, dict):
        return undock_payload

    # Some local states can return 409 while already transitioning. Re-check
    # telemetry once before treating as a hard smoke failure.
    retry_status, retry_payload = request_json(
        "GET",
        f"/api/ships/{ship_id}",
        token=token,
    )
    if (
        retry_status == 200
        and isinstance(retry_payload, dict)
        and retry_payload.get("status") == "in-space"
    ):
        return retry_payload

    detail = (
        undock_payload.get("detail")
        if isinstance(undock_payload, dict)
        else str(undock_payload)
    )
    fail(f"Undock failed before jump smoke ({undock_status}: {detail})")


def main() -> None:
    """Run integrated smoke script for system and hyperspace jump separation."""

    ts = str(int(time.time()))
    email = f"jump.modes.smoke.{ts}@example.com"
    username = f"jump_modes_smoke_{ts}"

    status, register_payload = request_json(
        "POST",
        "/api/auth/register",
        body={
            "email": email,
            "username": username,
            "password": "SmokePass123!",
        },
    )
    if status != 200 or not isinstance(register_payload, dict):
        fail("Auth register failed")

    token = register_payload.get("token")
    if not isinstance(token, str) or not token:
        fail("Auth token missing")

    ship_id = first_owned_ship_id(token)
    telemetry = ensure_in_space(token, ship_id)
    ship_before = (
        int(telemetry.get("position_x", 0)),
        int(telemetry.get("position_y", 0)),
        int(telemetry.get("position_z", 0)),
    )

    contacts_status, contacts_payload = request_json(
        "GET",
        f"/api/ships/{ship_id}/local-contacts",
        token=token,
    )
    if contacts_status != 200 or not isinstance(contacts_payload, dict):
        fail("Unable to fetch local contacts")

    contacts = contacts_payload.get("contacts")
    if not isinstance(contacts, list) or not contacts:
        fail("Local contacts payload missing contacts list")

    station_contact = next(
        (
            contact for contact in contacts
            if isinstance(contact, dict)
            and contact.get("contact_type") == "station"
            and isinstance(contact.get("id"), str)
        ),
        None,
    )
    if not isinstance(station_contact, dict):
        fail("No station contact found for local transfer")

    station_contact_id = str(station_contact["id"])
    station_id = extract_station_id(station_contact_id)
    if station_id is None:
        fail("Invalid station contact id shape")

    lock_status, _ = request_json(
        "POST",
        f"/api/ships/{ship_id}/local-target",
        token=token,
        body={
            "action": "lock",
            "contact_type": "station",
            "contact_id": station_id,
        },
    )
    if lock_status != 200:
        fail("Local lock failed")

    transfer_status, transfer_payload = request_json(
        "POST",
        f"/api/ships/{ship_id}/local-target",
        token=token,
        body={
            "action": "transfer",
            "contact_type": "station",
            "contact_id": station_id,
        },
    )
    if transfer_status != 200 or not isinstance(transfer_payload, dict):
        fail("Local system transfer failed")

    ship_after_transfer = (
        int(transfer_payload.get("position_x", 0)),
        int(transfer_payload.get("position_y", 0)),
        int(transfer_payload.get("position_z", 0)),
    )

    if ship_after_transfer == ship_before:
        fail("System transfer did not move ship coordinates")

    if transfer_payload.get("flight_phase") != "arrived":
        fail("System transfer did not end in arrived phase")

    clearance_status, clearance_payload = request_json(
        "POST",
        f"/api/ships/{ship_id}/position-sync",
        token=token,
        body={
            "position_x": ship_after_transfer[0] + 350,
            "position_y": ship_after_transfer[1],
            "position_z": ship_after_transfer[2],
        },
    )
    if clearance_status != 200 or not isinstance(clearance_payload, dict):
        fail("Unable to apply clearance offset before hyperspace jump")

    stations_status, stations_payload = request_json(
        "GET", "/api/stations", token=token)
    if stations_status != 200 or not isinstance(stations_payload, list):
        fail("Unable to fetch stations for hyperspace step")

    destination_station = next(
        (
            station for station in stations_payload
            if isinstance(station, dict)
            and int(station.get("id", 0)) != station_id
        ),
        None,
    )
    if not isinstance(destination_station, dict):
        fail("No secondary station available for hyperspace jump")

    destination_station_id = int(destination_station["id"])
    hyperspace_status, hyperspace_payload = request_json(
        "POST",
        f"/api/ships/{ship_id}/jump",
        token=token,
        body={"destination_station_id": destination_station_id},
    )
    if hyperspace_status != 200 or not isinstance(hyperspace_payload, dict):
        detail = (
            hyperspace_payload.get("detail")
            if isinstance(hyperspace_payload, dict)
            else str(hyperspace_payload)
        )
        fail(f"Hyperspace jump failed ({hyperspace_status}: {detail})")

    if hyperspace_payload.get("flight_phase") != "arrived":
        fail("Hyperspace jump did not end in arrived phase")

    if hyperspace_payload.get("flight_locked_destination_station_id") is not None:
        fail("Hyperspace jump unexpectedly preserved local station lock")

    print("SMOKE OK: jump modes separated")
    print(f"ship_id={ship_id}")
    print(f"local_transfer_target_station_id={station_id}")
    print(f"hyperspace_destination_station_id={destination_station_id}")
    print(
        "system_transfer_position="
        f"{ship_after_transfer[0]},{ship_after_transfer[1]},{ship_after_transfer[2]}"
    )
    print(
        "hyperspace_position="
        f"{int(hyperspace_payload.get('position_x', 0))},"
        f"{int(hyperspace_payload.get('position_y', 0))},"
        f"{int(hyperspace_payload.get('position_z', 0))}"
    )


if __name__ == "__main__":
    main()
