from pydantic import BaseModel


class MissionAvailableResponse(BaseModel):
    id: int
    station_id: int
    station_name: str
    faction_id: int | None
    title: str
    description: str
    reward_credits: int
    status: str
    expires_at: str | None
    accepted: bool


class MissionAcceptResponse(BaseModel):
    mission_id: int
    user_id: int
    status: str
    accepted_at: str
    reputation_value: int | None


class MissionAssignmentResponse(BaseModel):
    mission_id: int
    station_id: int
    station_name: str
    title: str
    reward_credits: int
    status: str
    accepted_at: str
    completed_at: str | None


class MissionCompleteResponse(BaseModel):
    mission_id: int
    user_id: int
    status: str
    completed_at: str
    reward_credits: int
    credits_after: int
    reputation_value: int | None


class MissionAbandonResponse(BaseModel):
    mission_id: int
    user_id: int
    status: str
    abandoned_at: str
    credits_after: int
    reputation_value: int | None


class MissionDummyResponse(BaseModel):
    mission_id: int
    station_id: int
    station_name: str
    title: str
    status: str
    created: bool
