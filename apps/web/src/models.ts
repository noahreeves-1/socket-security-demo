export const STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'] as const;
export type Status = (typeof STATUSES)[number];

export interface OrderItem {
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Order {
  id: string;
  customer: { name: string; email: string };
  createdAt: string;
  status: Status;
  items: OrderItem[];
  totalCents: number;
}

export interface Summary {
  totalRevenueCents: number;
  averageOrderValueCents: number;
  totalOrders: number;
  ordersByStatus: Record<Status, number>;
  revenueByDay: { date: string; revenueCents: number }[];
}

export const STATUS_LABELS: Record<Status, string> = {
  pending: 'Pending', processing: 'Processing', shipped: 'Shipped',
  delivered: 'Delivered', cancelled: 'Cancelled',
};

export const STATUS_COLORS: Record<Status, string> = {
  pending: '#d9a549', processing: '#798bb9', shipped: '#7fa6a0',
  delivered: '#294e43', cancelled: '#c9c5bc',
};
