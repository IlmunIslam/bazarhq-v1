import type { Request, Response, NextFunction } from 'express';
import { Redis } from '@upstash/redis';
import { fail } from '../utils/response';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

interface RateLimitOptions {
  windowSecs: number;
  max: number;
  keyPrefix: string;
}

function rateLimiter({ windowSecs, max, keyPrefix }: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
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
