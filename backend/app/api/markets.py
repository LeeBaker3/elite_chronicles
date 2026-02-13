from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.world import Station, StationInventory
from app.schemas.markets import MarketStationSummary

router = APIRouter()


@router.get("/{system_id}/summary", response_model=list[MarketStationSummary])
def get_market_summary(system_id: int, db: Session = Depends(get_db)):
    """Return per-station aggregate market summary for a star system."""
    rows = (
        db.query(
            Station.id.label("station_id"),
            Station.name.label("station_name"),
            func.count(StationInventory.id).label("commodity_count"),
            func.sum(
                case(
                    (
                        StationInventory.quantity
                        <= func.coalesce(StationInventory.max_capacity, 0) * 0.25,
                        1,
                    ),
                    else_=0,
                )
            ).label("scarcity_count"),
            func.max(StationInventory.updated_at).label("last_inventory_update"),
        )
        .outerjoin(StationInventory, StationInventory.station_id == Station.id)
        .filter(Station.system_id == system_id)
        .group_by(Station.id, Station.name)
        .order_by(Station.id.asc())
        .all()
    )

    return [
        MarketStationSummary(
            station_id=row.station_id,
            station_name=row.station_name,
            commodity_count=int(row.commodity_count or 0),
            scarcity_count=int(row.scarcity_count or 0),
            last_inventory_update=(
                row.last_inventory_update.isoformat()
                if isinstance(row.last_inventory_update, datetime)
                else None
            ),
        )
        for row in rows
    ]
