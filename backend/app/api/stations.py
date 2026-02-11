from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.world import Commodity, StationInventory
from app.schemas.trade import InventoryItem, TradeRequest

router = APIRouter()


@router.get("/{station_id}/inventory", response_model=list[InventoryItem])
def get_inventory(station_id: int, db: Session = Depends(get_db)):
    items = (
        db.query(StationInventory, Commodity)
        .join(Commodity, StationInventory.commodity_id == Commodity.id)
        .filter(StationInventory.station_id == station_id)
        .all()
    )
    return [
        InventoryItem(
            name=commodity.name,
            commodity_id=item.commodity_id,
            quantity=item.quantity,
            buy_price=item.buy_price,
            sell_price=item.sell_price,
        )
        for item, commodity in items
    ]


@router.post("/{station_id}/trade")
def trade(station_id: int, payload: TradeRequest, db: Session = Depends(get_db)):
    item = (
        db.query(StationInventory)
        .filter(
            StationInventory.station_id == station_id,
            StationInventory.commodity_id == payload.commodity_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Commodity not found")
    if payload.qty <= 0:
        raise HTTPException(
            status_code=422, detail="Quantity must be positive")

    if payload.direction == "buy":
        if item.quantity < payload.qty:
            raise HTTPException(status_code=409, detail="Insufficient stock")
        item.quantity -= payload.qty
    elif payload.direction == "sell":
        item.quantity += payload.qty
    else:
        raise HTTPException(status_code=422, detail="Invalid direction")

    item.version += 1
    db.commit()

    return {"status": "ok", "remaining": item.quantity}
