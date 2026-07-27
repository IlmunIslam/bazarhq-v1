import { api } from './api-client';

// Payment methods + account settings — the surfaces the web dashboard actually
// exposes (settings = payment toggles + publish; account = profile + security).
// All requireMerchant → Bearer. Credentials are AES-encrypted server-side and
// returned masked; mobile just toggles/saves via the existing endpoints.

export type PaymentMethod = 'cod' | 'bkash' | 'nagad';

export interface PaymentConfig {
  id?: string;
  method: PaymentMethod;
  isEnabled: boolean;
  credentials: { accountNumber?: string } | null;
}

export function fetchPaymentConfigs() {
  return api.get<{ configs: PaymentConfig[] }>('/payment-configs');
}

export function updatePaymentConfig(
  method: PaymentMethod,
  body: { isEnabled: boolean; credentials?: { accountNumber: string } },
) {
  return api.patch<{ config: PaymentConfig }>(`/payment-configs/${method}`, body);
}

// ── Account ──────────────────────────────────────────────────────────────────

export interface AccountUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  createdAt: string;
}

export function fetchAccount() {
  return api.get<{ user: AccountUser }>('/account/me');
}

// Sent as JSON (no avatar) — the profile endpoint accepts either multipart or a
// plain body; avatar upload is deferred (like B2 product images).
export function updateProfile(body: { fullName?: string; phone?: string | null }) {
  return api.patch<{ user: AccountUser }>('/account/profile', body);
}

export function changePassword(currentPassword: string, newPassword: string) {
  return api.post<{ message: string }>('/account/change-password', { currentPassword, newPassword });
}

export interface Session {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  isCurrent: boolean;
}

export function fetchSessions() {
  return api.get<{ sessions: Session[] }>('/account/sessions');
}

export function revokeSession(id: string) {
  return api.delete<{ revoked: boolean }>(`/account/sessions/${id}`);
}

export function revokeOtherSessions() {
  return api.delete<{ revoked: boolean }>('/account/sessions');
}
