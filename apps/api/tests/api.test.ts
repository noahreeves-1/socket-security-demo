import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import { test, type TestContext } from "node:test";
import { createApp, type AppOptions } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createSeedOrders } from "../src/orders.js";
import { orderSchema, STATUSES } from "../src/schemas.js";

async function serve(t: TestContext, options: AppOptions = {}) {
  const server: Server = createApp(options).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

const summary = {
  totalRevenueCents: 100,
  averageOrderValueCents: 50,
  totalOrders: 30,
  ordersByStatus: {
    pending: 6, processing: 6, shipped: 6, delivered: 6, cancelled: 6,
  },
  revenueByDay: [{ date: "2026-09-25", revenueCents: 100 }],
};

test("seed data is deterministic, fictional, and internally consistent", () => {
  const orders = createSeedOrders();
  assert.equal(orders.length, 30);
  assert.deepEqual(orders, createSeedOrders());
  assert.equal(new Set(orders.map((order) => order.id)).size, 30);
  assert.equal(new Set(orders.map((order) => order.createdAt.slice(0, 10))).size, 14);
  assert.deepEqual(new Set(orders.map((order) => order.status)), new Set(STATUSES));
  for (const order of orders) {
    assert.ok(orderSchema.safeParse(order).success);
    assert.match(order.customer.email, /@example\.test$/);
    assert.equal(order.totalCents, order.items.reduce(
      (total, item) => total + item.quantity * item.unitPriceCents, 0,
    ));
  }
});

test("startup configuration rejects invalid ports, origins, and upstream URLs", () => {
  assert.equal(loadConfig({}).port, 3001);
  for (const env of [
    { PORT: "0" }, { PORT: "3.1" }, { PORT: "65536" }, { HOST: "" },
    { WEB_ORIGIN: "https://example.test/path" },
    { WEB_ORIGIN: "https://user:password@example.test" },
    { ANALYTICS_URL: "file:///tmp/analytics" },
  ]) {
    assert.throws(() => loadConfig(env), /Invalid API configuration/);
  }
});

test("health and newest-first orders remain available without analytics", async (t) => {
  const base = await serve(t);
  assert.deepEqual(await (await fetch(`${base}/health`)).json(), {
    status: "ok", service: "api",
  });
  const response = await fetch(`${base}/orders`, {
    headers: { Origin: "http://127.0.0.1:5173" },
  });
  assert.equal(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:5173");
  const foreignOrigin = await fetch(`${base}/orders`, { headers: { Origin: "https://foreign.example.test" } });
  assert.equal(foreignOrigin.headers.get("access-control-allow-origin"), null);
  const { orders } = await response.json() as { orders: ReturnType<typeof createSeedOrders> };
  assert.equal(orders.length, 30);
  assert.deepEqual(orders.map((order) => order.createdAt),
    orders.map((order) => order.createdAt).toSorted().toReversed());
});

test("search and status filters combine and customer search ignores case", async (t) => {
  const base = await serve(t);
  const seed = createSeedOrders()[0]!;
  for (const search of [seed.id.toLowerCase(), seed.customer.name.toUpperCase()]) {
    const url = `${base}/orders?search=${encodeURIComponent(search)}&status=${seed.status}`;
    const { orders } = await (await fetch(url)).json();
    assert.equal(orders.length, 1);
    assert.equal(orders[0].id, seed.id);
  }
  const { orders } = await (await fetch(`${base}/orders?search=no-match`)).json();
  assert.deepEqual(orders, []);
});

test("details and any valid status update preserve the other order fields", async (t) => {
  const base = await serve(t);
  const original = createSeedOrders()[0]!;
  for (const status of STATUSES) {
    const response = await fetch(`${base}/orders/${original.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { order: { ...original, status } });
  }
  assert.deepEqual(await (await fetch(`${base}/orders/${original.id}`)).json(), {
    order: { ...original, status: "cancelled" },
  });
  const freshBase = await serve(t);
  assert.deepEqual(await (await fetch(`${freshBase}/orders/${original.id}`)).json(), {
    order: original,
  });
});

test("invalid bodies, IDs, and query parameters return consistent validation errors", async (t) => {
  const base = await serve(t);
  for (const body of [{}, { status: "lost" }, { status: "shipped", totalCents: 0 }, null, []]) {
    const response = await fetch(`${base}/orders/OP-1001`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "invalid_request");
  }
  for (const path of ["/orders?status=lost", "/orders?status=pending&status=shipped", "/orders?extra=x", "/orders/bad-id"]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "invalid_request");
  }
  for (const method of ["GET", "PATCH"]) {
    const response = await fetch(`${base}/orders/OP-9999`, {
      method, ...(method === "PATCH" ? {
        headers: { "Content-Type": "application/json" }, body: '{"status":"pending"}',
      } : {}),
    });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "not_found");
  }
});

test("malformed and oversized JSON receive safe errors", async (t) => {
  const base = await serve(t);
  for (const [body, expected] of [["{", 400], [JSON.stringify({ status: "x".repeat(20_000) }), 413]] as const) {
    const response = await fetch(`${base}/orders/OP-1001`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body,
    });
    assert.equal(response.status, expected);
    const value = await response.json();
    assert.deepEqual(Object.keys(value), ["error"]);
    assert.deepEqual(Object.keys(value.error).toSorted(), ["code", "message"]);
  }
});

test("summary forwards all current orders, independently of list filters", async (t) => {
  let sent: unknown;
  const fetchImpl: typeof fetch = async (input, init) => {
    assert.equal(String(input), "http://127.0.0.1:8000/analyze");
    assert.equal(init?.method, "POST");
    sent = JSON.parse(String(init?.body));
    return Response.json(summary);
  };
  const base = await serve(t, { fetchImpl });
  await fetch(`${base}/orders?status=pending`);
  await fetch(`${base}/orders/OP-1001`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: '{"status":"delivered"}',
  });
  const response = await fetch(`${base}/analytics/summary`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), summary);
  const forwarded = sent as { orders: ReturnType<typeof createSeedOrders> };
  assert.equal(forwarded.orders.length, 30);
  assert.equal(forwarded.orders.find((order) => order.id === "OP-1001")?.status, "delivered");
});

test("unavailable, non-success, malformed, and invalid upstream results return 503", async (t) => {
  const failures: Array<typeof fetch> = [
    async () => { throw new Error("private connection detail"); },
    async () => new Response("private upstream detail", { status: 500 }),
    async () => new Response("{", { headers: { "Content-Type": "application/json" } }),
    async () => Response.json({ ...summary, totalRevenueCents: -1 }),
    async () => Response.json({ ...summary, totalOrders: 1.5 }),
    async () => Response.json({ ...summary, totalRevenueCents: Number.MAX_SAFE_INTEGER + 1 }),
    async () => Response.json({ ...summary, revenueByDay: [{ date: "2026-02-30", revenueCents: 0 }] }),
    async () => Response.json({ ...summary, ordersByStatus: { pending: 30 } }),
  ];
  for (const fetchImpl of failures) {
    const base = await serve(t, { fetchImpl });
    const response = await fetch(`${base}/analytics/summary`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: { code: "analytics_unavailable", message: "Analytics is temporarily unavailable." },
    });
    assert.equal((await fetch(`${base}/orders`)).status, 200);
  }
});

test("analytics timeout bounds the response even if the upstream ignores abort", async (t) => {
  const base = await serve(t, {
    fetchImpl: async () => new Promise<Response>(() => {}), analyticsTimeoutMs: 20,
  });
  const response = await fetch(`${base}/analytics/summary`, { signal: AbortSignal.timeout(1_000) });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "analytics_unavailable");
});
