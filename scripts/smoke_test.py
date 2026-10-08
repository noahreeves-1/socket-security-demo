"""Exercise already-running local services using only the standard library."""

import argparse
import json
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


STATUSES = ("pending", "processing", "shipped", "delivered", "cancelled")
REVENUE_STATUSES = frozenset(("processing", "shipped", "delivered"))


def request(base, path, method="GET", body=None, expected_status=200):
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = Request(base.rstrip("/") + path, data=data, headers=headers, method=method)
    try:
        response = urlopen(req, timeout=5)
    except HTTPError as error:
        response = error
    with response:
        if response.status != expected_status:
            raise AssertionError(f"{method} {path}: expected {expected_status}, got {response.status}")
        return json.load(response)


def verify_summary(summary, orders):
    eligible = [order for order in orders if order["status"] in REVENUE_STATUSES]
    revenue = sum(order["totalCents"] for order in eligible)
    average = (revenue + len(eligible) // 2) // len(eligible) if eligible else 0
    expected_counts = {status: sum(order["status"] == status for order in orders) for status in STATUSES}
    if summary["totalOrders"] != len(orders) or summary["ordersByStatus"] != expected_counts:
        raise AssertionError("Summary order counts do not match the API snapshot")
    if summary["totalRevenueCents"] != revenue or summary["averageOrderValueCents"] != average:
        raise AssertionError("Summary revenue does not match eligible order values")
    days = summary["revenueByDay"]
    if [day["date"] for day in days] != sorted(day["date"] for day in days):
        raise AssertionError("Daily revenue is not sorted")
    if sum(day["revenueCents"] for day in days) != revenue:
        raise AssertionError("Daily revenue does not reconcile with the total")


def smoke_test(api, analytics):
    assert request(api, "/health") == {"status": "ok", "service": "api"}
    assert request(analytics, "/health") == {"status": "ok", "service": "analytics"}
    orders = request(api, "/orders")["orders"]
    assert len(orders) == 30, "Expected the 30-order demo dataset"
    assert len({order["id"] for order in orders}) == 30, "Order IDs must be unique"
    for order in orders:
        assert order["totalCents"] == sum(item["quantity"] * item["unitPriceCents"] for item in order["items"])
    summary = request(api, "/analytics/summary")
    verify_summary(summary, orders)
    assert request(analytics, "/analyze", "POST", {"orders": orders}) == summary
    first = orders[0]
    assert request(api, f"/orders/{first['id']}")["order"] == first
    query = urlencode({"search": first["id"].lower()})
    assert request(api, f"/orders?{query}")["orders"] == [first]
    for status in STATUSES:
        result = request(api, f"/orders?status={status}")["orders"]
        assert result == [order for order in orders if order["status"] == status]
    assert request(api, "/orders/OP-9999", expected_status=404)["error"]["code"] == "not_found"
    request(api, f"/orders/{first['id']}", "PATCH", {"status": "unknown"}, 400)
    request(analytics, "/analyze", "POST", {"orders": [{"status": "unknown"}]}, 422)
    changed_status = "processing" if first["status"] != "processing" else "pending"
    try:
        changed = request(api, f"/orders/{first['id']}", "PATCH", {"status": changed_status})["order"]
        assert changed == {**first, "status": changed_status}
        updated = request(api, "/orders")["orders"]
        verify_summary(request(api, "/analytics/summary"), updated)
    finally:
        request(api, f"/orders/{first['id']}", "PATCH", {"status": first["status"]})
    print("PASS: health, seed, filters, details, validation, analytics, and status update/restore")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default="http://127.0.0.1:3001")
    parser.add_argument("--analytics-url", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    smoke_test(args.api_url, args.analytics_url)
