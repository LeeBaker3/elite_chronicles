from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Text
from sqlalchemy.sql import func

from app.db.base import Base


class CommsMessage(Base):
    """Persist one comms message event for a specific user and channel."""

    __tablename__ = "comms_messages"

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel_id = Column(Text, nullable=False, index=True)
    author = Column(Text, nullable=False)
    body = Column(Text, nullable=False)
    direction = Column(Text, nullable=False)
    delivery = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    deliver_at = Column(DateTime(timezone=True), nullable=True, index=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)


class CommsChannelReadState(Base):
    """Track the latest inbound message read by user and channel."""

    __tablename__ = "comms_channel_reads"

    user_id = Column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    channel_id = Column(Text, primary_key=True, nullable=False)
    last_read_message_id = Column(BigInteger, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
