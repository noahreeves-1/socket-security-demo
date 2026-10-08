"""Dependency-free analytics calculations for validated orders."""

from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from typing import Any

MAX_SAFE_INTEGER = 9_007_199_254_740_991
STATUSES = ("pending", "processing", "shipped", "delivered", "cancelled")
REVENUE_STATUSES = frozenset(("processing", "shipped", "delivered"))


def _parse_timestamp(value: Any) -> datetime:
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
    return timestamp.astimezone(timezone.utc)


def _add_safe(total: int, amount: int) -> int:
    result = total + amount
    if result > MAX_SAFE_INTEGER:
        raise ValueError("analytics totals exceed the maximum safe integer")
    return result


def analyze_orders(orders: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Return deterministic revenue, status, and UTC-day aggregates."""
    status_counts = dict.fromkeys(STATUSES, 0)
    revenue_by_day: dict[str, int] = {}
    total_revenue = 0

    if len(orders) > MAX_SAFE_INTEGER:
        raise ValueError("totalOrders exceeds the maximum safe integer")

    for order in orders:
        status = order["status"]
        if status not in status_counts:
            raise ValueError("status is invalid")
        status_counts[status] += 1

        timestamp = _parse_timestamp(order["createdAt"])
        day = timestamp.date().isoformat()
        revenue_by_day.setdefault(day, 0)

        if status in REVENUE_STATUSES:
            amount = order["totalCents"]
            if isinstance(amount, bool) or not isinstance(amount, int) or not 0 <= amount <= MAX_SAFE_INTEGER:
                raise ValueError("totalCents must be a nonnegative safe integer")
            total_revenue = _add_safe(total_revenue, amount)
            revenue_by_day[day] = _add_safe(revenue_by_day[day], amount)

    eligible_order_count = sum(status_counts[status] for status in REVENUE_STATUSES)
    average = (
        (total_revenue + eligible_order_count // 2) // eligible_order_count
        if eligible_order_count
        else 0
    )

    return {
        "totalRevenueCents": total_revenue,
        "averageOrderValueCents": average,
        "totalOrders": len(orders),
        "ordersByStatus": status_counts,
        "revenueByDay": [
            {"date": day, "revenueCents": revenue_by_day[day]}
            for day in sorted(revenue_by_day)
        ],
    }
