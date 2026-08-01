import type { ApiResponse } from '@bazarhq/shared';

import { getMerchantToken, clearMerchantToken } from './secure-store';

// Ported from frontend/lib/api-client.ts with React Native differences:
//
//  • Base URL comes from EXPO_PUBLIC_API_URL. EXPO_PUBLIC_* values are inlined
//    into the app bundle and readable by anyone who unpacks the APK — so ONLY
//    the public API URL belongs here. Never put secrets (JWT, keys) in an
//    EXPO_PUBLIC_* var; secrets stay server-side or in expo-secure-store.
//  • No `credentials: 'include'`: React Native has no browser cookie jar, so
//    the web client's httpOnly-cookie auth does not apply here. Instead the JWT
//    (obtained at login, persisted in expo-secure-store) is attached as an
//    `Authorization: Bearer <jwt>` header by `authHeader()` below.

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://bazarhq-api.onrender.com/v1';

// Sent only on login (see `api.post` callers): tells the API this is a native
// client, so it returns the JWT in the response body instead of an httpOnly
// cookie React Native can't read. Web callers never send it, so their
// cookie-based login is unaffected.
export const MOBILE_CLIENT_HEADER = { 'X-Client': 'mobile' } as const;

// Registered by the auth provider. Invoked when a request that DID carry a token
// is rejected (401) — i.e. the token expired or its session was revoked — so the
// app can drop back to the login screen.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

async function authHeader(): Promise<Record<string, string>> {
  const token = await getMerchantToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const isFormData = init?.body instanceof FormData;
  const auth = await authHeader();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...auth,
      ...init?.headers,
    },
  });

  const data = (await res.json()) as ApiResponse<T>;

  // If a request we authenticated is rejected, the stored token is no longer
  // valid. Clear it and notify the app so it can return to the login screen.
  // Guard on `auth.Authorization` so an anonymous 401 (e.g. bad login
  // credentials) never trips the "session expired" path.
  if (res.status === 401 && auth.Authorization) {
    await clearMerchantToken();
    onUnauthorized?.();
  }

  return data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  // Multipart upload. Mirrors the web client's `postForm`: the body is passed
  // through untouched and NO Content-Type is set, so React Native can generate
  // the `multipart/form-data; boundary=…` header itself. Setting it by hand
  // omits the boundary, and the API's busboy parser then sees zero files.
  postForm: <T>(path: string, body: FormData) => request<T>(path, { method: 'POST', body }),
};

export const API_BASE_URL = BASE;
