from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models.cargo import ShipCargo
from app.models.ship import Ship
from app.db.session import get_db
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

    ship = None
    if payload.ship_id is not None:
        ship = db.query(Ship).filter(Ship.id == payload.ship_id).first()
        if not ship:
            raise HTTPException(status_code=404, detail="Ship not found")

        if ship.docked_station_id != station_id:
            raise HTTPException(
                status_code=409,
                detail="Ship must be docked at this station",
            )

    cargo_row = None
    if ship is not None:
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

        if ship is not None:
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
    elif payload.direction == "sell":
        if ship is not None:
            if cargo_row is None or cargo_row.quantity < payload.qty:
                raise HTTPException(
                    status_code=409, detail="Insufficient cargo")
            cargo_row.quantity -= payload.qty
            cargo_row.version = (cargo_row.version or 0) + 1

        item.quantity += payload.qty
    else:
        raise HTTPException(status_code=422, detail="Invalid direction")

    item.version = (item.version or 0) + 1
    db.commit()

    return {"status": "ok", "remaining": item.quantity}
