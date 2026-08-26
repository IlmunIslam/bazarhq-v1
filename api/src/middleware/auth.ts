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

    // 30-minute inactivity timeout.
    //
    // Fail CLOSED: the sliding window lives only in Redis, so skipping this when
    // Redis is down silently converted every admin session into an 8-hour one
    // with no idle expiry. Refusing the request is the honest failure — and it
    // matches POST /admin/auth/login, which now declines to mint a session at
    // all without Redis, so there is no state where a live admin session
    // outlives the guard that bounds it.
    const { getRedis } = await import('../lib/redis');
    const redis = getRedis();
    if (!redis) {
      return fail(
        res, 503, 'SERVICE_UNAVAILABLE',
        'Admin session validation is temporarily unavailable. Please try again shortly.',
      );
    }

    const activityKey = `admin:activity:${payload.jti}`;
    let active: unknown;
    try {
      active = await redis.get(activityKey);
    } catch {
      // Reachable-but-erroring Redis would otherwise fall into the outer catch
      // and be reported as INVALID_TOKEN — sending an admin to re-authenticate
      // over what is actually an infrastructure fault. Still denies access.
      return fail(
        res, 503, 'SERVICE_UNAVAILABLE',
        'Admin session validation is temporarily unavailable. Please try again shortly.',
      );
    }

    if (!active) {
      // Revoke the session to keep DB clean
      await prisma.session.update({ where: { jti: payload.jti }, data: { revokedAt: new Date() } });
      return fail(res, 401, 'SESSION_EXPIRED', 'Session expired due to inactivity. Please log in again.');
    }
    await redis.expire(activityKey, 30 * 60);

    req.adminId = payload.sub;
    req.role = 'admin';
    req.jti = payload.jti;
    next();
  } catch {
    return fail(res, 401, 'INVALID_TOKEN', 'Invalid or expired token');
  }
}

// Customer tokens are rejected outright.
//
// The only way to obtain one was POST /v1/customer/auth/login, which minted a
// 30-day JWT for anyone who typed a phone number that had placed an order — no
// credential at all. That endpoint is now disabled (see routes/customer.ts), but
// tokens issued BEFORE it was disabled stay cryptographically valid for up to 30
// days, and unlike merchant and admin tokens they have no `sessions` row, so there
// is nothing to revoke: this guard never checked one.
//
// Rejecting here closes that residual window without rotating JWT_SECRET, which is
// shared by all three roles and would sign out every merchant and admin too. No
// legitimate caller is affected — with login disabled there are no valid customer
// sessions to serve, and no client calls these routes (order lookup goes through
// GET /v1/orders/track, which requires the order number).
//
// The real customer account system restores this guard properly, with a session
// row and revocation like its two siblings. See docs/customer-accounts-plan.md.
export async function requireCustomer(_req: Request, res: Response, _next: NextFunction) {
  return fail(
    res,
    401,
    'CUSTOMER_AUTH_DISABLED',
    'Customer accounts are unavailable. To check an order, use order tracking with your order number and phone number.'
  );
}

// Never populates a customer identity — it only lets the request through.
//
// This used to read `customerToken` and, if the JWT verified with role
// 'customer', set req.userId/req.role from it. Every such token came from the
// credential-free login described above, so trusting one meant trusting a phone
// number somebody typed. The middleware is mounted on zero routes today, which
// is exactly why it is a landmine: mounting it on a checkout or order route
// later would silently re-admit pre-fix bypass tokens, which stay valid for up
// to 30 days and have no session row to revoke.
//
// The signature is kept so it stays a drop-in Express middleware and any future
// mount point still compiles. It now does nothing but call next(), which is the
// correct behaviour anyway for the "optional auth" contract: no identity means
// the handler treats the caller as a guest.
//
// When real customer accounts land this is restored properly, reading a session-
// backed token like requireMerchant does. See docs/customer-accounts-plan.md.
export async function optionalCustomer(_req: Request, _res: Response, next: NextFunction) {
  next();
}
