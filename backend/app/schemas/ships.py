from pydantic import BaseModel


class ShipResponse(BaseModel):
    id: int
    name: str
    hull_current: int
    shields_current: int
    energy_current: int
    fuel_current: int
    status: str
