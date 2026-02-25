from pydantic import BaseModel


class AdminLogEntry(BaseModel):
    timestamp: str | None
    level: str
    logger: str | None
    source: str
    message: str


class AdminLogsResponse(BaseModel):
    entries: list[AdminLogEntry]
    next_since: str | None = None


class AdminUserSummary(BaseModel):
    id: int
    email: str
    username: str
    role: str
    status: str
    is_alive: bool
    location_type: str | None
    location_id: int | None
    location_label: str


class AdminUsersResponse(BaseModel):
    users: list[AdminUserSummary]
    total: int
    limit: int
    offset: int


class AdminUserUpdateRequest(BaseModel):
    role: str | None = None
    status: str | None = None
