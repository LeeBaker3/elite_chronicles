from pydantic import BaseModel


class MarketStationSummary(BaseModel):
    station_id: int
    station_name: str
    commodity_count: int
    scarcity_count: int
    last_inventory_update: str | None
    updated_seconds_ago: int | None
    stale: bool


class MarketTickRequest(BaseModel):
    steps: int = 1
    system_id: int | None = None


class MarketTickResponse(BaseModel):
    status: str
    steps: int
    affected_rows: int
