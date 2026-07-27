import { api } from './api-client';

// Merchant analytics endpoints (all requireMerchant → Bearer). Same shapes as
// the web dashboard. Numbers come back as numbers here (server aggregates them),
// not Decimal strings.

export type Period = 'today' | 'week' | 'month';

export interface OverviewData {
  revenue: number;
  orderCount: number;
  statusBreakdown: Record<string, number>;
  dailyRevenue: { date: string; revenue: number }[];
}

export interface TopProduct {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface VisitorData {
  totalViews: number;
  uniqueVisitors: number;
  conversionRate: number;
  orderCount: number;
}

export function fetchOverview(period: Period) {
  return api.get<OverviewData>(`/analytics/overview?period=${period}`);
}

export function fetchTopProducts(period: Period) {
  return api.get<{ topProducts: TopProduct[] }>(`/analytics/top-products?period=${period}`);
}

export function fetchVisitors(period: Period) {
  return api.get<VisitorData>(`/analytics/visitors?period=${period}`);
}

export function formatNum(n: number): string {
  return n.toLocaleString('en-BD', { maximumFractionDigits: 0 });
}
