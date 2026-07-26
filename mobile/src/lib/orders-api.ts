import type { OrderStatus } from '@bazarhq/shared';

import { api } from './api-client';

// Typed wrappers over the merchant order endpoints (all requireMerchant →
// Bearer). Shapes mirror the web dashboard. Money is returned as strings
// (Decimal) per the project convention — Number() at display time.

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: string;
  paymentStatus: string;
  total: string;
  customerName: string;
  customerPhone: string;
  createdAt: string;
  _count: { items: number };
}

export interface OrderItem {
  id: string;
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  unitPrice: string;
  quantity: number;
  subtotal: string;
}

export interface TimelineEntry {
  id: string;
  status: OrderStatus;
  note: string | null;
  createdAt: string;
  createdBy: string;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: string;
  paymentStatus: string;
  transactionId: string | null;
  subtotal: string;
  shippingFee: string;
  total: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  shippingAddress: { line1: string; line2?: string; city: string; district: string };
  notes: string | null;
  createdAt: string;
  items: OrderItem[];
  timeline: TimelineEntry[];
}

// Settable target statuses (you can never move *to* pending).
export type SettableStatus = 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

// The SAME state machine the API and web dashboard hardcode. The UI offers only
// the allowed next transitions for the current status; the API enforces it too
// (422 INVALID_TRANSITION) and restores stock on cancel, server-side.
export const VALID_TRANSITIONS: Record<OrderStatus, SettableStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'shipped', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  processing: '#8b5cf6',
  shipped: '#06b6d4',
  delivered: '#10b981',
  cancelled: '#ef4444',
};

export const PAYMENT_LABELS: Record<string, string> = { cod: 'COD', bkash: 'bKash', nagad: 'Nagad' };

export function fetchOrders(opts: { status?: string; search?: string; cursor?: string } = {}) {
  const params = new URLSearchParams();
  if (opts.status) params.set('status', opts.status);
  if (opts.search) params.set('search', opts.search);
  if (opts.cursor) params.set('cursor', opts.cursor);
  params.set('limit', '20');
  return api.get<{ orders: OrderListItem[]; nextCursor: string | null }>(`/orders?${params}`);
}

export function fetchOrder(id: string) {
  return api.get<{ order: OrderDetail }>(`/orders/${id}`);
}

export function updateOrderStatus(id: string, status: SettableStatus, note?: string) {
  return api.patch<{ order: OrderDetail }>(`/orders/${id}/status`, { status, note: note || undefined });
}

export function formatTk(value: string): string {
  return `৳${Number(value).toLocaleString()}`;
}
