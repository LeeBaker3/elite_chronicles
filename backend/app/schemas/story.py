from pydantic import BaseModel


class StoryStartResponse(BaseModel):
    session_id: int
    status: str


class StoryInterpretRequest(BaseModel):
    session_id: int
    player_input: str


class StoryInterpretResponse(BaseModel):
    interpretation: str
    requires_confirmation: bool


class StoryConfirmRequest(BaseModel):
    session_id: int
    confirm: bool


class StoryProceedResponse(BaseModel):
    outcome: str
    next_state: str
