import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { fail } from '../utils/response';
import { prisma } from '../lib/prisma';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      shopId?: string;
      adminId?: string;
      role?: 'merchant' | 'customer' | 'admin';
      jti?: string;
    }
  }
}

export async function requireMerchant(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies.token ?? req.headers.authorization?.replace('Bearer ', '');
    if (!token) return fail(res, 401, 'UNAUTHORIZED', 'Authentication required');

    const payload = verifyToken(token);
    if (payload.role !== 'merchant') return fail(res, 403, 'FORBIDDEN', 'Merchant access required');

    // Check session not revoked
    const session = await prisma.session.findUnique({ where: { jti: payload.jti } });
    if (!session || session.revokedAt) return fail(res, 401, 'SESSION_REVOKED', 'Session has been revoked');

    req.userId = payload.sub;
    req.shopId = payload.shopId;
    req.role = 'merchant';
    req.jti = payload.jti;
    next();
  } catch {
    return fail(res, 401, 'INVALID_TOKEN', 'Invalid or expired token');
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies.adminToken ?? req.headers.authorization?.replace('Bearer ', '');
    if (!token) return fail(res, 401, 'UNAUTHORIZED', 'Authentication required');

    const payload = verifyToken(token);
    if (payload.role !== 'admin') return fail(res, 403, 'FORBIDDEN', 'Admin access required');

    const session = await prisma.session.findUnique({ where: { jti: payload.jti } });
    if (!session || session.revokedAt) return fail(res, 401, 'SESSION_REVOKED', 'Session has been revoked');

    // 30-minute inactivity timeout
    const { getRedis } = await import('../lib/redis');
    const redis = getRedis();
    if (redis) {
      const activityKey = `admin:activity:${payload.jti}`;
      const active = await redis.get(activityKey);
      if (!active) {
        // Revoke the session to keep DB clean
        await prisma.session.update({ where: { jti: payload.jti }, data: { revokedAt: new Date() } });
        return fail(res, 401, 'SESSION_EXPIRED', 'Session expired due to inactivity. Please log in again.');
      }
      await redis.expire(activityKey, 30 * 60);
    }

    req.adminId = payload.sub;
    req.role = 'admin';
    req.jti = payload.jti;
    next();
  } catch {
    return fail(res, 401, 'INVALID_TOKEN', 'Invalid or expired token');
  }
}

export async function requireCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies.customerToken ?? req.headers.authorization?.replace('Bearer ', '');
    if (!token) return fail(res, 401, 'UNAUTHORIZED', 'Customer authentication required');

    const payload = verifyToken(token);
    if (payload.role !== 'customer') return fail(res, 403, 'FORBIDDEN', 'Customer access required');

    req.userId = payload.sub;  // sub = customer phone for phone-based auth
    req.role = 'customer';
    req.jti = payload.jti;
    next();
  } catch {
    return fail(res, 401, 'INVALID_TOKEN', 'Invalid or expired token');
  }
}

export async function optionalCustomer(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies.customerToken ?? req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const payload = verifyToken(token);
      if (payload.role === 'customer') {
        req.userId = payload.sub;
        req.role = 'customer';
      }
    }
  } catch {
    // Guest access is fine
  }
  next();
}
