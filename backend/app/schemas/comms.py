from pydantic import BaseModel, Field


class CommsChannelSummary(BaseModel):
    """Represent a communications channel available to a commander."""

    id: str
    name: str
    scope: str
    delay_label: str
    unread: int


class CommsMessage(BaseModel):
    """Represent a single communication message item."""

    id: str
    author: str
    body: str
    timestamp: str
    direction: str
    delivery: str


class CommsSendMessageRequest(BaseModel):
    """Capture the payload required to transmit a comms message."""

    body: str = Field(min_length=1, max_length=500)
