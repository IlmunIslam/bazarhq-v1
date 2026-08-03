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

// ─── Taxonomy (C1 parity) ─────────────────────────────────────────────────────
//
// The global marketplace taxonomy: categories and the spec templates hanging off
// their leaves. Superadmin-owned, because spec templates decide what makes
// products comparable ACROSS shops — alignment collapses if merchants edit them.
//
// Same eight endpoints the web panel at /superadmin/taxonomy uses. Nothing here
// deletes: retiring sets isActive=false so products tagged to a category, and
// any spec values entered against a field, survive and the decision stays
// reversible.

export type SpecDataType = 'text' | 'number' | 'boolean' | 'enum';

export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  specFieldCount: number;
  productCount: number;
  childCount: number;
  children: AdminCategory[];
}

export interface AdminSpecField {
  id: string;
  key: string;
  label: string;
  unit: string | null;
  dataType: SpecDataType;
  options: string[];
  sortOrder: number;
  isComparable: boolean;
  isRequired: boolean;
  isActive: boolean;
  /** How many products hold a value for this field — locks dataType once > 0. */
  valueCount: number;
}

export interface AdminCategoryDetail {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  parent: { id: string; name: string; slug: string } | null;
  childCount: number;
  productCount: number;
}

export interface CategoryInput {
  name?: string;
  slug?: string;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface SpecFieldInput {
  key?: string;
  label?: string;
  unit?: string | null;
  dataType?: SpecDataType;
  options?: string[];
  sortOrder?: number;
  isComparable?: boolean;
  isRequired?: boolean;
  isActive?: boolean;
}

/** The whole taxonomy INCLUDING retired rows — the admin view. */
export function fetchAdminCategories() {
  return adminApi.get<{ categories: AdminCategory[] }>('/admin/categories');
}

export function createCategory(input: CategoryInput) {
  return adminApi.post<{ category: AdminCategory }>('/admin/categories', input);
}

/** Also the restore path: isActive=true brings a retired category back intact. */
export function updateCategory(id: string, input: CategoryInput) {
  return adminApi.patch<{ category: AdminCategory }>(`/admin/categories/${id}`, input);
}

/** Soft delete. Responds with the affected counts so the UI can say what it hid. */
export function retireCategory(id: string) {
  return adminApi.delete<{ message: string; productCount: number; childCount: number }>(
    `/admin/categories/${id}`,
  );
}

export function fetchSpecFields(categoryId: string) {
  return adminApi.get<{ category: AdminCategoryDetail; specFields: AdminSpecField[] }>(
    `/admin/categories/${categoryId}/spec-fields`,
  );
}

export function createSpecField(categoryId: string, input: SpecFieldInput) {
  return adminApi.post<{ specField: AdminSpecField }>(
    `/admin/categories/${categoryId}/spec-fields`,
    input,
  );
}

/** `key` is permanently immutable — the API rejects any request carrying it. */
export function updateSpecField(id: string, input: SpecFieldInput) {
  return adminApi.patch<{ specField: AdminSpecField }>(`/admin/spec-fields/${id}`, input);
}

/** Soft delete — values already entered against the field are preserved. */
export function retireSpecField(id: string) {
  return adminApi.delete<{ message: string; valueCount: number }>(`/admin/spec-fields/${id}`);
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
