import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.session import Session as DbSession
from app.models.user import User
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest
from app.services.auth_service import hash_password, verify_password

router = APIRouter()


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

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    return AuthResponse(token=token, user_id=user.id)
