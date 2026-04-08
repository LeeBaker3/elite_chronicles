from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.models.ship import Ship
from app.models.user import User
from app.schemas.players import PlayerMeResponse
from sqlalchemy.orm import Session

from app.db.session import get_db

router = APIRouter()


@router.get("/me", response_model=PlayerMeResponse)
def get_player_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return authenticated player profile and current state."""
    primary_ship_id = (
        db.query(Ship.id)
        .filter(Ship.owner_user_id == current_user.id)
        .order_by(Ship.id.asc())
        .limit(1)
        .scalar()
    )
    return PlayerMeResponse(
        id=current_user.id,
        email=current_user.email,
        username=current_user.username,
        role=current_user.role,
        credits=current_user.credits,
        is_alive=current_user.is_alive,
        location_type=current_user.location_type,
        location_id=current_user.location_id,
        primary_ship_id=primary_ship_id,
    )
