from pydantic import BaseModel


class DockRequest(BaseModel):
    station_id: int


class RefuelRequest(BaseModel):
    amount: int | None = None


class CargoItem(BaseModel):
    commodity_id: int
    commodity_name: str
    quantity: int


class ShipCargoResponse(BaseModel):
    ship_id: int
    cargo_capacity: int
    cargo_used: int
    cargo_free: int
    items: list[CargoItem]


class ShipResponse(BaseModel):
    id: int
    name: str
    hull_current: int
    shields_current: int
    energy_current: int
    fuel_current: int
    fuel_cap: int
    cargo_capacity: int
    status: str
    docked_station_id: int | None
