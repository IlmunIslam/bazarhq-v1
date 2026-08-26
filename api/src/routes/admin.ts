import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { validate } from '../middleware/validate';
import { requireAdmin } from '../middleware/auth';
import { publicRateLimit, rateLimiter } from '../middleware/rate-limiter';
import { ok, created, fail } from '../utils/response';
import { signToken } from '../utils/jwt';
import { authCookieOptions, clearCookieOptions } from '../utils/cookies';
import { encrypt, decrypt } from '../utils/encryption';
import { getRedis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { writeAuditLog } from '../services/audit';
import { sendTestEmail, getQuotaUsage, hashEmail, EmailUnavailableError } from '../services/email';
import { getTransport } from '../services/email/transport';
import taxonomyRoutes from './admin-taxonomy';

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const TotpVerifySchema = z.object({
  tempToken: z.string(),
  code: z.string().min(6).max(8),
});

const ConfirmTotpSchema = z.object({
  code: z.string().min(6).max(8),
});

const MerchantPatchSchema = z.object({
  status: z.enum(['active', 'suspended']),
});

const ShopPatchSchema = z.object({
  status: z.enum(['published', 'suspended', 'draft']),
});

const EmailTestSendSchema = z.object({
  to: z.string().email(),
  note: z.string().max(200).optional(),
});

const AnnouncementSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  targetRole: z.enum(['merchant', 'customer', 'all']),
  isActive: z.boolean().default(true),
  expiresAt: z.string().datetime().nullable().optional(),
});

// ─── Helper: Issue admin JWT ─────────────────────────────────────────────────

/**
 * Creates the admin session and hands the JWT to the client.
 *
 * Web clients keep httpOnly-cookie auth exactly as before. Native clients
 * (React Native) can't read httpOnly cookies, so they opt in with the
 * `X-Client: mobile` header and receive the JWT in the return value to persist
 * in expo-secure-store — the same handshake merchant login uses (routes/auth.ts).
 * Either way the same Session row + jti back the token, so it stays fully
 * revocable, keeps its 8h expiry, and is still governed by the 30-minute
 * inactivity clock started below.
 *
 * @returns the raw JWT for native clients, or null when it went out as a cookie.
 */
async function issueAdminJwt(
  adminId: string,
  req: import('express').Request,
  res: import('express').Response
): Promise<string | null> {
  const redis = getRedis();
  const { token, jti } = signToken({ sub: adminId, role: 'admin' });

  await prisma.session.create({
    data: {
      jti,
      adminId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    },
  });

  // Start 30-minute inactivity clock
  if (redis) {
    await redis.set(`admin:activity:${jti}`, '1', { ex: 30 * 60 });
  }

  const isMobile = req.get('x-client') === 'mobile';
  if (!isMobile) {
    res.cookie('adminToken', token, authCookieOptions(8 * 60 * 60 * 1000));
  }
  return isMobile ? token : null;
}

// ─── POST /v1/admin/auth/login ───────────────────────────────────────────────

router.post('/auth/login', publicRateLimit, validate(LoginSchema), async (req, res) => {
  const { email, password } = req.body;
  const redis = getRedis();
  const clientIp = (req.ip ?? '').replace(/^::ffff:/, '');

  if (redis) {
    const locked = await redis.get(`admin:bf:lock:${email}`);
    if (locked) {
      return fail(res, 429, 'ACCOUNT_LOCKED', 'Too many failed login attempts. Try again in 15 minutes.');
    }
  }

  const recordFailure = async () => {
    if (!redis) return;
    const key = `admin:bf:count:${email}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 15 * 60);
    if (count >= 3) {
      await redis.set(`admin:bf:lock:${email}`, '1', { ex: 15 * 60 });
      await redis.del(key);
    }
  };

  const admin = await prisma.adminAccount.findUnique({ where: { email } });

  if (!admin) {
    await recordFailure();
    return fail(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  if (admin.status === 'inactive') {
    return fail(res, 403, 'ACCOUNT_INACTIVE', 'This admin account has been deactivated');
  }

  // IP whitelist — only enforced when the list is non-empty
  if (admin.ipWhitelist.length > 0 && !admin.ipWhitelist.includes(clientIp)) {
    return fail(res, 403, 'IP_NOT_ALLOWED', 'Access from this IP address is not permitted');
  }

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    await recordFailure();
    return fail(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  if (redis) {
    await redis.del(`admin:bf:count:${email}`);
    await redis.del(`admin:bf:lock:${email}`);
  }

  if (admin.twoFaEnabled && admin.twoFaSecret) {
    // TOTP required — issue a short-lived temp token
    const tempToken = randomUUID();
    if (redis) {
      await redis.set(`admin:pending:${tempToken}`, admin.id, { ex: 5 * 60 });
    } else {
      // Without Redis, TOTP can't be staged — fall through to full login
    }
    if (redis) {
      return ok(res, { requiresTotp: true, tempToken });
    }
  }

  const token = await issueAdminJwt(admin.id, req, res);
  return ok(res, {
    admin: { id: admin.id, email: admin.email, fullName: admin.fullName, role: admin.role },
    ...(token ? { token } : {}),
  });
});

// ─── POST /v1/admin/auth/verify-totp ────────────────────────────────────────

router.post('/auth/verify-totp', publicRateLimit, validate(TotpVerifySchema), async (req, res) => {
  const { tempToken, code } = req.body;
  const redis = getRedis();

  if (!redis) return fail(res, 503, 'SERVICE_UNAVAILABLE', 'TOTP verification requires Redis to be configured');

  const adminId = await redis.get<string>(`admin:pending:${tempToken}`);
  if (!adminId) return fail(res, 401, 'INVALID_TOKEN', 'Verification session expired. Please log in again.');

  const admin = await prisma.adminAccount.findUnique({ where: { id: adminId } });
  if (!admin?.twoFaSecret) return fail(res, 401, 'INVALID_TOKEN', 'Invalid verification session');

  const secret = decrypt(admin.twoFaSecret);
  const result = verifySync({ secret, token: code });
  if (!result.valid) {
    return fail(res, 401, 'INVALID_TOTP', 'Invalid authentication code');
  }

  await redis.del(`admin:pending:${tempToken}`);
  const token = await issueAdminJwt(admin.id, req, res);

  return ok(res, {
    admin: { id: admin.id, email: admin.email, fullName: admin.fullName, role: admin.role },
    ...(token ? { token } : {}),
  });
});

// ─── All routes below require admin auth ────────────────────────────────────

router.use(requireAdmin);

// Sprint C1 — taxonomy authoring (/categories, /spec-fields). Kept in its own
// file for size; mounted here so it inherits the requireAdmin above rather than
// re-running it. Adds new paths only; no route below changes.
router.use(taxonomyRoutes);

// ─── GET /v1/admin/auth/me ───────────────────────────────────────────────────

router.get('/auth/me', async (req, res) => {
  const admin = await prisma.adminAccount.findUnique({
    where: { id: req.adminId },
    select: { id: true, email: true, fullName: true, role: true, twoFaEnabled: true, status: true },
  });
  if (!admin) return fail(res, 404, 'NOT_FOUND', 'Admin account not found');
  return ok(res, { admin });
});

// ─── POST /v1/admin/auth/logout ──────────────────────────────────────────────

router.post('/auth/logout', async (req, res) => {
  const redis = getRedis();
  await prisma.session.update({ where: { jti: req.jti! }, data: { revokedAt: new Date() } });
  if (redis) await redis.del(`admin:activity:${req.jti}`);
  res.clearCookie('adminToken', clearCookieOptions());
  return ok(res, { message: 'Logged out' });
});

// ─── POST /v1/admin/auth/setup-totp ─────────────────────────────────────────

router.post('/auth/setup-totp', async (req, res) => {
  const admin = await prisma.adminAccount.findUnique({ where: { id: req.adminId } });
  if (!admin) return fail(res, 404, 'NOT_FOUND', 'Admin account not found');

  const secret = generateSecret();
  const otpauthUrl = generateURI({ issuer: 'BazarHQ Admin', label: admin.email, secret });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  await prisma.adminAccount.update({
    where: { id: admin.id },
    data: { twoFaSecret: encrypt(secret), twoFaEnabled: false },
  });

  return ok(res, { secret, qrCodeDataUrl, otpauthUrl });
});

// ─── POST /v1/admin/auth/confirm-totp ───────────────────────────────────────

router.post('/auth/confirm-totp', validate(ConfirmTotpSchema), async (req, res) => {
  const { code } = req.body;
  const admin = await prisma.adminAccount.findUnique({ where: { id: req.adminId } });
  if (!admin?.twoFaSecret) return fail(res, 400, 'NOT_SETUP', 'Run /setup-totp first');

  const secret = decrypt(admin.twoFaSecret);
  const result = verifySync({ secret, token: code });
  if (!result.valid) {
    return fail(res, 400, 'INVALID_TOTP', 'Invalid code. Please try again.');
  }

  await prisma.adminAccount.update({ where: { id: admin.id }, data: { twoFaEnabled: true } });

  await writeAuditLog({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'TOTP_ENABLED',
    ipAddress: req.ip,
  });

  return ok(res, { message: '2FA enabled successfully' });
});

// ─── DELETE /v1/admin/auth/totp ──────────────────────────────────────────────

router.delete('/auth/totp', async (req, res) => {
  const admin = await prisma.adminAccount.findUnique({ where: { id: req.adminId } });
  if (!admin) return fail(res, 404, 'NOT_FOUND', 'Admin account not found');

  await prisma.adminAccount.update({
    where: { id: admin.id },
    data: { twoFaEnabled: false, twoFaSecret: null },
  });

  await writeAuditLog({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'TOTP_DISABLED',
    ipAddress: req.ip,
  });

  return ok(res, { message: '2FA disabled' });
});

// ─── GET /v1/admin/merchants ─────────────────────────────────────────────────

router.get('/merchants', async (req, res) => {
  const { status, search, cursor, limit: limitStr } = req.query as Record<string, string>;
  const limit = Math.min(parseInt(limitStr ?? '50') || 50, 100);

  const where: Record<string, unknown> = {};
  if (status && status !== 'all') where.status = status;
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { fullName: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (cursor) where.createdAt = { lt: new Date(cursor) };

  const users = await prisma.user.findMany({
    where,
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    include: {
      shop: {
        select: {
          id: true,
          name: true,
          subdomain: true,
          status: true,
          publishedAt: true,
          createdAt: true,
        },
      },
    },
  });

  const hasMore = users.length > limit;
  const results = hasMore ? users.slice(0, limit) : users;

  return ok(res, {
    merchants: results.map(u => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      phone: u.phone,
      status: u.status,
      emailVerified: u.emailVerified,
      createdAt: u.createdAt,
      shop: u.shop,
    })),
    nextCursor: hasMore ? results[results.length - 1].createdAt.toISOString() : null,
  });
});

// ─── PATCH /v1/admin/merchants/:id ──────────────────────────────────────────

router.patch('/merchants/:id', validate(MerchantPatchSchema), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return fail(res, 404, 'NOT_FOUND', 'Merchant not found');

  const admin = await prisma.adminAccount.findUnique({
    where: { id: req.adminId },
    select: { email: true },
  });

  await prisma.user.update({ where: { id }, data: { status } });

  if (status === 'suspended') {
    await prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await writeAuditLog({
    actorId: req.adminId!,
    actorEmail: admin?.email ?? 'unknown',
    action: status === 'suspended' ? 'MERCHANT_SUSPENDED' : 'MERCHANT_ACTIVATED',
    targetType: 'User',
    targetId: id,
    ipAddress: req.ip,
  });

  return ok(res, { message: `Merchant ${status === 'suspended' ? 'suspended' : 'activated'}` });
});

// ─── POST /v1/admin/merchants/:id/verify-email ───────────────────────────────

router.post('/merchants/:id/verify-email', async (req, res) => {
  const { id } = req.params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return fail(res, 404, 'NOT_FOUND', 'Merchant not found');

  if (user.emailVerified) {
    return ok(res, { message: 'Email already verified' });
  }

  const admin = await prisma.adminAccount.findUnique({
    where: { id: req.adminId },
    select: { email: true },
  });

  await prisma.user.update({ where: { id }, data: { emailVerified: true } });

  await writeAuditLog({
    actorId: req.adminId!,
    actorEmail: admin?.email ?? 'unknown',
    action: 'MERCHANT_EMAIL_VERIFIED',
    targetType: 'User',
    targetId: id,
    ipAddress: req.ip,
  });

  return ok(res, { message: 'Email verified' });
});

// ─── PATCH /v1/admin/shops/:id ───────────────────────────────────────────────

router.patch('/shops/:id', validate(ShopPatchSchema), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const shop = await prisma.shop.findUnique({ where: { id } });
  if (!shop) return fail(res, 404, 'NOT_FOUND', 'Shop not found');

  const admin = await prisma.adminAccount.findUnique({
    where: { id: req.adminId },
    select: { email: true },
  });

  await prisma.shop.update({
    where: { id },
    data: {
      status,
      ...(status === 'published' && !shop.publishedAt ? { publishedAt: new Date() } : {}),
    },
  });

  await writeAuditLog({
    actorId: req.adminId!,
    actorEmail: admin?.email ?? 'unknown',
    action: `SHOP_${status.toUpperCase()}`,
    targetType: 'Shop',
    targetId: id,
    ipAddress: req.ip,
  });

  return ok(res, { message: `Shop status updated to ${status}` });
});

// ─── GET /v1/admin/analytics/overview ───────────────────────────────────────

router.get('/analytics/overview', async (_req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalMerchants,
    activeMerchants,
    publishedShops,
    totalOrders,
    revenueResult,
    recentOrders,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: 'active' } }),
    prisma.shop.count({ where: { status: 'published' } }),
    prisma.order.count(),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { status: { notIn: ['cancelled'] } },
    }),
    prisma.order.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        total: true,
        status: true,
        createdAt: true,
        shop: { select: { name: true, subdomain: true } },
      },
    }),
  ]);

  const ordersByDay = await prisma.$queryRaw<Array<{ date: string; count: bigint; revenue: string }>>`
    SELECT
      DATE(created_at)::text AS date,
      COUNT(*)              AS count,
      COALESCE(SUM(total)::text, '0') AS revenue
    FROM orders
    WHERE created_at >= ${thirtyDaysAgo}
      AND status != 'cancelled'
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `;

  return ok(res, {
    totalMerchants,
    activeMerchants,
    publishedShops,
    totalOrders,
    totalRevenue: revenueResult._sum.total?.toString() ?? '0.00',
    recentOrders: recentOrders.map(o => ({ ...o, total: o.total.toString() })),
    ordersByDay: ordersByDay.map(r => ({
      date: r.date,
      count: Number(r.count),
      revenue: r.revenue,
    })),
  });
});

// ─── GET /v1/admin/announcements ─────────────────────────────────────────────

router.get('/announcements', async (_req, res) => {
  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return ok(res, { announcements });
});

// ─── POST /v1/admin/announcements ────────────────────────────────────────────

router.post('/announcements', validate(AnnouncementSchema), async (req, res) => {
  const { title, body, targetRole, isActive, expiresAt } = req.body;

  const admin = await prisma.adminAccount.findUnique({
    where: { id: req.adminId },
    select: { email: true },
  });

  const announcement = await prisma.announcement.create({
    data: {
      title,
      body,
      targetRole,
      isActive: isActive ?? true,
      createdBy: req.adminId!,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  await writeAuditLog({
    actorId: req.adminId!,
    actorEmail: admin?.email ?? 'unknown',
    action: 'ANNOUNCEMENT_CREATED',
    targetType: 'Announcement',
    targetId: announcement.id,
    ipAddress: req.ip,
  });

  return created(res, { announcement });
});

// ─── PATCH /v1/admin/announcements/:id ───────────────────────────────────────

router.patch('/announcements/:id', validate(AnnouncementSchema.partial()), async (req, res) => {
  const { id } = req.params;
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) return fail(res, 404, 'NOT_FOUND', 'Announcement not found');

  const { expiresAt, ...rest } = req.body;
  const updated = await prisma.announcement.update({
    where: { id },
    data: {
      ...rest,
      ...(expiresAt !== undefined ? { expiresAt: expiresAt ? new Date(expiresAt) : null } : {}),
    },
  });
  return ok(res, { announcement: updated });
});

// ─── DELETE /v1/admin/announcements/:id ──────────────────────────────────────

router.delete('/announcements/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) return fail(res, 404, 'NOT_FOUND', 'Announcement not found');

  await prisma.announcement.update({ where: { id }, data: { isActive: false } });
  return ok(res, { message: 'Announcement deactivated' });
});

// ─── GET /v1/admin/audit-logs ────────────────────────────────────────────────

router.get('/audit-logs', async (req, res) => {
  const { cursor, limit: limitStr, action } = req.query as Record<string, string>;
  const limit = Math.min(parseInt(limitStr ?? '50') || 50, 100);

  const where: Record<string, unknown> = {};
  if (action) where.action = { contains: action, mode: 'insensitive' };
  if (cursor) where.createdAt = { lt: new Date(cursor) };

  const logs = await prisma.auditLog.findMany({
    where,
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
  });

  const hasMore = logs.length > limit;
  const results = hasMore ? logs.slice(0, limit) : logs;

  return ok(res, {
    logs: results,
    nextCursor: hasMore ? results[results.length - 1].createdAt.toISOString() : null,
  });
});

// ─── POST /v1/admin/email/test-send ──────────────────────────────────────────
// Sprint 0 (§2.7 items 3–6): proves delivery from production without going
// through a signup. It reports the transport error verbatim, which is how both
// egress faults were diagnosed: 465 blocked (ETIMEDOUT at connect) and then
// IPv6 unroutable on 587 (ENETUNREACH). See gmail-smtp.ts.
//
// Deliberately ignores TRANSACTIONAL_EMAIL_ENABLED: this is what proves the
// transport before that flag is flipped on.

router.post(
  '/email/test-send',
  // Tight cap: this endpoint spends the shared daily Gmail quota, and a loose
  // one would let a compromised admin session drain it.
  rateLimiter({ windowSecs: 60 * 60, max: 10, keyPrefix: 'rl:email-test' }),
  validate(EmailTestSendSchema),
  async (req, res) => {
    const { to, note } = req.body as { to: string; note?: string };

    const admin = await prisma.adminAccount.findUnique({
      where: { id: req.adminId },
      select: { email: true },
    });

    const quotaBefore = await getQuotaUsage();

    try {
      const messageId = await sendTestEmail(to, note);

      await writeAuditLog({
        actorId: req.adminId!,
        actorEmail: admin?.email ?? 'unknown',
        action: 'EMAIL_TEST_SEND',
        targetType: 'EmailSend',
        // Recipient is hashed in the audit trail for the same reason it is
        // hashed in email_sends (§7.6).
        metadata: { toEmailHash: hashEmail(to), messageId, outcome: 'sent' },
        ipAddress: req.ip,
      });

      return ok(res, {
        message: 'Email accepted by the transport. Check the inbox (and the spam folder).',
        messageId,
        quota: quotaBefore,
      });
    } catch (err) {
      const reason = err instanceof EmailUnavailableError ? err.reason : 'send_failed';
      const detail = (err as Error).message;

      await writeAuditLog({
        actorId: req.adminId!,
        actorEmail: admin?.email ?? 'unknown',
        action: 'EMAIL_TEST_SEND',
        targetType: 'EmailSend',
        metadata: { toEmailHash: hashEmail(to), outcome: 'failed', reason, detail: detail.slice(0, 500) },
        ipAddress: req.ip,
      });

      // Admin-only diagnostic route, so the transport error is surfaced
      // verbatim — that string is the whole point of the endpoint.
      return fail(res, 503, 'EMAIL_UNAVAILABLE', `Send failed (${reason}): ${detail}`);
    }
  },
);

// ─── GET /v1/admin/email/status ──────────────────────────────────────────────
// Read-only: is the transport configured, how much of today's quota is spent,
// and the last few send attempts. No secrets are returned.

router.get('/email/status', async (_req, res) => {
  const transport = getTransport();
  const quota = await getQuotaUsage();

  const recent = await prisma.emailSend.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true, template: true, status: true,
      providerMessageId: true, error: true, createdAt: true,
    },
  });

  return ok(res, {
    provider: transport.name,
    configured: transport.isConfigured(),
    transactionalEmailEnabled:
      (process.env.TRANSACTIONAL_EMAIL_ENABLED ?? 'false').trim().toLowerCase() === 'true',
    // Mirrors the transport's DEFAULT_PORT (587) — see gmail-smtp.ts for why.
    smtpPort: Number(process.env.SMTP_PORT) || 587,
    quota,
    recent,
  });
});

// ─── GET /v1/admin/system/health ─────────────────────────────────────────────

router.get('/system/health', async (_req, res) => {
  const [userCount, shopCount, orderCount] = await Promise.all([
    prisma.user.count(),
    prisma.shop.count(),
    prisma.order.count(),
  ]);
  return ok(res, {
    status: 'healthy',
    database: 'connected',
    userCount,
    shopCount,
    orderCount,
    timestamp: new Date().toISOString(),
  });
});

export default router;
