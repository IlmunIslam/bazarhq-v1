import type { ApiResponse } from '@bazarhq/shared';

import {
  clearAdminToken,
  clearMerchantToken,
  getAdminToken,
  getMerchantToken,
} from './secure-store';

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
//
// Two independent auth realms share this module. Merchant and admin tokens are
// separate credentials with separate lifetimes, so each realm gets its own
// stored token and its own 401 handler — otherwise an expired admin session
// would clear the merchant's token (and vice versa), signing the user out of a
// tab they were not even using.

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://bazarhq-api.onrender.com/v1';

// Sent only on login (see `api.post` callers): tells the API this is a native
// client, so it returns the JWT in the response body instead of an httpOnly
// cookie React Native can't read. Web callers never send it, so their
// cookie-based login is unaffected.
export const MOBILE_CLIENT_HEADER = { 'X-Client': 'mobile' } as const;

export type Realm = 'merchant' | 'admin';

const TOKEN_STORE: Record<Realm, { get: () => Promise<string | null>; clear: () => Promise<void> }> = {
  merchant: { get: getMerchantToken, clear: clearMerchantToken },
  admin: { get: getAdminToken, clear: clearAdminToken },
};

// Registered by each realm's auth provider. Invoked when a request that DID
// carry a token is rejected (401) — i.e. the token expired or its session was
// revoked — so the app can drop back to that realm's login screen.
const unauthorizedHandlers: Record<Realm, (() => void) | null> = {
  merchant: null,
  admin: null,
};

export function setUnauthorizedHandler(fn: (() => void) | null, realm: Realm = 'merchant'): void {
  unauthorizedHandlers[realm] = fn;
}

async function request<T>(realm: Realm, path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const isFormData = init?.body instanceof FormData;
  const token = await TOKEN_STORE[realm].get();
  const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

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
  // Guard on `token` so an anonymous 401 (e.g. bad login credentials) never
  // trips the "session expired" path.
  if (res.status === 401 && token) {
    await TOKEN_STORE[realm].clear();
    unauthorizedHandlers[realm]?.();
  }

  return data;
}

function createClient(realm: Realm) {
  return {
    get: <T>(path: string) => request<T>(realm, path),
    post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
      request<T>(realm, path, {
        method: 'POST',
        body: body === undefined ? undefined : JSON.stringify(body),
        headers,
      }),
    patch: <T>(path: string, body: unknown) =>
      request<T>(realm, path, { method: 'PATCH', body: JSON.stringify(body) }),
    put: <T>(path: string, body: unknown) =>
      request<T>(realm, path, { method: 'PUT', body: JSON.stringify(body) }),
    delete: <T>(path: string) => request<T>(realm, path, { method: 'DELETE' }),
    // Multipart upload. Mirrors the web client's `postForm`: the body is passed
    // through untouched and NO Content-Type is set, so React Native can generate
    // the `multipart/form-data; boundary=…` header itself. Setting it by hand
    // omits the boundary, and the API's busboy parser then sees zero files.
    postForm: <T>(path: string, body: FormData) => request<T>(realm, path, { method: 'POST', body }),
  };
}

export const api = createClient('merchant');
export const adminApi = createClient('admin');

export const API_BASE_URL = BASE;
