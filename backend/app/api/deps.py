from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.session import Session as DbSession
from app.models.user import User


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(status_code=401, detail="Missing authorization")

    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization")

    token = parts[1]
    session = db.query(DbSession).filter(DbSession.id == token).first()
    if not session:
        raise HTTPException(status_code=401, detail="Invalid token")
    if session.revoked_at is not None:
        raise HTTPException(status_code=401, detail="Session revoked")
    if session.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user = db.query(User).filter(User.id == session.user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.status != "active":
        raise HTTPException(status_code=403, detail="User inactive")

    return user


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    """Require authenticated user with admin role."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
