from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.world import StarSystem, Station

STARTER_SYSTEM_NAME = "Lave"


def resolve_starter_station(db: Session) -> Station | None:
    """Resolve preferred starter station, falling back safely if missing."""

    preferred_system = (
        db.query(StarSystem)
        .filter(StarSystem.name == STARTER_SYSTEM_NAME)
        .first()
    )
    if preferred_system is not None:
        preferred_station = (
            db.query(Station)
            .filter(Station.system_id == preferred_system.id)
            .order_by(Station.id.asc())
            .first()
        )
        if preferred_station is not None:
            return preferred_station

    return db.query(Station).order_by(Station.id.asc()).first()
