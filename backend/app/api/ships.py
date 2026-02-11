from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.ship import Ship
from app.schemas.ships import ShipResponse

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
        status=ship.status,
    )
