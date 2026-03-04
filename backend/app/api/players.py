from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.players import PlayerMeResponse

router = APIRouter()


@router.get("/me", response_model=PlayerMeResponse)
def get_player_me(current_user: User = Depends(get_current_user)):
    """Return authenticated player profile and current state."""
    return PlayerMeResponse(
        id=current_user.id,
        email=current_user.email,
        username=current_user.username,
        role=current_user.role,
        credits=current_user.credits,
        is_alive=current_user.is_alive,
        location_type=current_user.location_type,
        location_id=current_user.location_id,
    )
