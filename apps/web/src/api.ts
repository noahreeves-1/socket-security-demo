import { STATUSES, type Order, type Status, type Summary } from './models';

const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function amount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && STATUSES.some((status) => status === value);
}

function isOrder(value: unknown): value is Order {
  if (!record(value) || !record(value.customer) || !Array.isArray(value.items)) return false;
  return typeof value.id === 'string' && typeof value.customer.name === 'string'
    && typeof value.customer.email === 'string' && typeof value.createdAt === 'string'
    && Number.isFinite(Date.parse(value.createdAt)) && isStatus(value.status)
    && amount(value.totalCents) && value.items.every((item: unknown) => record(item)
      && typeof item.name === 'string' && amount(item.quantity) && item.quantity > 0
      && amount(item.unitPriceCents));
}

function isSummary(value: unknown): value is Summary {
  if (!record(value) || !record(value.ordersByStatus) || !Array.isArray(value.revenueByDay)) return false;
  const counts = value.ordersByStatus;
  return amount(value.totalRevenueCents) && amount(value.averageOrderValueCents)
    && amount(value.totalOrders) && STATUSES.every((status) => amount(counts[status]))
    && value.revenueByDay.every((day: unknown) => record(day)
      && typeof day.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day.date)
      && Number.isFinite(Date.parse(day.date)) && amount(day.revenueCents));
}

async function request(path: string, signal: AbortSignal, status?: Status): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      signal,
      ...(status ? { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) } : {}),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('Unable to reach the API. Check that the demo server is running, then retry.');
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = record(data) && record(data.error) && typeof data.error.message === 'string'
      ? data.error.message : `The request failed (${response.status}). Please retry.`;
    throw new Error(message);
  }
  return data;
}

export async function getOrders(search: string, status: string, signal: AbortSignal): Promise<Order[]> {
  const query = new URLSearchParams();
  if (search.trim()) query.set('search', search.trim());
  if (status) query.set('status', status);
  const data = await request(`/orders${query.size ? `?${query}` : ''}`, signal);
  if (!record(data) || !Array.isArray(data.orders) || !data.orders.every(isOrder)) {
    throw new Error('The server returned an invalid order list. Please retry.');
  }
  return data.orders;
}

export async function getSummary(signal: AbortSignal): Promise<Summary> {
  const data = await request('/analytics/summary', signal);
  if (!isSummary(data)) throw new Error('The server returned invalid analytics. Please retry.');
  return data;
}

export async function getOrder(id: string, signal: AbortSignal): Promise<Order> {
  const data = await request(`/orders/${encodeURIComponent(id)}`, signal);
  if (!record(data) || !isOrder(data.order)) throw new Error('The server returned invalid order details. Please retry.');
  return data.order;
}

export async function updateOrder(id: string, status: Status, signal: AbortSignal): Promise<Order> {
  const data = await request(`/orders/${encodeURIComponent(id)}`, signal, status);
  if (!record(data) || !isOrder(data.order)) throw new Error('The server returned an invalid update. Refresh to check the order.');
  return data.order;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please retry.';
}
