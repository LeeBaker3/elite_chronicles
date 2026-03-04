"""System simulation catch-up services for local chart reads."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.world import Commodity
from app.models.world import StarSystem
from app.models.world import Station
from app.models.world import StationInventory
from app.models.world import SystemPoliticalState
from app.models.world import SystemSimulationState
from app.services.economy_service import compute_next_quantity

ECONOMY_TICK_SECONDS = 60
POLITICS_TICK_SECONDS = 120
MAX_ECONOMY_TICKS_PER_READ = 120
MAX_POLITICS_TICKS_PER_READ = 120


def _coerce_utc_timestamp(value: datetime | None) -> datetime:
    """Return a timezone-aware UTC timestamp from a nullable value."""

    if value is None:
        return datetime.now(timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _clamp(value: int, lower: int, upper: int) -> int:
    """Clamp an integer to a bounded inclusive range."""

    return max(lower, min(value, upper))


def _security_level_from_stability(stability_score: int) -> str:
    """Map numeric stability score to low/medium/high security level."""

    if stability_score >= 67:
        return "high"
    if stability_score >= 34:
        return "medium"
    return "low"


def _ensure_simulation_state(
    db: Session,
    system_id: int,
    now: datetime,
) -> SystemSimulationState:
    """Load or create simulation state row for one star system."""

    state = (
        db.query(SystemSimulationState)
        .filter(SystemSimulationState.system_id == system_id)
        .first()
    )
    if state is not None:
        return state

    state = SystemSimulationState(
        system_id=system_id,
        last_economy_tick_at=now,
        last_politics_tick_at=now,
        economy_tick_cursor=0,
        politics_tick_cursor=0,
        version=0,
    )
    db.add(state)
    db.flush()
    return state


def _ensure_political_state(
    db: Session,
    system_id: int,
    now: datetime,
) -> SystemPoliticalState:
    """Load or create political state row for one star system."""

    state = (
        db.query(SystemPoliticalState)
        .filter(SystemPoliticalState.system_id == system_id)
        .first()
    )
    if state is not None:
        return state

    state = SystemPoliticalState(
        system_id=system_id,
        faction_control_json={},
        security_level="medium",
        stability_score=50,
        updated_at=now,
    )
    db.add(state)
    db.flush()
    return state


def _apply_economy_ticks(
    db: Session,
    system_id: int,
    tick_count: int,
    now: datetime,
) -> bool:
    """Apply economy catch-up ticks to station inventory in one system."""

    if tick_count <= 0:
        return False

    rows = (
        db.query(StationInventory, Commodity)
        .join(Commodity, Commodity.id == StationInventory.commodity_id)
        .join(Station, Station.id == StationInventory.station_id)
        .filter(Station.system_id == system_id)
        .all()
    )

    dirty = False
    for inventory, commodity in rows:
        current_quantity = int(inventory.quantity or 0)
        max_capacity = int(inventory.max_capacity or 0)
        next_quantity = compute_next_quantity(
            quantity=current_quantity,
            max_capacity=max_capacity,
            category=commodity.category,
            steps=tick_count,
        )

        if next_quantity != current_quantity:
            inventory.quantity = next_quantity
            dirty = True

        inventory.version = int(inventory.version or 0) + tick_count
        inventory.updated_at = now

    return dirty


def _apply_political_ticks(
    state: SystemPoliticalState,
    system: StarSystem,
    tick_count: int,
    now: datetime,
) -> None:
    """Apply deterministic political catch-up updates for one system."""

    if tick_count <= 0:
        return

    stability_score = int(state.stability_score or 50)
    base_cursor = int(system.id) + int(state.system_id)

    for tick_offset in range(1, tick_count + 1):
        parity_key = base_cursor + tick_offset
        delta = 1 if parity_key % 2 == 0 else -1
        if parity_key % 7 == 0:
            delta *= 2
        stability_score = _clamp(stability_score + delta, 0, 100)

    state.stability_score = stability_score
    state.security_level = _security_level_from_stability(stability_score)
    state.updated_at = now


def catch_up_system_simulation(
    *,
    db: Session,
    system: StarSystem,
) -> tuple[SystemSimulationState, SystemPoliticalState]:
    """Catch up mutable simulation state by elapsed time on system read."""

    now = datetime.now(timezone.utc)
    simulation_state = _ensure_simulation_state(db, int(system.id), now)
    political_state = _ensure_political_state(db, int(system.id), now)

    last_economy_tick_at = _coerce_utc_timestamp(
        simulation_state.last_economy_tick_at)
    last_politics_tick_at = _coerce_utc_timestamp(
        simulation_state.last_politics_tick_at)

    economy_elapsed_seconds = max(
        0,
        int((now - last_economy_tick_at).total_seconds()),
    )
    politics_elapsed_seconds = max(
        0,
        int((now - last_politics_tick_at).total_seconds()),
    )

    economy_tick_count = min(
        economy_elapsed_seconds // ECONOMY_TICK_SECONDS,
        MAX_ECONOMY_TICKS_PER_READ,
    )
    politics_tick_count = min(
        politics_elapsed_seconds // POLITICS_TICK_SECONDS,
        MAX_POLITICS_TICKS_PER_READ,
    )

    _apply_economy_ticks(
        db=db,
        system_id=int(system.id),
        tick_count=economy_tick_count,
        now=now,
    )
    _apply_political_ticks(
        state=political_state,
        system=system,
        tick_count=politics_tick_count,
        now=now,
    )

    if economy_tick_count > 0:
        simulation_state.economy_tick_cursor = int(
            simulation_state.economy_tick_cursor or 0
        ) + economy_tick_count
        simulation_state.last_economy_tick_at = (
            last_economy_tick_at
            + timedelta(seconds=economy_tick_count * ECONOMY_TICK_SECONDS)
        )

    if politics_tick_count > 0:
        simulation_state.politics_tick_cursor = int(
            simulation_state.politics_tick_cursor or 0
        ) + politics_tick_count
        simulation_state.last_politics_tick_at = (
            last_politics_tick_at
            + timedelta(seconds=politics_tick_count * POLITICS_TICK_SECONDS)
        )

    if economy_tick_count > 0 or politics_tick_count > 0:
        simulation_state.version = int(simulation_state.version or 0) + 1

    db.commit()
    db.refresh(simulation_state)
    db.refresh(political_state)

    return simulation_state, political_state
