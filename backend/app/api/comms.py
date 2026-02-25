from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.comms import CommsChannelReadState as DbCommsChannelReadState
from app.models.comms import CommsMessage as DbCommsMessage
from app.models.user import User
from app.models.world import Station
from app.schemas.comms import (
    CommsChannelSummary,
    CommsMessage,
    CommsSendMessageRequest,
)

router = APIRouter()

CHANNEL_DEFINITIONS: tuple[dict[str, str | int], ...] = (
    {
        "id": "local-station",
        "name": "Station Local",
        "scope": "local",
        "delay_label": "Instant",
        "delay_seconds": 0,
    },
    {
        "id": "system-traffic",
        "name": "System Traffic",
        "scope": "local",
        "delay_label": "Instant",
        "delay_seconds": 0,
    },
    {
        "id": "relay-vega-lave",
        "name": "Relay Vega ↔ Lave",
        "scope": "interstellar",
        "delay_label": "~18s",
        "delay_seconds": 18,
    },
)


def _channel_definition(channel_id: str) -> dict[str, str | int] | None:
    """Return static channel definition for a channel id."""

    for entry in CHANNEL_DEFINITIONS:
        if str(entry["id"]) == channel_id:
            return entry
    return None


def _release_due_messages(db: Session, user: User) -> None:
    """Promote queued interstellar messages to delivered when due."""

    now = datetime.now(timezone.utc)
    due_rows = (
        db.query(DbCommsMessage)
        .filter(
            DbCommsMessage.user_id == user.id,
            DbCommsMessage.delivery == "queued",
            DbCommsMessage.deliver_at.isnot(None),
            DbCommsMessage.deliver_at <= now,
        )
        .all()
    )
    if not due_rows:
        return

    for row in due_rows:
        row.delivery = "delivered"
        row.delivered_at = now
    db.commit()


def _default_channels(
    db: Session,
    user: User,
    unread_counts: dict[str, int] | None = None,
) -> list[CommsChannelSummary]:
    """Build the default channel set for a commander."""

    local_label = str(CHANNEL_DEFINITIONS[0]["name"])
    if user.location_type == "station" and user.location_id:
        station_name = (
            db.query(Station.name)
            .filter(Station.id == user.location_id)
            .scalar()
        )
        if station_name:
            local_label = f"{station_name} Local"

    channels: list[CommsChannelSummary] = []
    channel_unread_counts = unread_counts or {}
    for entry in CHANNEL_DEFINITIONS:
        channel_id = str(entry["id"])
        name = local_label if entry["id"] == "local-station" else str(
            entry["name"])
        channels.append(
            CommsChannelSummary(
                id=channel_id,
                name=name,
                scope=str(entry["scope"]),
                delay_label=str(entry["delay_label"]),
                unread=max(0, int(channel_unread_counts.get(channel_id, 0))),
            )
        )
    return channels


def _channel_ids() -> tuple[str, ...]:
    """Return known channel identifiers for validation and queries."""

    return tuple(str(entry["id"]) for entry in CHANNEL_DEFINITIONS)


def _count_channel_unread(
    db: Session,
    user_id: int,
    channel_id: str,
    last_read_message_id: int | None,
) -> int:
    """Count inbound unread messages for one channel."""

    query = db.query(func.count(DbCommsMessage.id)).filter(
        DbCommsMessage.user_id == user_id,
        DbCommsMessage.channel_id == channel_id,
        DbCommsMessage.direction == "inbound",
        DbCommsMessage.delivery != "queued",
    )
    if last_read_message_id is not None:
        query = query.filter(DbCommsMessage.id > last_read_message_id)
    unread_count = query.scalar()
    return int(unread_count or 0)


def _compute_unread_counts(db: Session, user: User) -> dict[str, int]:
    """Compute unread counts across channels for the authenticated user."""

    channel_ids = _channel_ids()
    read_rows = (
        db.query(DbCommsChannelReadState)
        .filter(
            DbCommsChannelReadState.user_id == user.id,
            DbCommsChannelReadState.channel_id.in_(channel_ids),
        )
        .all()
    )
    read_map = {
        row.channel_id: row.last_read_message_id
        for row in read_rows
    }
    unread_counts: dict[str, int] = {}
    for channel_id in channel_ids:
        unread_counts[channel_id] = _count_channel_unread(
            db=db,
            user_id=user.id,
            channel_id=channel_id,
            last_read_message_id=read_map.get(channel_id),
        )
    return unread_counts


def _require_channel_or_404(
    db: Session,
    user: User,
    channel_id: str,
) -> CommsChannelSummary:
    """Validate channel existence in the user's channel list."""

    channel_map = {
        channel.id: channel
        for channel in _default_channels(db, user)
    }
    channel = channel_map.get(channel_id)
    if channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel


def _seed_messages() -> list[dict[str, str]]:
    """Return deterministic seed message definitions for first-time users."""

    return [
        {
            "channel_id": "local-station",
            "author": "Harbor Control",
            "body": "Docking lanes 3-7 active. Keep approach speed under 120.",
            "direction": "inbound",
            "delivery": "instant",
        },
        {
            "channel_id": "local-station",
            "author": "Broker Nyla",
            "body": "Alloy demand is climbing. If you have spare hold space, buy now.",
            "direction": "inbound",
            "delivery": "instant",
        },
        {
            "channel_id": "system-traffic",
            "author": "Beacon 04",
            "body": "Civilian convoy outbound from Vega Tradeport.",
            "direction": "inbound",
            "delivery": "instant",
        },
        {
            "channel_id": "relay-vega-lave",
            "author": "Cmdr Selene",
            "body": "Transmission delayed by relay weather. Will confirm route soon.",
            "direction": "inbound",
            "delivery": "delivered",
        },
    ]


def _ensure_seed_messages(db: Session, user: User) -> None:
    """Ensure a new user starts with baseline inbound comms messages."""

    existing = (
        db.query(DbCommsMessage)
        .filter(DbCommsMessage.user_id == user.id)
        .limit(1)
        .first()
    )
    if existing is not None:
        return

    now = datetime.now(timezone.utc)
    for seed in _seed_messages():
        delivery = str(seed["delivery"])
        delivered_at = now if delivery != "queued" else None
        db.add(
            DbCommsMessage(
                user_id=user.id,
                channel_id=str(seed["channel_id"]),
                author=str(seed["author"]),
                body=str(seed["body"]),
                direction=str(seed["direction"]),
                delivery=delivery,
                created_at=now,
                deliver_at=None,
                delivered_at=delivered_at,
            )
        )
    db.commit()


def _to_response(row: DbCommsMessage) -> CommsMessage:
    """Convert a persisted comms row into API response schema."""

    created_at = row.created_at or datetime.now(timezone.utc)
    return CommsMessage(
        id=str(row.id),
        author=row.author,
        body=row.body,
        timestamp=created_at.strftime("%H:%M"),
        direction=row.direction,
        delivery=row.delivery,
    )


@router.get("/channels", response_model=list[CommsChannelSummary])
def list_channels(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List channels available to the authenticated user."""

    _ensure_seed_messages(db, current_user)
    _release_due_messages(db, current_user)
    unread_counts = _compute_unread_counts(db, current_user)
    return _default_channels(db, current_user, unread_counts=unread_counts)


@router.get("/channels/{channel_id}/messages", response_model=list[CommsMessage])
def list_messages(
    channel_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List messages for a specific channel belonging to the user."""

    _ensure_seed_messages(db, current_user)
    _release_due_messages(db, current_user)
    _require_channel_or_404(db, current_user, channel_id)

    rows = (
        db.query(DbCommsMessage)
        .filter(
            DbCommsMessage.user_id == current_user.id,
            DbCommsMessage.channel_id == channel_id,
        )
        .order_by(DbCommsMessage.created_at.asc(), DbCommsMessage.id.asc())
        .all()
    )
    return [_to_response(row) for row in rows]


@router.post("/channels/{channel_id}/messages", response_model=CommsMessage)
def send_message(
    channel_id: str,
    payload: CommsSendMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Transmit a new outbound message to a channel."""

    _ensure_seed_messages(db, current_user)
    _release_due_messages(db, current_user)
    channel = _require_channel_or_404(db, current_user, channel_id)

    channel_entry = _channel_definition(channel_id)
    delay_seconds = (
        int(channel_entry["delay_seconds"])
        if channel_entry is not None
        else 0
    )
    now = datetime.now(timezone.utc)
    is_interstellar = channel.scope == "interstellar" and delay_seconds > 0

    outbound_row = DbCommsMessage(
        user_id=current_user.id,
        channel_id=channel_id,
        author=current_user.username,
        body=payload.body.strip(),
        direction="outbound",
        delivery="queued" if is_interstellar else "instant",
        deliver_at=(now + timedelta(seconds=delay_seconds)
                    ) if is_interstellar else None,
        delivered_at=None if is_interstellar else now,
    )
    db.add(outbound_row)
    db.commit()
    db.refresh(outbound_row)

    return _to_response(outbound_row)


@router.post("/channels/{channel_id}/read", response_model=CommsChannelSummary)
def mark_channel_read(
    channel_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark inbound messages in the channel as read for the user."""

    _ensure_seed_messages(db, current_user)
    _release_due_messages(db, current_user)
    _require_channel_or_404(db, current_user, channel_id)

    max_inbound_message_id = (
        db.query(func.max(DbCommsMessage.id))
        .filter(
            DbCommsMessage.user_id == current_user.id,
            DbCommsMessage.channel_id == channel_id,
            DbCommsMessage.direction == "inbound",
        )
        .scalar()
    )

    read_state = (
        db.query(DbCommsChannelReadState)
        .filter(
            DbCommsChannelReadState.user_id == current_user.id,
            DbCommsChannelReadState.channel_id == channel_id,
        )
        .first()
    )
    if read_state is None:
        read_state = DbCommsChannelReadState(
            user_id=current_user.id,
            channel_id=channel_id,
        )
        db.add(read_state)

    if max_inbound_message_id is None:
        read_state.last_read_message_id = None
    else:
        read_state.last_read_message_id = int(max_inbound_message_id)
    read_state.updated_at = datetime.now(timezone.utc)

    db.commit()

    unread_counts = _compute_unread_counts(db, current_user)
    channels = _default_channels(db, current_user, unread_counts=unread_counts)
    for channel in channels:
        if channel.id == channel_id:
            return channel
    raise HTTPException(status_code=404, detail="Channel not found")
