import type { Request, Response, NextFunction } from 'express';
import { getRedis } from '../lib/redis';
import { fail } from '../utils/response';

interface RateLimitOptions {
  windowSecs: number;
  max: number;
  keyPrefix: string;
}

export function rateLimiter({ windowSecs, max, keyPrefix }: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const redis = getRedis();
    if (!redis) return next(); // skip if Redis not configured

    const identifier = req.userId ?? req.ip ?? 'unknown';
    const key = `${keyPrefix}:${identifier}`;

    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSecs);

    if (count > max) {
      return fail(res, 429, 'RATE_LIMITED', 'Too many requests, please try again later');
    }
    next();
  };
}

// 100 req/min per IP for public routes
export const publicRateLimit = rateLimiter({ windowSecs: 60, max: 100, keyPrefix: 'rl:pub' });

// 300 req/min per user for authenticated routes
export const authRateLimit = rateLimiter({ windowSecs: 60, max: 300, keyPrefix: 'rl:auth' });
