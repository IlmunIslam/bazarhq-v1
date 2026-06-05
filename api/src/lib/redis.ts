import { Redis } from '@upstash/redis';

let _redis: Redis | null = null;

/** Returns null if UPSTASH_REDIS_URL is not configured (dev without Redis). */
export function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_URL || !process.env.UPSTASH_REDIS_TOKEN) {
    return null;
  }
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN,
    });
  }
  return _redis;
}
