import { adminApi } from './api-client';

// Typed wrappers over /v1/admin/* (all behind requireAdmin → Bearer). Shapes
// mirror the web superadmin panel so both clients read the same data.
//
// Every request here refreshes the server's 30-minute inactivity window; a
// SESSION_EXPIRED response means the window lapsed and the session was revoked
// server-side — see admin-auth.tsx, which turns that into a clean re-login.

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: 'superadmin' | 'support';
  twoFaEnabled: boolean;
  status?: string;
}

export interface AdminShop {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  publishedAt: string | null;
  createdAt: string;
}

export interface AdminMerchant {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: string;
  emailVerified: boolean;
  createdAt: string;
  shop: AdminShop | null;
}

export interface RecentOrder {
  id: string;
  orderNumber: string;
  total: string;
  status: string;
  createdAt: string;
  shop: { name: string; subdomain: string };
}

export interface AdminOverview {
  totalMerchants: number;
  activeMerchants: number;
  publishedShops: number;
  totalOrders: number;
  totalRevenue: string;
  recentOrders: RecentOrder[];
  ordersByDay: { date: string; count: number; revenue: string }[];
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  targetRole: 'merchant' | 'customer' | 'all';
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export function fetchAdminMe() {
  return adminApi.get<{ admin: AdminUser }>('/admin/auth/me');
}

export function adminLogout() {
  return adminApi.post<{ message: string }>('/admin/auth/logout');
}

// ─── Merchants ────────────────────────────────────────────────────────────────

export function fetchMerchants(opts: { status?: string; search?: string } = {}) {
  const params = new URLSearchParams();
  if (opts.status && opts.status !== 'all') params.set('status', opts.status);
  if (opts.search) params.set('search', opts.search);
  params.set('limit', '100');
  return adminApi.get<{ merchants: AdminMerchant[]; nextCursor: string | null }>(
    `/admin/merchants?${params}`,
  );
}

export function setMerchantStatus(id: string, status: 'active' | 'suspended') {
  return adminApi.patch<{ message: string }>(`/admin/merchants/${id}`, { status });
}

export function verifyMerchantEmail(id: string) {
  return adminApi.post<{ message: string }>(`/admin/merchants/${id}/verify-email`, {});
}

export function setShopStatus(id: string, status: 'published' | 'suspended' | 'draft') {
  return adminApi.patch<{ message: string }>(`/admin/shops/${id}`, { status });
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export function fetchAdminOverview() {
  return adminApi.get<AdminOverview>('/admin/analytics/overview');
}

// ─── Announcements ────────────────────────────────────────────────────────────

export interface AnnouncementInput {
  title: string;
  body: string;
  targetRole: 'merchant' | 'customer' | 'all';
  isActive: boolean;
  expiresAt?: string | null;
}

export function fetchAnnouncements() {
  return adminApi.get<{ announcements: Announcement[] }>('/admin/announcements');
}

export function createAnnouncement(input: AnnouncementInput) {
  return adminApi.post<{ announcement: Announcement }>('/admin/announcements', input);
}

export function updateAnnouncement(id: string, input: Partial<AnnouncementInput>) {
  return adminApi.patch<{ announcement: Announcement }>(`/admin/announcements/${id}`, input);
}

// Deactivates rather than destroys — the endpoint sets isActive=false, matching
// the web panel's "Delete" action.
export function deactivateAnnouncement(id: string) {
  return adminApi.delete<{ message: string }>(`/admin/announcements/${id}`);
}

// ─── Audit logs ───────────────────────────────────────────────────────────────

export function fetchAuditLogs(opts: { action?: string; cursor?: string } = {}) {
  const params = new URLSearchParams();
  if (opts.action) params.set('action', opts.action);
  if (opts.cursor) params.set('cursor', opts.cursor);
  params.set('limit', '50');
  return adminApi.get<{ logs: AuditLog[]; nextCursor: string | null }>(
    `/admin/audit-logs?${params}`,
  );
}

// ─── Formatting helpers (shared by the admin screens) ────────────────────────

export function formatMoney(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  return `৳${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
