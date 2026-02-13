from pydantic import BaseModel


class StationSummary(BaseModel):
    id: int
    name: str
