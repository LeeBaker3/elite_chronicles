from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.mission import Mission, MissionAssignment, Reputation
from app.models.user import User
from app.models.world import Station
from app.schemas.missions import (
    MissionAbandonResponse,
    MissionAcceptResponse,
    MissionCompleteResponse,
    MissionDummyResponse,
    MissionAssignmentResponse,
    MissionAvailableResponse,
)

router = APIRouter()
DUMMY_MISSION_TITLE = "Dummy Test Mission"


def _resolve_station_id(station_id: int | None, current_user: User) -> int:
    if station_id is not None:
        return station_id
    if current_user.location_type != "station" or current_user.location_id is None:
        raise HTTPException(
            status_code=422,
            detail="station_id is required when not docked at a station",
        )
    return int(current_user.location_id)


def _resolve_station_name(db: Session, station_id: int) -> str:
    """Resolve a station name for API responses with a safe fallback."""

    station_name = (
        db.query(Station.name)
        .filter(Station.id == station_id)
        .scalar()
    )
    return station_name or f"Station #{station_id}"


@router.post("/dev/dummy", response_model=MissionDummyResponse)
def create_dummy_mission(
    station_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create or reuse a dummy mission for quick UI testing."""
    target_station_id = _resolve_station_id(station_id, current_user)
    target_station_name = _resolve_station_name(db, target_station_id)

    mission = (
        db.query(Mission)
        .filter(
            Mission.station_id == target_station_id,
            Mission.title == DUMMY_MISSION_TITLE,
            Mission.status == "open",
        )
        .order_by(Mission.id.desc())
        .first()
    )

    if mission:
        return MissionDummyResponse(
            mission_id=mission.id,
            station_id=mission.station_id,
            station_name=target_station_name,
            title=mission.title,
            status=mission.status,
            created=False,
        )

    mission = Mission(
        station_id=target_station_id,
        faction_id=current_user.faction_id,
        title=DUMMY_MISSION_TITLE,
        description=(
            "Prototype contract for UI testing. "
            "Accept, complete, or abandon to validate mission flow."
        ),
        reward_credits=321,
        status="open",
    )
    db.add(mission)
    db.commit()
    db.refresh(mission)

    return MissionDummyResponse(
        mission_id=mission.id,
        station_id=mission.station_id,
        station_name=target_station_name,
        title=mission.title,
        status=mission.status,
        created=True,
    )


@router.get("/available", response_model=list[MissionAvailableResponse])
def get_available_missions(
    station_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return open station missions for the authenticated player."""
    target_station_id = _resolve_station_id(station_id, current_user)
    now = datetime.now(timezone.utc)
    resolved_station_name = _resolve_station_name(db, target_station_id)

    accepted_ids = {
        row.mission_id
        for row in db.query(MissionAssignment)
        .filter(MissionAssignment.user_id == current_user.id)
        .all()
    }

    rows = (
        db.query(Mission)
        .filter(
            Mission.station_id == target_station_id,
            Mission.status == "open",
        )
        .order_by(Mission.id.asc())
        .all()
    )

    payload: list[MissionAvailableResponse] = []
    for mission in rows:
        if mission.expires_at and mission.expires_at <= now:
            continue
        payload.append(
            MissionAvailableResponse(
                id=mission.id,
                station_id=mission.station_id,
                station_name=resolved_station_name,
                faction_id=mission.faction_id,
                title=mission.title,
                description=mission.description,
                reward_credits=mission.reward_credits,
                status=mission.status,
                expires_at=(
                    mission.expires_at.isoformat()
                    if mission.expires_at
                    else None
                ),
                accepted=mission.id in accepted_ids,
            )
        )

    return payload


@router.post("/{mission_id}/accept", response_model=MissionAcceptResponse)
def accept_mission(
    mission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Accept an open mission and apply a small faction reputation gain."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    now = datetime.now(timezone.utc)
    if mission.status != "open":
        raise HTTPException(status_code=409, detail="Mission is not open")
    if mission.expires_at and mission.expires_at <= now:
        raise HTTPException(status_code=409, detail="Mission has expired")

    existing = (
        db.query(MissionAssignment)
        .filter(
            MissionAssignment.mission_id == mission.id,
            MissionAssignment.user_id == current_user.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Mission already accepted")

    assignment = MissionAssignment(
        mission_id=mission.id,
        user_id=current_user.id,
        status="accepted",
    )
    db.add(assignment)

    reputation_value: int | None = None
    if mission.faction_id is not None:
        reputation = (
            db.query(Reputation)
            .filter(
                Reputation.user_id == current_user.id,
                Reputation.faction_id == mission.faction_id,
            )
            .first()
        )
        if not reputation:
            reputation = Reputation(
                user_id=current_user.id,
                faction_id=mission.faction_id,
                value=0,
            )
            db.add(reputation)
            db.flush()
        reputation.value += 1
        reputation_value = reputation.value

    db.commit()
    db.refresh(assignment)

    return MissionAcceptResponse(
        mission_id=assignment.mission_id,
        user_id=assignment.user_id,
        status=assignment.status,
        accepted_at=assignment.accepted_at.isoformat(),
        reputation_value=reputation_value,
    )


@router.post("/{mission_id}/complete", response_model=MissionCompleteResponse)
def complete_mission(
    mission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Complete an accepted mission, pay rewards, and update reputation."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    assignment = (
        db.query(MissionAssignment)
        .filter(
            MissionAssignment.mission_id == mission_id,
            MissionAssignment.user_id == current_user.id,
        )
        .first()
    )
    if not assignment:
        raise HTTPException(
            status_code=404, detail="Mission assignment not found")
    if assignment.status != "accepted":
        raise HTTPException(
            status_code=409, detail="Mission is not in accepted state")

    if (
        current_user.location_type != "station"
        or current_user.location_id is None
        or int(current_user.location_id) != mission.station_id
    ):
        raise HTTPException(
            status_code=409,
            detail="Dock at the mission station to complete this mission",
        )

    assignment.status = "completed"
    assignment.completed_at = datetime.now(timezone.utc)
    current_user.credits += int(mission.reward_credits or 0)

    reputation_value: int | None = None
    if mission.faction_id is not None:
        reputation = (
            db.query(Reputation)
            .filter(
                Reputation.user_id == current_user.id,
                Reputation.faction_id == mission.faction_id,
            )
            .first()
        )
        if not reputation:
            reputation = Reputation(
                user_id=current_user.id,
                faction_id=mission.faction_id,
                value=0,
            )
            db.add(reputation)
            db.flush()
        reputation.value += 2
        reputation_value = reputation.value

    db.commit()
    db.refresh(assignment)
    db.refresh(current_user)

    return MissionCompleteResponse(
        mission_id=mission.id,
        user_id=current_user.id,
        status=assignment.status,
        completed_at=(
            assignment.completed_at.isoformat()
            if assignment.completed_at
            else datetime.now(timezone.utc).isoformat()
        ),
        reward_credits=int(mission.reward_credits or 0),
        credits_after=int(current_user.credits or 0),
        reputation_value=reputation_value,
    )


@router.post("/{mission_id}/abandon", response_model=MissionAbandonResponse)
def abandon_mission(
    mission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Abandon an accepted mission without reward payout."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    assignment = (
        db.query(MissionAssignment)
        .filter(
            MissionAssignment.mission_id == mission_id,
            MissionAssignment.user_id == current_user.id,
        )
        .first()
    )
    if not assignment:
        raise HTTPException(
            status_code=404, detail="Mission assignment not found")
    if assignment.status != "accepted":
        raise HTTPException(
            status_code=409, detail="Mission is not in accepted state")

    assignment.status = "abandoned"
    assignment.completed_at = datetime.now(timezone.utc)

    reputation_value: int | None = None
    if mission.faction_id is not None:
        reputation = (
            db.query(Reputation)
            .filter(
                Reputation.user_id == current_user.id,
                Reputation.faction_id == mission.faction_id,
            )
            .first()
        )
        if reputation:
            reputation_value = reputation.value

    db.commit()
    db.refresh(assignment)
    db.refresh(current_user)

    return MissionAbandonResponse(
        mission_id=mission.id,
        user_id=current_user.id,
        status=assignment.status,
        abandoned_at=(
            assignment.completed_at.isoformat()
            if assignment.completed_at
            else datetime.now(timezone.utc).isoformat()
        ),
        credits_after=int(current_user.credits or 0),
        reputation_value=reputation_value,
    )


@router.get("/me", response_model=list[MissionAssignmentResponse])
def get_my_missions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return accepted missions for the authenticated player."""
    rows = (
        db.query(MissionAssignment, Mission, Station)
        .join(Mission, Mission.id == MissionAssignment.mission_id)
        .join(Station, Station.id == Mission.station_id)
        .filter(MissionAssignment.user_id == current_user.id)
        .order_by(MissionAssignment.id.desc())
        .all()
    )

    return [
        MissionAssignmentResponse(
            mission_id=mission.id,
            station_id=mission.station_id,
            station_name=station.name,
            title=mission.title,
            reward_credits=mission.reward_credits,
            status=assignment.status,
            accepted_at=assignment.accepted_at.isoformat(),
            completed_at=(
                assignment.completed_at.isoformat()
                if assignment.completed_at
                else None
            ),
        )
        for assignment, mission, station in rows
    ]
