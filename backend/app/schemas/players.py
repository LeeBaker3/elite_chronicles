from pydantic import BaseModel


class PlayerMeResponse(BaseModel):
    id: int
    email: str
    username: str
    role: str
    credits: int
    is_alive: bool
    location_type: str | None
    location_id: int | None
    primary_ship_id: int | None = None
