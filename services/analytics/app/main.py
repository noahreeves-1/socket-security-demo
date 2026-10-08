"""FastAPI boundary for the OrderPulse analytics service."""

import re
from datetime import datetime
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.analytics import MAX_SAFE_INTEGER, analyze_orders


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Customer(StrictModel):
    name: str = Field(min_length=1)
    email: str = Field(min_length=3)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("email must be a valid email address")
        return value


class LineItem(StrictModel):
    name: str = Field(min_length=1)
    quantity: int = Field(ge=1, le=MAX_SAFE_INTEGER)
    unitPriceCents: int = Field(ge=0, le=MAX_SAFE_INTEGER)


class Order(StrictModel):
    id: str = Field(pattern=r"^OP-[0-9]{4,}$")
    customer: Customer
    createdAt: datetime
    status: Literal["pending", "processing", "shipped", "delivered", "cancelled"]
    items: list[LineItem] = Field(min_length=1)
    totalCents: int = Field(ge=0, le=MAX_SAFE_INTEGER)

    @field_validator("createdAt", mode="before")
    @classmethod
    def parse_timestamp(cls, value: object) -> datetime:
        if isinstance(value, datetime):
            timestamp = value
        elif isinstance(value, str):
            try:
                timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError as error:
                raise ValueError("createdAt must be a valid ISO 8601 timestamp") from error
        else:
            raise ValueError("createdAt must be a timezone-aware ISO 8601 timestamp")
        if timestamp.tzinfo is None or timestamp.utcoffset() is None:
            raise ValueError("createdAt must include a timezone")
        return timestamp

    @model_validator(mode="after")
    def total_matches_items(self) -> "Order":
        line_total = 0
        for item in self.items:
            line_total += item.quantity * item.unitPriceCents
            if line_total > MAX_SAFE_INTEGER:
                raise ValueError("items total exceeds the maximum safe integer")
        if line_total != self.totalCents:
            raise ValueError("totalCents must equal the sum of item totals")
        return self


class AnalyzeRequest(StrictModel):
    orders: list[Order]


class OrdersByStatus(StrictModel):
    pending: int = Field(ge=0, le=MAX_SAFE_INTEGER)
    processing: int = Field(ge=0, le=MAX_SAFE_INTEGER)
    shipped: int = Field(ge=0, le=MAX_SAFE_INTEGER)
    delivered: int = Field(ge=0, le=MAX_SAFE_INTEGER)
    cancelled: int = Field(ge=0, le=MAX_SAFE_INTEGER)


class DailyRevenue(StrictModel):
    date: str = Field(pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
    revenueCents: int = Field(ge=0, le=MAX_SAFE_INTEGER)


class AnalyzeResponse(StrictModel):
    totalRevenueCents: int = Field(ge=0, le=MAX_SAFE_INTEGER)
    averageOrderValueCents: int = Field(ge=0, le=MAX_SAFE_INTEGER)
    totalOrders: int = Field(ge=0, le=MAX_SAFE_INTEGER)
    ordersByStatus: OrdersByStatus
    revenueByDay: list[DailyRevenue]


app = FastAPI(title="OrderPulse Analytics")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "analytics"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    try:
        result = analyze_orders([order.model_dump() for order in request.orders])
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return AnalyzeResponse.model_validate(result)
