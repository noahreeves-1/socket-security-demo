import copy
import unittest
from datetime import datetime, timedelta, timezone

from app.analytics import MAX_SAFE_INTEGER, analyze_orders


def order(order_id, status, created_at, total_cents):
    return {
        "id": order_id,
        "customer": {"name": "Customer", "email": "customer@example.com"},
        "createdAt": created_at,
        "status": status,
        "items": [],
        "totalCents": total_cents,
    }


class AnalyzeOrdersTests(unittest.TestCase):
    def test_empty_orders_have_zero_totals_and_every_status(self):
        result = analyze_orders([])

        self.assertEqual(result, {
            "totalRevenueCents": 0,
            "averageOrderValueCents": 0,
            "totalOrders": 0,
            "ordersByStatus": {
                "pending": 0,
                "processing": 0,
                "shipped": 0,
                "delivered": 0,
                "cancelled": 0,
            },
            "revenueByDay": [],
        })

    def test_counts_every_status_but_revenue_only_includes_fulfillable_orders(self):
        orders = [
            order("OP-1001", "pending", "2026-10-01T09:00:00Z", 999),
            order("OP-1002", "processing", "2026-10-01T10:00:00Z", 100),
            order("OP-1003", "shipped", "2026-10-02T10:00:00Z", 200),
            order("OP-1004", "delivered", "2026-10-02T11:00:00Z", 300),
            order("OP-1005", "cancelled", "2026-10-02T12:00:00Z", 999),
        ]

        result = analyze_orders(orders)

        self.assertEqual(result["totalOrders"], 5)
        self.assertEqual(result["ordersByStatus"], {
            "pending": 1,
            "processing": 1,
            "shipped": 1,
            "delivered": 1,
            "cancelled": 1,
        })
        self.assertEqual(result["totalRevenueCents"], 600)
        self.assertEqual(result["averageOrderValueCents"], 200)
        self.assertEqual(result["revenueByDay"], [
            {"date": "2026-10-01", "revenueCents": 100},
            {"date": "2026-10-02", "revenueCents": 500},
        ])

    def test_average_order_value_rounds_half_up_in_integer_cents(self):
        orders = [
            order("OP-1001", "processing", "2026-10-01T00:00:00Z", 1),
            order("OP-1002", "shipped", "2026-10-01T01:00:00Z", 2),
        ]

        self.assertEqual(analyze_orders(orders)["averageOrderValueCents"], 2)

    def test_utc_day_buckets_are_sorted_and_keep_zero_revenue_dates(self):
        orders = [
            order("OP-1001", "pending", "2026-10-02T00:30:00+02:00", 500),
            order("OP-1002", "delivered", "2026-10-03T00:15:00-04:00", 90),
            order("OP-1003", "cancelled", "2026-10-01T23:00:00-03:00", 200),
        ]

        self.assertEqual(analyze_orders(orders)["revenueByDay"], [
            {"date": "2026-10-01", "revenueCents": 0},
            {"date": "2026-10-02", "revenueCents": 0},
            {"date": "2026-10-03", "revenueCents": 90},
        ])

    def test_analysis_does_not_modify_input(self):
        orders = [order("OP-1001", "delivered", "2026-10-01T00:00:00Z", 10)]
        original = copy.deepcopy(orders)

        analyze_orders(orders)

        self.assertEqual(orders, original)
        self.assertIsInstance(orders[0]["createdAt"], str)

    def test_odd_denominator_average_uses_nearest_integer_without_float_math(self):
        rounds_down = [
            order("OP-1001", "processing", "2026-10-01T00:00:00Z", 1),
            order("OP-1002", "shipped", "2026-10-01T01:00:00Z", 0),
            order("OP-1003", "delivered", "2026-10-01T02:00:00Z", 0),
        ]
        rounds_up = [
            order("OP-1001", "processing", "2026-10-01T00:00:00Z", 2),
            order("OP-1002", "shipped", "2026-10-01T01:00:00Z", 0),
            order("OP-1003", "delivered", "2026-10-01T02:00:00Z", 0),
        ]

        self.assertEqual(analyze_orders(rounds_down)["averageOrderValueCents"], 0)
        self.assertEqual(analyze_orders(rounds_up)["averageOrderValueCents"], 1)

    def test_aware_datetime_inputs_are_normalized_to_utc(self):
        orders = [order(
            "OP-1001",
            "delivered",
            datetime(2026, 10, 1, 1, 30, tzinfo=timezone(timedelta(hours=2))),
            10,
        )]

        self.assertEqual(analyze_orders(orders)["revenueByDay"], [
            {"date": "2026-09-30", "revenueCents": 10},
        ])

    def test_invalid_status_is_rejected(self):
        orders = [order("OP-1001", "unknown", "2026-10-01T00:00:00Z", 10)]

        with self.assertRaises(ValueError):
            analyze_orders(orders)

    def test_boolean_and_negative_revenue_amounts_are_rejected(self):
        for amount in (True, -1):
            with self.subTest(amount=amount):
                orders = [order("OP-1001", "delivered", "2026-10-01T00:00:00Z", amount)]
                with self.assertRaises(ValueError):
                    analyze_orders(orders)

    def test_aggregate_revenue_overflow_is_rejected(self):
        orders = [
            order("OP-1001", "delivered", "2026-10-01T00:00:00Z", MAX_SAFE_INTEGER),
            order("OP-1002", "processing", "2026-10-01T01:00:00Z", 1),
        ]

        with self.assertRaises(ValueError):
            analyze_orders(orders)

    def test_naive_timestamps_are_rejected(self):
        orders = [order("OP-1001", "delivered", datetime(2026, 10, 1), 10)]

        with self.assertRaises(ValueError):
            analyze_orders(orders)


if __name__ == "__main__":
    unittest.main()
