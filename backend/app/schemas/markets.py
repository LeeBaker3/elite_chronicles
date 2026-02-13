from pydantic import BaseModel


class MarketStationSummary(BaseModel):
    station_id: int
    station_name: str
    commodity_count: int
    scarcity_count: int
    last_inventory_update: str | None
