from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.story import StorySession
from app.models.user import User
from app.schemas.story import (
    StoryConfirmRequest,
    StoryInterpretRequest,
    StoryInterpretResponse,
    StoryProceedResponse,
    StoryStartResponse,
)

router = APIRouter()


@router.post("/start/{location_id}", response_model=StoryStartResponse)
def start_story(
    location_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = StorySession(
        user_id=current_user.id,
        location_type="station",
        location_id=location_id,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return StoryStartResponse(session_id=session.id, status=session.status)


@router.post("/interpret", response_model=StoryInterpretResponse)
def interpret(
    payload: StoryInterpretRequest,
    current_user: User = Depends(get_current_user),
):
    if not payload.player_input.strip():
        raise HTTPException(status_code=422, detail="Input required")
    interpretation = f"Player intends: {payload.player_input.strip()}"
    return StoryInterpretResponse(
        interpretation=interpretation, requires_confirmation=True
    )


@router.post("/confirm")
def confirm(
    payload: StoryConfirmRequest,
    current_user: User = Depends(get_current_user),
):
    if not payload.confirm:
        return {"status": "cancelled"}
    return {"status": "confirmed"}


@router.post("/proceed", response_model=StoryProceedResponse)
def proceed(
    payload: StoryConfirmRequest,
    current_user: User = Depends(get_current_user),
):
    if not payload.confirm:
        raise HTTPException(status_code=409, detail="Action not confirmed")
    return StoryProceedResponse(outcome="Action applied", next_state="node:1")
