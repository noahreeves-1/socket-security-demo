import { z } from "zod";

export const STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"] as const;
export const statusSchema = z.enum(STATUSES);
const nonnegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const orderSchema = z.object({
  id: z.string().regex(/^OP-\d{4,}$/),
  customer: z.object({ name: z.string().min(1), email: z.string().email() }).strict(),
  createdAt: z.string().datetime(),
  status: statusSchema,
  items: z.array(z.object({
    name: z.string().min(1),
    quantity: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    unitPriceCents: nonnegativeInteger,
  }).strict()).min(1),
  totalCents: nonnegativeInteger,
}).strict();

export type Order = z.infer<typeof orderSchema>;
export type Status = z.infer<typeof statusSchema>;
export const orderParamsSchema = z.object({ id: orderSchema.shape.id }).strict();
export const orderQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: statusSchema.optional(),
}).strict();
export const statusUpdateSchema = z.object({ status: statusSchema }).strict();

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
});

export const analyticsSummarySchema = z.object({
  totalRevenueCents: nonnegativeInteger,
  averageOrderValueCents: nonnegativeInteger,
  totalOrders: nonnegativeInteger,
  ordersByStatus: z.object({
    pending: nonnegativeInteger,
    processing: nonnegativeInteger,
    shipped: nonnegativeInteger,
    delivered: nonnegativeInteger,
    cancelled: nonnegativeInteger,
  }).strict(),
  revenueByDay: z.array(z.object({
    date: calendarDateSchema,
    revenueCents: nonnegativeInteger,
  }).strict()),
}).strict();

export type AnalyticsSummary = z.infer<typeof analyticsSummarySchema>;
