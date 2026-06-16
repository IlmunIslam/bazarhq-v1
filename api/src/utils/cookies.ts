import type { CookieOptions } from 'express';

/**
 * Cookie attributes for auth tokens.
 *
 * In production the API (e.g. bazarhq-api.onrender.com) and the frontend
 * (e.g. bazarhq-v1-frontend.vercel.app) are on different sites, so the browser
 * will only store and send the cookie cross-site when it is SameSite=None and
 * Secure. In development everything runs on localhost, where SameSite=Lax works
 * and Secure must be off (no HTTPS).
 */
export function authCookieOptions(maxAge: number): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge,
  };
}

/**
 * Attributes for clearing an auth cookie. A browser only removes a cookie when
 * the secure/sameSite/path attributes match those it was originally set with,
 * so logout must mirror {@link authCookieOptions}.
 */
export function clearCookieOptions(): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  };
}
