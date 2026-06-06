import type { ApiResponse } from '@bazarhq/shared';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
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
  postForm: <T>(path: string, body: FormData) =>
    request<T>(path, { method: 'POST', body, headers: {} }),
};
