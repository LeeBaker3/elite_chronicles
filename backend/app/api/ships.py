from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models.cargo import ShipCargo
from app.db.session import get_db
from app.models.ship import Ship
from app.models.world import Commodity
from app.schemas.ships import ShipResponse
from app.schemas.ships import CargoItem, ShipCargoResponse

router = APIRouter()


@router.get("/{ship_id}", response_model=ShipResponse)
def get_ship(ship_id: int, db: Session = Depends(get_db)):
    ship = db.query(Ship).filter(Ship.id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail="Ship not found")

    return ShipResponse(
        id=ship.id,
        name=ship.name,
        hull_current=ship.hull_current,
        shields_current=ship.shields_current,
        energy_current=ship.energy_current,
        fuel_current=ship.fuel_current,
        cargo_capacity=ship.cargo_capacity,
        status=ship.status,
    )


@router.get("/{ship_id}/cargo", response_model=ShipCargoResponse)
def get_ship_cargo(ship_id: int, db: Session = Depends(get_db)):
    ship = db.query(Ship).filter(Ship.id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail="Ship not found")

    rows = (
        db.query(ShipCargo, Commodity)
        .join(Commodity, ShipCargo.commodity_id == Commodity.id)
        .filter(ShipCargo.ship_id == ship_id, ShipCargo.quantity > 0)
        .all()
    )

    items = [
        CargoItem(
            commodity_id=cargo.commodity_id,
            commodity_name=commodity.name,
            quantity=cargo.quantity,
        )
        for cargo, commodity in rows
    ]
    cargo_used = sum(item.quantity for item in items)
    cargo_free = max(ship.cargo_capacity - cargo_used, 0)

    return ShipCargoResponse(
        ship_id=ship.id,
        cargo_capacity=ship.cargo_capacity,
        cargo_used=cargo_used,
        cargo_free=cargo_free,
        items=items,
    )
