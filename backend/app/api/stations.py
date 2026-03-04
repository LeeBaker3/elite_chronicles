from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.models.cargo import ShipCargo
from app.models.ship import Ship
from app.db.session import get_db
from app.models.user import User
from app.models.world import Commodity, Station, StationInventory
from app.schemas.stations import StationSummary
from app.schemas.trade import InventoryItem, TradeRequest

router = APIRouter()


@router.get("", response_model=list[StationSummary])
def list_stations(db: Session = Depends(get_db)):
    stations = db.query(Station).order_by(Station.id.asc()).all()
    return [
        StationSummary(
            id=station.id,
            name=station.name,
            system_id=station.system_id,
        )
        for station in stations
    ]


@router.get("/{station_id}/inventory", response_model=list[InventoryItem])
def get_inventory(station_id: int, db: Session = Depends(get_db)):
    items = (
        db.query(Commodity, StationInventory)
        .outerjoin(
            StationInventory,
            (
                (StationInventory.commodity_id == Commodity.id)
                & (StationInventory.station_id == station_id)
            ),
        )
        .order_by(Commodity.id.asc())
        .all()
    )
    return [
        InventoryItem(
            name=commodity.name,
            commodity_id=commodity.id,
            quantity=int(item.quantity) if item is not None else 0,
            buy_price=(
                int(item.buy_price)
                if item is not None
                else int(commodity.base_price)
            ),
            sell_price=(
                int(item.sell_price)
                if item is not None
                else int(commodity.base_price)
            ),
        )
        for commodity, item in items
    ]


@router.post("/{station_id}/trade")
def trade(
    station_id: int,
    payload: TradeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    commodity = (
        db.query(Commodity)
        .filter(Commodity.id == payload.commodity_id)
        .first()
    )
    if commodity is None:
        raise HTTPException(status_code=404, detail="Commodity not found")

    item = (
        db.query(StationInventory)
        .filter(
            StationInventory.station_id == station_id,
            StationInventory.commodity_id == payload.commodity_id,
        )
        .first()
    )
    if item is None:
        item = StationInventory(
            station_id=station_id,
            commodity_id=payload.commodity_id,
            quantity=0,
            max_capacity=0,
            buy_price=int(commodity.base_price),
            sell_price=int(commodity.base_price),
            version=0,
        )
        db.add(item)
        db.flush()
    if payload.qty <= 0:
        raise HTTPException(
            status_code=422, detail="Quantity must be positive")

    if payload.ship_id is None:
        raise HTTPException(status_code=422, detail="Ship ID is required")

    ship = db.query(Ship).filter(Ship.id == payload.ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail="Ship not found")
    if ship.owner_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Ship access denied")
    if ship.docked_station_id != station_id:
        raise HTTPException(
            status_code=409,
            detail="Ship must be docked at this station",
        )

    cargo_row = None
    cargo_row = (
        db.query(ShipCargo)
        .filter(
            ShipCargo.ship_id == ship.id,
            ShipCargo.commodity_id == payload.commodity_id,
        )
        .first()
    )

    if payload.direction == "buy":
        if item.quantity < payload.qty:
            raise HTTPException(status_code=409, detail="Insufficient stock")

        total_cost = int(item.buy_price) * payload.qty
        user_credits = int(current_user.credits or 0)
        if user_credits < total_cost:
            raise HTTPException(status_code=409, detail="Insufficient credits")

        if ship.cargo_capacity <= 0:
            raise HTTPException(
                status_code=409,
                detail="No cargo hold installed",
            )

        current_used = (
            db.query(ShipCargo)
            .filter(ShipCargo.ship_id == ship.id)
            .all()
        )
        cargo_used = sum(row.quantity for row in current_used)
        if cargo_used + payload.qty > ship.cargo_capacity:
            raise HTTPException(
                status_code=409, detail="Cargo hold is full")

        if cargo_row is None:
            cargo_row = ShipCargo(
                ship_id=ship.id,
                commodity_id=payload.commodity_id,
                quantity=0,
            )
            db.add(cargo_row)
        cargo_row.quantity += payload.qty
        cargo_row.version = (cargo_row.version or 0) + 1

        item.quantity -= payload.qty
        current_user.credits = user_credits - total_cost
    elif payload.direction == "sell":
        if cargo_row is None or cargo_row.quantity < payload.qty:
            raise HTTPException(
                status_code=409, detail="Insufficient cargo")
        cargo_row.quantity -= payload.qty
        cargo_row.version = (cargo_row.version or 0) + 1

        item.quantity += payload.qty
        current_user.credits = int(current_user.credits or 0) + (
            int(item.sell_price) * payload.qty
        )
    else:
        raise HTTPException(status_code=422, detail="Invalid direction")

    item.version = (item.version or 0) + 1
    db.commit()

    return {
        "status": "ok",
        "remaining": item.quantity,
        "credits": int(current_user.credits or 0),
    }
