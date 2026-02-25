from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.models.user import User
from app.models.world import Commodity, Station, StationInventory
from app.schemas.markets import (
    MarketStationSummary,
    MarketTickRequest,
    MarketTickResponse,
)
from app.services.economy_service import compute_next_quantity, summarize_market_rows

router = APIRouter()


@router.post("/tick", response_model=MarketTickResponse)
def run_market_tick(
    payload: MarketTickRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Run deterministic economy tick updates for station inventory rows."""
    _ = current_user
    steps = max(1, min(payload.steps, 24))

    query = (
        db.query(StationInventory, Commodity, Station)
        .join(Commodity, Commodity.id == StationInventory.commodity_id)
        .join(Station, Station.id == StationInventory.station_id)
    )
    if payload.system_id is not None:
        query = query.filter(Station.system_id == payload.system_id)

    rows = query.all()
    now = datetime.now(timezone.utc)
    for inventory, commodity, _station in rows:
        inventory.quantity = compute_next_quantity(
            quantity=int(inventory.quantity or 0),
            max_capacity=int(inventory.max_capacity or 0),
            category=commodity.category,
            steps=steps,
        )
        inventory.updated_at = now
        inventory.version = (inventory.version or 0) + 1

    db.commit()
    return MarketTickResponse(
        status="ok",
        steps=steps,
        affected_rows=len(rows),
    )


@router.get("/{system_id}/summary", response_model=list[MarketStationSummary])
def get_market_summary(
    system_id: int,
    simulate_ticks: int = 0,
    db: Session = Depends(get_db),
):
    """Return per-station aggregate market summary for a star system."""
    rows = (
        db.query(
            Station.id.label("station_id"),
            Station.name.label("station_name"),
            StationInventory.quantity.label("quantity"),
            StationInventory.max_capacity.label("max_capacity"),
            StationInventory.updated_at.label("updated_at"),
            Commodity.category.label("category"),
        )
        .outerjoin(StationInventory, StationInventory.station_id == Station.id)
        .outerjoin(Commodity, Commodity.id == StationInventory.commodity_id)
        .filter(Station.system_id == system_id)
        .order_by(Station.id.asc())
        .all()
    )
    return summarize_market_rows(rows=rows, simulate_ticks=max(0, simulate_ticks))
