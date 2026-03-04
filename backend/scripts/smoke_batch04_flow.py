"""Run a live Batch 04 end-to-end API smoke flow against local backend."""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from sqlalchemy import func

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.session import SessionLocal
from app.models.user import User
from app.models.world import Commodity, Station, StationInventory


BASE_URL = "http://127.0.0.1:8000"


def ensure_minimum_stations() -> None:
    """Ensure at least two stations exist so Batch 04 travel loop can execute."""

    session = SessionLocal()
    try:
        station_count = int(session.query(
            func.count(Station.id)).scalar() or 0)
        if station_count >= 2:
            return

        origin_station = session.query(
            Station).order_by(Station.id.asc()).first()
        if origin_station is None:
            raise RuntimeError("No stations available to clone for smoke flow")

        seeded_station = Station(
            system_id=origin_station.system_id,
            name=f"{origin_station.name} Annex",
            archetype_id=origin_station.archetype_id,
            position_x=int(origin_station.position_x or 0) + 25,
            position_y=int(origin_station.position_y or 0),
            position_z=int(origin_station.position_z or 0) + 10,
            services_json=dict(origin_station.services_json or {}),
            faction_id=origin_station.faction_id,
            tech_level=origin_station.tech_level,
            ai_story_available=bool(origin_station.ai_story_available),
        )
        session.add(seeded_station)
        session.commit()
    finally:
        session.close()


def ensure_minimum_market_data() -> None:
    """Ensure first two stations have at least one tradable commodity row."""

    session = SessionLocal()
    try:
        stations = session.query(Station).order_by(
            Station.id.asc()).limit(2).all()
        if len(stations) < 2:
            raise RuntimeError("Need two stations before seeding market data")

        commodity = session.query(Commodity).order_by(
            Commodity.id.asc()).first()
        if commodity is None:
            commodity = Commodity(
                name="Smoke Alloy",
                category="industrial",
                base_price=110,
                volatility=3,
                illegal_flag=False,
            )
            session.add(commodity)
            session.flush()

        for station in stations:
            inventory = (
                session.query(StationInventory)
                .filter(
                    StationInventory.station_id == station.id,
                    StationInventory.commodity_id == commodity.id,
                )
                .first()
            )
            if inventory is None:
                inventory = StationInventory(
                    station_id=station.id,
                    commodity_id=commodity.id,
                    quantity=40,
                    max_capacity=120,
                    buy_price=commodity.base_price,
                    sell_price=commodity.base_price + 20,
                    version=0,
                )
                session.add(inventory)
            else:
                inventory.quantity = max(int(inventory.quantity or 0), 40)
                inventory.max_capacity = max(
                    int(inventory.max_capacity or 0), 120)
                inventory.buy_price = max(int(inventory.buy_price or 0), 80)
                inventory.sell_price = max(
                    int(inventory.sell_price or 0), inventory.buy_price + 5)

        session.commit()
    finally:
        session.close()


def ensure_user_credits(user_id: int, minimum_credits: int = 2_000) -> None:
    """Ensure smoke user has enough credits to execute buy trade step."""

    session = SessionLocal()
    try:
        user = session.query(User).filter(User.id == user_id).first()
        if user is None:
            raise RuntimeError("Smoke user not found while setting credits")
        current_credits = int(user.credits or 0)
        if current_credits < minimum_credits:
            user.credits = minimum_credits
            session.commit()
    finally:
        session.close()


def request_json(
    method: str,
    path: str,
    token: str | None = None,
    body: dict[str, Any] | None = None,
) -> tuple[int, Any]:
    """Send a JSON HTTP request and return status code with parsed payload."""

    data = None
    headers: dict[str, str] = {}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=data,
        headers=headers,
        method=method,
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as response:
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


def extract_message(payload: Any) -> str:
    """Extract a compact message for smoke output."""

    if isinstance(payload, dict):
        return (
            payload.get("detail")
            or payload.get("status")
            or payload.get("message")
            or payload.get("error", {}).get("message")
            or "ok"
        )
    if isinstance(payload, list):
        return f"list[{len(payload)}]"
    return str(payload)


def main() -> None:
    """Execute full Batch 04 loop and print deterministic step summary."""

    ensure_minimum_stations()
    ensure_minimum_market_data()

    ts = str(int(time.time()))
    email = f"batch04.smoke.{ts}@example.com"
    username = f"batch04_smoke_{ts}"

    steps: list[tuple[str, int, str]] = []

    status, register_payload = request_json(
        "POST",
        "/api/auth/register",
        body={
            "email": email,
            "username": username,
            "password": "SmokePass123!",
        },
    )
    steps.append(("POST /api/auth/register", status,
                 extract_message(register_payload)))
    if status != 200 or not isinstance(register_payload, dict):
        raise SystemExit("Failed to register smoke user")

    token = register_payload.get("token")
    if not isinstance(token, str) or not token:
        raise SystemExit("Auth token missing after register")

    user_id = register_payload.get("user_id")
    if not isinstance(user_id, int):
        raise SystemExit("Register response missing user_id")
    ensure_user_credits(user_id)

    status, stations_payload = request_json("GET", "/api/stations")
    steps.append(("GET /api/stations", status,
                 extract_message(stations_payload)))
    if status != 200 or not isinstance(stations_payload, list) or len(stations_payload) < 2:
        raise SystemExit("Need at least two stations for Batch 04 smoke flow")

    origin_station = stations_payload[0]
    destination_station = stations_payload[1]

    ship_id: int | None = None
    for candidate_ship_id in range(1, 200):
        probe_status, probe_payload = request_json(
            "POST",
            f"/api/ships/{candidate_ship_id}/dock",
            token=token,
            body={"station_id": origin_station["id"]},
        )
        if probe_status in (200, 409):
            ship_id = candidate_ship_id
            steps.append(
                (
                    f"POST /api/ships/{candidate_ship_id}/dock (probe)",
                    probe_status,
                    extract_message(probe_payload),
                )
            )
            break

    if ship_id is None:
        raise SystemExit("Unable to locate starter ship for smoke user")

    status, origin_inventory = request_json(
        "GET", f"/api/stations/{origin_station['id']}/inventory")
    steps.append(
        (f"GET /api/stations/{origin_station['id']}/inventory", status, extract_message(origin_inventory)))
    if status != 200 or not isinstance(origin_inventory, list) or not origin_inventory:
        raise SystemExit("Origin station inventory unavailable")

    selected_commodity = next(
        (item for item in origin_inventory if int(item.get("quantity", 0)) > 0),
        origin_inventory[0],
    )
    commodity_id = selected_commodity["commodity_id"]

    status, trade_origin_payload = request_json(
        "POST",
        f"/api/stations/{origin_station['id']}/trade",
        token=token,
        body={
            "direction": "buy",
            "commodity_id": commodity_id,
            "qty": 1,
            "ship_id": ship_id,
        },
    )
    steps.append(
        (
            f"POST /api/stations/{origin_station['id']}/trade (buy x1)",
            status,
            extract_message(trade_origin_payload),
        )
    )
    if status != 200:
        raise SystemExit("Origin trade step failed")

    status, undock_payload = request_json(
        "POST",
        f"/api/ships/{ship_id}/undock",
        token=token,
        body={},
    )
    steps.append(
        (f"POST /api/ships/{ship_id}/undock", status, extract_message(undock_payload)))
    if status != 200:
        raise SystemExit("Undock step failed")

    status, jump_payload = request_json(
        "POST",
        f"/api/ships/{ship_id}/jump",
        token=token,
        body={
            "destination_system_id": destination_station["system_id"],
            "destination_station_id": destination_station["id"],
        },
    )
    steps.append(
        (f"POST /api/ships/{ship_id}/jump", status, extract_message(jump_payload)))
    if status != 200:
        raise SystemExit("Jump step failed")

    status, dock_destination_payload = request_json(
        "POST",
        f"/api/ships/{ship_id}/dock",
        token=token,
        body={"station_id": destination_station["id"]},
    )
    steps.append(
        (
            f"POST /api/ships/{ship_id}/dock (destination)",
            status,
            extract_message(dock_destination_payload),
        )
    )
    if status != 200:
        raise SystemExit("Destination dock step failed")

    status, destination_trade_payload = request_json(
        "POST",
        f"/api/stations/{destination_station['id']}/trade",
        token=token,
        body={
            "direction": "sell",
            "commodity_id": commodity_id,
            "qty": 1,
            "ship_id": ship_id,
        },
    )
    if status == 200:
        steps.append(
            (
                f"POST /api/stations/{destination_station['id']}/trade (sell x1)",
                status,
                extract_message(destination_trade_payload),
            )
        )
    else:
        status, destination_trade_payload = request_json(
            "POST",
            f"/api/stations/{destination_station['id']}/trade",
            token=token,
            body={
                "direction": "buy",
                "commodity_id": commodity_id,
                "qty": 1,
                "ship_id": ship_id,
            },
        )
        steps.append(
            (
                f"POST /api/stations/{destination_station['id']}/trade (fallback buy x1)",
                status,
                extract_message(destination_trade_payload),
            )
        )
    if status != 200:
        raise SystemExit("Destination trade step failed")

    status, ops_payload = request_json(
        "GET",
        f"/api/ships/{ship_id}/operations?limit=6",
        token=token,
    )
    steps.append(
        (f"GET /api/ships/{ship_id}/operations?limit=6", status, extract_message(ops_payload)))

    print("SMOKE_OK=True")
    print(f"ORIGIN_STATION={origin_station['name']}#{origin_station['id']}")
    print(
        f"DESTINATION_STATION={destination_station['name']}#{destination_station['id']}"
    )
    print(f"SHIP_ID={ship_id}")
    for name, code, message in steps:
        print(f"STEP|{name}|STATUS={code}|MESSAGE={message}")


if __name__ == "__main__":
    main()
