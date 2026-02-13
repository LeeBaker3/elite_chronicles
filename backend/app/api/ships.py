from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.models.cargo import ShipCargo
from app.db.session import get_db
from app.models.ship import Ship
from app.models.user import User
from app.models.world import Station
from app.models.world import Commodity
from app.schemas.ships import DockRequest, RefuelRequest, ShipResponse
from app.schemas.ships import CargoItem, ShipCargoResponse

router = APIRouter()


def _get_ship_for_user(ship_id: int, user: User, db: Session) -> Ship:
    ship = db.query(Ship).filter(Ship.id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail="Ship not found")
    if ship.owner_user_id != user.id:
        raise HTTPException(status_code=403, detail="Ship access denied")
    return ship


def _to_ship_response(ship: Ship) -> ShipResponse:
    return ShipResponse(
        id=ship.id,
        name=ship.name,
        hull_current=ship.hull_current,
        shields_current=ship.shields_current,
        energy_current=ship.energy_current,
        fuel_current=ship.fuel_current,
        fuel_cap=ship.fuel_cap,
        cargo_capacity=ship.cargo_capacity,
        status=ship.status,
        docked_station_id=ship.docked_station_id,
    )


@router.get("/{ship_id}", response_model=ShipResponse)
def get_ship(ship_id: int, db: Session = Depends(get_db)):
    ship = db.query(Ship).filter(Ship.id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail="Ship not found")

    return _to_ship_response(ship)


@router.post("/{ship_id}/dock", response_model=ShipResponse)
def dock_ship(
    ship_id: int,
    payload: DockRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ship = _get_ship_for_user(ship_id, current_user, db)
    station = db.query(Station).filter(Station.id == payload.station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    if ship.status == "docked" and ship.docked_station_id == payload.station_id:
        raise HTTPException(status_code=409, detail="Ship already docked at this station")

    ship.status = "docked"
    ship.docked_station_id = payload.station_id
    ship.version = (ship.version or 0) + 1
    db.commit()
    db.refresh(ship)
    return _to_ship_response(ship)


@router.post("/{ship_id}/undock", response_model=ShipResponse)
def undock_ship(
    ship_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ship = _get_ship_for_user(ship_id, current_user, db)
    if ship.status != "docked" or ship.docked_station_id is None:
        raise HTTPException(status_code=409, detail="Ship is not docked")

    ship.status = "in-space"
    ship.docked_station_id = None
    ship.version = (ship.version or 0) + 1
    db.commit()
    db.refresh(ship)
    return _to_ship_response(ship)


@router.post("/{ship_id}/refuel", response_model=ShipResponse)
def refuel_ship(
    ship_id: int,
    payload: RefuelRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ship = _get_ship_for_user(ship_id, current_user, db)
    if ship.status != "docked" or ship.docked_station_id is None:
        raise HTTPException(status_code=409, detail="Ship must be docked to refuel")

    if payload.amount is None:
        ship.fuel_current = ship.fuel_cap
    else:
        if payload.amount <= 0:
            raise HTTPException(status_code=422, detail="Refuel amount must be positive")
        ship.fuel_current = min(ship.fuel_current + payload.amount, ship.fuel_cap)

    ship.version = (ship.version or 0) + 1
    db.commit()
    db.refresh(ship)
    return _to_ship_response(ship)


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
