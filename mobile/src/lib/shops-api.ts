import { api } from './api-client';

// Store creation + subdomain availability. POST /shops creates the shop, a
// default theme, and COD (enabled) atomically — same as the web. Note: it
// rotates the merchant's session and returns the new token only via cookie, so
// native callers must re-authenticate afterward (see auth.beginReauth).

export interface SubdomainCheck {
  available: boolean;
  message: string;
}

export function checkSubdomain(subdomain: string) {
  return api.get<SubdomainCheck>(`/shops/check-subdomain?subdomain=${encodeURIComponent(subdomain)}`);
}

export interface CreateShopPayload {
  subdomain: string;
  name: string;
  description?: string;
}

export function createShop(payload: CreateShopPayload) {
  return api.post<{ shop: { id: string; subdomain: string; name: string } }>('/shops', payload);
}
