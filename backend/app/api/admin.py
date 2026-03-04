import os
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.core.config import settings
from app.models.user import User
from app.models.world import StarSystem
from app.schemas.admin import (
    AdminLogEntry,
    AdminLogsResponse,
    AdminStarterLocationResponse,
    AdminUserSummary,
    AdminUsersResponse,
    AdminUserUpdateRequest,
)
from app.services.starter_location_service import (
    STARTER_SYSTEM_NAME,
    resolve_starter_station,
)

router = APIRouter()

LOG_PATTERN = re.compile(
    r"^(?P<timestamp>\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d{3})\s+"
    r"(?P<level>[A-Z]+)\s+(?P<logger>\S+)\s+(?P<message>.*)$"
)


def _redact_message(message: str) -> str:
    """Redact sensitive token-like values from log message text."""
    redacted = re.sub(r"Bearer\s+[A-Za-z0-9\-_.]+",
                      "Bearer [REDACTED]", message)
    redacted = re.sub(r"password\s*=\s*\S+", "password=[REDACTED]", redacted)
    return redacted


def _parse_log_line(source: str, line: str) -> AdminLogEntry:
    """Parse one log line into structured admin log entry format."""
    match = LOG_PATTERN.match(line.strip())
    if not match:
        return AdminLogEntry(
            timestamp=None,
            level="INFO",
            logger=None,
            source=source,
            message=_redact_message(line.strip()),
        )
    return AdminLogEntry(
        timestamp=match.group("timestamp"),
        level=match.group("level"),
        logger=match.group("logger"),
        source=source,
        message=_redact_message(match.group("message")),
    )


def _sort_key(entry: AdminLogEntry):
    """Provide sort key for log entries by timestamp then source."""
    if entry.timestamp is None:
        return (datetime.min, entry.source)
    try:
        parsed = datetime.strptime(entry.timestamp, "%Y-%m-%d %H:%M:%S,%f")
    except ValueError:
        parsed = datetime.min
    return (parsed, entry.source)


def _location_label(user: User) -> str:
    """Build a compact location label for admin user rows."""

    if user.location_type is None:
        return "Unknown"
    if user.location_id is None:
        return user.location_type
    return f"{user.location_type} #{user.location_id}"


@router.get("/users", response_model=AdminUsersResponse)
def list_users(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """List users for admin management workflows."""

    _ = current_user
    total = db.query(User).count()
    rows = (
        db.query(User)
        .order_by(User.id.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return AdminUsersResponse(
        users=[
            AdminUserSummary(
                id=int(row.id),
                email=row.email,
                username=row.username,
                role=row.role,
                status=row.status,
                is_alive=bool(row.is_alive),
                location_type=row.location_type,
                location_id=int(
                    row.location_id) if row.location_id is not None else None,
                location_label=_location_label(row),
            )
            for row in rows
        ],
        total=int(total),
        limit=limit,
        offset=offset,
    )


@router.patch("/users/{user_id}", response_model=AdminUserSummary)
def update_user(
    user_id: int,
    payload: AdminUserUpdateRequest,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Update basic role/status fields for a target user."""

    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.role is None and payload.status is None:
        raise HTTPException(
            status_code=422, detail="No update fields supplied")

    if payload.role is not None:
        allowed_roles = {"user", "admin", "moderator"}
        if payload.role not in allowed_roles:
            raise HTTPException(status_code=422, detail="Invalid role")
        if target.id == current_user.id and payload.role != "admin":
            raise HTTPException(
                status_code=409,
                detail="Cannot remove your own admin role",
            )
        target.role = payload.role

    if payload.status is not None:
        allowed_statuses = {"active", "inactive"}
        if payload.status not in allowed_statuses:
            raise HTTPException(status_code=422, detail="Invalid status")
        if target.id == current_user.id and payload.status != "active":
            raise HTTPException(
                status_code=409,
                detail="Cannot deactivate your own account",
            )
        target.status = payload.status

    db.commit()
    db.refresh(target)

    return AdminUserSummary(
        id=int(target.id),
        email=target.email,
        username=target.username,
        role=target.role,
        status=target.status,
        is_alive=bool(target.is_alive),
        location_type=target.location_type,
        location_id=int(
            target.location_id) if target.location_id is not None else None,
        location_label=_location_label(target),
    )


@router.get("/logs", response_model=AdminLogsResponse)
def get_logs(
    level: str | None = Query(default=None),
    tail: int = Query(default=100, ge=1, le=1000),
    contains: str | None = Query(default=None),
    regex: str | None = Query(default=None),
    since: str | None = Query(default=None),
    current_user: User = Depends(get_current_admin),
):
    """Return filtered, tailed log entries for admin debugging use."""
    _ = current_user
    normalized_level = level.upper() if level else None
    since_dt: datetime | None = None
    if since:
        try:
            since_dt = datetime.strptime(since, "%Y-%m-%d %H:%M:%S,%f")
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail="Invalid since cursor format",
            ) from exc

    compiled_regex: re.Pattern[str] | None = None
    if regex:
        try:
            compiled_regex = re.compile(regex)
        except re.error as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid regex pattern: {exc.msg}",
            ) from exc

    entries: list[AdminLogEntry] = []

    for filename in ("app.log", "error.log", "api.log"):
        path = os.path.join(settings.log_dir, filename)
        if not os.path.exists(path):
            continue

        with open(path, "r", encoding="utf-8", errors="ignore") as handle:
            for raw_line in handle:
                parsed = _parse_log_line(filename, raw_line)
                if normalized_level and parsed.level != normalized_level:
                    continue
                if contains and contains.lower() not in parsed.message.lower():
                    continue
                if compiled_regex and compiled_regex.search(parsed.message) is None:
                    continue
                if since_dt is not None:
                    parsed_dt, _source = _sort_key(parsed)
                    if parsed_dt <= since_dt:
                        continue
                entries.append(parsed)

    entries.sort(key=_sort_key)
    sliced_entries = entries[-tail:]
    next_since = sliced_entries[-1].timestamp if sliced_entries else since
    return AdminLogsResponse(entries=sliced_entries, next_since=next_since)


@router.get("/starter-location", response_model=AdminStarterLocationResponse)
def get_starter_location(
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Return effective starter spawn location and fallback status."""

    _ = current_user
    preferred_system = (
        db.query(StarSystem)
        .filter(StarSystem.name == STARTER_SYSTEM_NAME)
        .first()
    )
    station = resolve_starter_station(db)
    used_fallback = (
        preferred_system is None
        or station is None
        or int(station.system_id) != int(preferred_system.id)
    )

    selected_system_name = preferred_system.name if preferred_system is not None else None
    selected_system_id = int(
        preferred_system.id) if preferred_system is not None else None
    if station is not None:
        selected_system = (
            db.query(StarSystem)
            .filter(StarSystem.id == station.system_id)
            .first()
        )
        if selected_system is not None:
            selected_system_name = selected_system.name
            selected_system_id = int(selected_system.id)

    return AdminStarterLocationResponse(
        preferred_system_name=STARTER_SYSTEM_NAME,
        selected_system_id=selected_system_id,
        selected_system_name=selected_system_name,
        selected_station_id=int(station.id) if station is not None else None,
        selected_station_name=station.name if station is not None else None,
        used_fallback=used_fallback,
    )
