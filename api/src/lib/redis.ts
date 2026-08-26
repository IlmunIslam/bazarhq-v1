import { Redis } from '@upstash/redis';

let _redis: Redis | null = null;
let _warnedInvalidUrl = false;

/**
 * Why two accepted names: Upstash's console, its Vercel integration and its docs
 * all emit UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN, while this
 * codebase originally read UPSTASH_REDIS_URL / UPSTASH_REDIS_TOKEN. Copying the
 * canonical pair out of Upstash therefore configured nothing, and — because
 * every call site treats a null client as "no Redis, carry on" — it failed
 * silently. Both pairs are accepted, Upstash's own taking precedence.
 *
 * What silently switches OFF when this returns null:
 *   - admin TOTP two-factor      (admin.ts — the TOTP step is SKIPPED, not failed)
 *   - admin 30-min inactivity    (middleware/auth.ts)
 *   - merchant + admin brute-force lockout
 *   - every rate limiter         (middleware/rate-limiter.ts calls next())
 *   - the daily email quota      (services/email/transport.ts)
 */
function credentials(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.UPSTASH_REDIS_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.UPSTASH_REDIS_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

export type RedisConfigState = 'ok' | 'not-configured' | 'invalid-url';

/** Why `getRedis()` returns what it returns — powers the admin health read-out. */
export function getRedisConfigState(): RedisConfigState {
  const creds = credentials();
  if (!creds) return 'not-configured';
  return /^https:\/\//i.test(creds.url) ? 'ok' : 'invalid-url';
}

/** Returns null when Redis is not usable (dev without Redis, or misconfigured). */
export function getRedis(): Redis | null {
  const creds = credentials();
  if (!creds) return null;

  // @upstash/redis speaks REST over HTTPS and needs the https://<id>.upstash.io
  // URL. Upstash also shows a rediss:// TCP string on the same page; pasting
  // that one builds a client whose every call fails, and since callers swallow
  // or skip on failure the guards would stay off with no visible symptom. Refuse
  // loudly instead.
  if (!/^https:\/\//i.test(creds.url)) {
    if (!_warnedInvalidUrl) {
      _warnedInvalidUrl = true;
      console.error(
        '[redis] UPSTASH_REDIS_REST_URL must be the HTTPS REST endpoint ' +
        '(https://<id>.upstash.io), not a rediss:// connection string. ' +
        'Redis is DISABLED: brute-force lockout, rate limiting, admin TOTP and ' +
        'the email quota are all inactive.',
      );
    }
    return null;
  }

  if (!_redis) {
    _redis = new Redis({ url: creds.url, token: creds.token });
  }
  return _redis;
}
