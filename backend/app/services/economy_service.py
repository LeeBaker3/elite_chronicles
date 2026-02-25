from datetime import datetime, timezone

from app.schemas.markets import MarketStationSummary

CATEGORY_RATES: dict[str, tuple[int, int]] = {
    "agricultural": (3, 1),
    "industrial": (2, 1),
    "medical": (1, 1),
    "illegal": (0, 1),
}


def _clamp(value: int, lower: int, upper: int) -> int:
    """Clamp an integer to an inclusive lower/upper range."""
    return max(lower, min(value, upper))


def compute_next_quantity(
    quantity: int,
    max_capacity: int,
    category: str | None,
    steps: int,
) -> int:
    """Compute deterministic next inventory quantity for tick simulation."""
    production, consumption = CATEGORY_RATES.get(category or "", (1, 1))
    next_quantity = quantity + (production - consumption) * steps
    return _clamp(next_quantity, 0, max_capacity)


def summarize_market_rows(
    rows: list,
    simulate_ticks: int,
) -> list[MarketStationSummary]:
    """Build per-station market summary rows from raw station/inventory rows."""
    station_map: dict[int, dict] = {}
    now = datetime.now(timezone.utc)

    for row in rows:
        station_id = int(row.station_id)
        station = station_map.setdefault(
            station_id,
            {
                "station_name": row.station_name,
                "commodity_count": 0,
                "scarcity_count": 0,
                "last_inventory_update": None,
            },
        )

        if row.quantity is None or row.max_capacity is None:
            continue

        station["commodity_count"] += 1
        simulated_quantity = compute_next_quantity(
            quantity=int(row.quantity),
            max_capacity=int(row.max_capacity),
            category=row.category,
            steps=simulate_ticks,
        )

        if simulated_quantity <= int(row.max_capacity) * 0.25:
            station["scarcity_count"] += 1

        updated_at = row.updated_at
        if (
            updated_at is not None
            and (
                station["last_inventory_update"] is None
                or updated_at > station["last_inventory_update"]
            )
        ):
            station["last_inventory_update"] = updated_at

    summaries: list[MarketStationSummary] = []
    for station_id, data in station_map.items():
        updated_at = data["last_inventory_update"]
        updated_seconds_ago = None
        stale = False
        if updated_at is not None:
            updated_seconds_ago = int((now - updated_at).total_seconds())
            stale = updated_seconds_ago > 900

        summaries.append(
            MarketStationSummary(
                station_id=station_id,
                station_name=data["station_name"],
                commodity_count=data["commodity_count"],
                scarcity_count=data["scarcity_count"],
                last_inventory_update=(
                    updated_at.isoformat() if updated_at is not None else None
                ),
                updated_seconds_ago=updated_seconds_ago,
                stale=stale,
            )
        )

    return sorted(summaries, key=lambda item: item.station_id)
