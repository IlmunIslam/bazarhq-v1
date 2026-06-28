import type { ApiResponse } from '@bazarhq/shared';

// Ported from frontend/lib/api-client.ts with React Native differences:
//
//  • Base URL comes from EXPO_PUBLIC_API_URL. EXPO_PUBLIC_* values are inlined
//    into the app bundle and readable by anyone who unpacks the APK — so ONLY
//    the public API URL belongs here. Never put secrets (JWT, keys) in an
//    EXPO_PUBLIC_* var; secrets stay server-side or in expo-secure-store.
//  • No `credentials: 'include'`: React Native has no browser cookie jar, so
//    the web client's httpOnly-cookie auth does not apply here.
//
// Auth (Sprint 1, not built yet): a JWT issued by the API will be persisted in
// expo-secure-store (Android Keystore-backed) and attached as an
// `Authorization: Bearer <jwt>` header via the `authHeader` hook below. This
// requires a small API change to accept the bearer token in addition to the
// cookie — tracked as a Sprint 1 dependency, intentionally out of scope now.

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://bazarhq-api.onrender.com/v1';

// Placeholder for Sprint 1: will read the token from expo-secure-store.
async function authHeader(): Promise<Record<string, string>> {
  return {};
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const isFormData = init?.body instanceof FormData;
  const auth = await authHeader();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: isFormData
      ? { ...auth, ...init?.headers }
      : { 'Content-Type': 'application/json', ...auth, ...init?.headers },
  });
  return res.json() as Promise<ApiResponse<T>>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export const API_BASE_URL = BASE;
