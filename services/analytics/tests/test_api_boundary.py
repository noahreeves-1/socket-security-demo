"""Opt-in tests for the FastAPI/Pydantic request and response boundary."""

import os
import unittest


if os.environ.get("ORDERPULSE_RUN_API_BOUNDARY_TESTS") != "1":
    raise unittest.SkipTest("set ORDERPULSE_RUN_API_BOUNDARY_TESTS=1 after approval")

from fastapi import HTTPException
from pydantic import ValidationError

from app.analytics import MAX_SAFE_INTEGER
from app.main import AnalyzeRequest, AnalyzeResponse, analyze, health


def valid_order(order_id="OP-1001", amount=125, status="delivered"):
    return {
        "id": order_id,
        "customer": {"name": "Customer", "email": "customer@example.com"},
        "createdAt": "2026-10-01T00:00:00Z",
        "status": status,
        "items": [{"name": "Item", "quantity": 1, "unitPriceCents": amount}],
        "totalCents": amount,
    }


class ApiBoundaryTests(unittest.TestCase):
    def test_health_response_matches_service_contract(self):
        self.assertEqual(health(), {"status": "ok", "service": "analytics"})

    def test_iso_timestamp_string_validates_and_returns_camel_case_summary(self):
        request = AnalyzeRequest.model_validate({"orders": [valid_order()]})

        response = analyze(request)

        self.assertIsInstance(response, AnalyzeResponse)
        self.assertEqual(response.model_dump(), {
            "totalRevenueCents": 125,
            "averageOrderValueCents": 125,
            "totalOrders": 1,
            "ordersByStatus": {
                "pending": 0,
                "processing": 0,
                "shipped": 0,
                "delivered": 1,
                "cancelled": 0,
            },
            "revenueByDay": [{"date": "2026-10-01", "revenueCents": 125}],
        })

    def test_strict_validation_rejects_invalid_time_money_items_and_unknown_fields(self):
        naive = valid_order()
        naive["createdAt"] = "2026-10-01T00:00:00"
        boolean_money = valid_order()
        boolean_money["totalCents"] = True
        unknown = valid_order()
        unknown["unexpected"] = "value"
        empty_items = valid_order(amount=0)
        empty_items["items"] = []

        for payload in (naive, boolean_money, unknown, empty_items):
            with self.subTest(payload=payload):
                with self.assertRaises(ValidationError):
                    AnalyzeRequest.model_validate({"orders": [payload]})

    def test_analytics_overflow_maps_to_http_422(self):
        request = AnalyzeRequest.model_validate({
            "orders": [
                valid_order("OP-1001", MAX_SAFE_INTEGER),
                valid_order("OP-1002", 1, "processing"),
            ],
        })

        with self.assertRaises(HTTPException) as raised:
            analyze(request)

        self.assertEqual(raised.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
