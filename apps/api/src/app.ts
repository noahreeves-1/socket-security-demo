import cors from "cors";
import express, { type ErrorRequestHandler, type Response } from "express";
import { z } from "zod";
import { requestAnalytics } from "./analytics.js";
import { loadConfig, type ApiConfig } from "./config.js";
import { createSeedOrders } from "./orders.js";
import { orderParamsSchema, orderQuerySchema, orderSchema, statusUpdateSchema, type Order } from "./schemas.js";

export interface AppOptions {
  config?: ApiConfig;
  initialOrders?: Order[];
  fetchImpl?: typeof fetch;
  analyticsTimeoutMs?: number;
}

function sendError(response: Response, status: number, code: string, message: string): void {
  response.status(status).json({ error: { code, message } });
}

export function createApp(options: AppOptions = {}) {
  const config = options.config ?? loadConfig({});
  let orders = structuredClone(z.array(orderSchema).parse(options.initialOrders ?? createSeedOrders()));
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({
    origin: (origin, callback) => callback(null, origin === config.webOrigin),
    methods: ["GET", "PATCH", "OPTIONS"],
  }));
  // Let Zod reject valid JSON scalars with the same validation envelope as objects.
  app.use(express.json({ limit: "16kb", strict: false }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: "api" });
  });

  app.get("/orders", (request, response) => {
    const query = orderQuerySchema.parse(request.query);
    const search = query.search?.toLowerCase();
    const filtered = orders.filter((order) => (
      (!query.status || order.status === query.status)
      && (!search || order.id.toLowerCase().includes(search) || order.customer.name.toLowerCase().includes(search))
    )).toSorted((first, second) => second.createdAt.localeCompare(first.createdAt));
    response.json({ orders: filtered });
  });

  app.get("/orders/:id", (request, response) => {
    const { id } = orderParamsSchema.parse(request.params);
    const order = orders.find((entry) => entry.id === id);
    if (!order) return sendError(response, 404, "not_found", "Order not found.");
    response.json({ order });
  });

  app.patch("/orders/:id", (request, response) => {
    const { id } = orderParamsSchema.parse(request.params);
    const { status } = statusUpdateSchema.parse(request.body);
    const previous = orders.find((entry) => entry.id === id);
    if (!previous) return sendError(response, 404, "not_found", "Order not found.");
    const order = { ...previous, status };
    orders = orders.map((entry) => entry.id === id ? order : entry);
    response.json({ order });
  });

  app.get("/analytics/summary", async (_request, response) => {
    try {
      const summary = await requestAnalytics(
        orders, config.analyticsUrl, options.fetchImpl ?? fetch, options.analyticsTimeoutMs,
      );
      response.json(summary);
    } catch (error) {
      console.warn("Analytics request failed.", error instanceof Error ? error.message : "Unknown failure.");
      sendError(response, 503, "analytics_unavailable", "Analytics is temporarily unavailable.");
    }
  });

  app.use((_request, response) => sendError(response, 404, "not_found", "Route not found."));
  app.use(errorHandler);
  return app;
}

const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) return next(error);
  if (error instanceof z.ZodError) {
    return sendError(response, 400, "invalid_request", "Request parameters or body are invalid.");
  }
  const type = typeof error === "object" && error !== null && "type" in error ? error.type : undefined;
  if (type === "entity.parse.failed") {
    return sendError(response, 400, "invalid_json", "Request body must be valid JSON.");
  }
  if (type === "entity.too.large") {
    return sendError(response, 413, "payload_too_large", "Request body exceeds the size limit.");
  }
  if (error instanceof URIError || type === "request.aborted" || type === "request.size.invalid") {
    return sendError(response, 400, "invalid_request", "Request parameters or body are invalid.");
  }
  console.error("Unexpected API request failure.", error);
  sendError(response, 500, "internal_error", "An unexpected error occurred.");
};
