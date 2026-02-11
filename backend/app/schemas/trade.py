from pydantic import BaseModel


class InventoryItem(BaseModel):
    name: str
    commodity_id: int
    quantity: int
    buy_price: int
    sell_price: int


class TradeRequest(BaseModel):
    ship_id: int | None = None
    commodity_id: int
    qty: int
    direction: str
