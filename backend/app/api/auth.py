import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.ship import Ship
from app.models.session import Session as DbSession
from app.models.user import User
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest
from app.services.auth_service import hash_password, verify_password
from app.services.starter_location_service import resolve_starter_station

router = APIRouter()
STARTER_CARGO_CAPACITY = 40


def _ensure_user_starter_ship(db: Session, user: User) -> None:
    """Ensure user has at least one ship with usable cargo capacity."""
    ships = (
        db.query(Ship)
        .filter(Ship.owner_user_id == user.id)
        .order_by(Ship.id.asc())
        .all()
    )

    if ships:
        if all(int(ship.cargo_capacity or 0) <= 0 for ship in ships):
            primary_ship = ships[0]
            primary_ship.cargo_capacity = STARTER_CARGO_CAPACITY
            db.commit()
        return

    station = resolve_starter_station(db)
    docked_station_id = station.id if station else None
    ship_status = "docked" if station else "in-space"

    starter_ship = Ship(
        owner_user_id=user.id,
        name="Cobra Mk I",
        hull_max=100,
        hull_current=100,
        shields_max=50,
        shields_current=50,
        energy_cap=60,
        energy_current=60,
        fuel_cap=100,
        fuel_current=100,
        cargo_capacity=STARTER_CARGO_CAPACITY,
        status=ship_status,
        docked_station_id=docked_station_id,
    )
    db.add(starter_ship)

    if station and user.location_type is None:
        user.location_type = "station"
        user.location_id = station.id

    db.commit()


@router.post("/register", response_model=AuthResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=payload.email,
        username=payload.username,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _ensure_user_starter_ship(db, user)

    token = str(uuid.uuid4())
    session = DbSession(
        id=token,
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(session)
    db.commit()

    return AuthResponse(token=token, user_id=user.id)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = str(uuid.uuid4())
    session = DbSession(
        id=token,
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(session)
    db.commit()

    _ensure_user_starter_ship(db, user)
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    return AuthResponse(token=token, user_id=user.id)
