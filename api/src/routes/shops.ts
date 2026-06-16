import { Router } from 'express';
import { z } from 'zod';
import { requireMerchant } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { publicRateLimit } from '../middleware/rate-limiter';
import { ok, created, fail } from '../utils/response';
import { signToken } from '../utils/jwt';
import { authCookieOptions } from '../utils/cookies';
import { prisma } from '../lib/prisma';

const router = Router();

const SUBDOMAIN_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
const RESERVED = new Set([
  'www', 'api', 'app', 'admin', 'superadmin', 'mail', 'smtp', 'ftp',
  'bazarhq', 'support', 'help', 'status', 'blog', 'shop', 'store',
  'dashboard', 'login', 'register', 'account', 'billing', 'pay',
]);

function subdomainError(s: string): string | null {
  if (!SUBDOMAIN_RE.test(s)) {
    return 'Must be 3–30 characters, lowercase letters/numbers/hyphens, cannot start or end with a hyphen';
  }
  if (RESERVED.has(s)) return 'This subdomain is reserved';
  return null;
}

const CreateShopSchema = z.object({
  subdomain: z.string().min(3).max(30),
  name: z.string().min(2).max(60),
  description: z.string().max(500).optional(),
});

const UpdateShopSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(500).nullable().optional(),
});

// GET /v1/shops/check-subdomain?subdomain=xxx
router.get('/check-subdomain', publicRateLimit, async (req, res) => {
  const subdomain = String(req.query.subdomain ?? '').toLowerCase().trim();

  const err = subdomainError(subdomain);
  if (err) return ok(res, { available: false, message: err });

  const existing = await prisma.shop.findUnique({ where: { subdomain } });
  if (existing) return ok(res, { available: false, message: 'This subdomain is already taken' });

  return ok(res, { available: true, message: `${subdomain}.bazarhq.com is available!` });
});

// POST /v1/shops
router.post('/', requireMerchant, validate(CreateShopSchema), async (req, res) => {
  const { name, description } = req.body;
  const subdomain = String(req.body.subdomain).toLowerCase().trim();

  const existing = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (existing) return fail(res, 409, 'ONE_SHOP_LIMIT', 'You already have a store');

  const err = subdomainError(subdomain);
  if (err) return fail(res, 422, 'INVALID_SUBDOMAIN', err);

  const taken = await prisma.shop.findUnique({ where: { subdomain } });
  if (taken) return fail(res, 409, 'SUBDOMAIN_TAKEN', 'This subdomain is already taken');

  const shop = await prisma.$transaction(async (tx) => {
    const s = await tx.shop.create({
      data: { userId: req.userId!, subdomain, name, description: description ?? null },
    });
    await tx.shopTheme.create({ data: { shopId: s.id } });
    // COD enabled by default so the shop can be published without payment setup
    await tx.paymentConfig.create({ data: { shopId: s.id, method: 'cod', isEnabled: true } });
    return s;
  });

  // Refresh JWT to include shopId
  const { token, jti } = signToken({ sub: req.userId!, role: 'merchant', shopId: shop.id });
  await prisma.session.update({ where: { jti: req.jti! }, data: { revokedAt: new Date() } });
  await prisma.session.create({
    data: {
      jti,
      userId: req.userId!,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  res.cookie('token', token, authCookieOptions(7 * 24 * 60 * 60 * 1000));

  return created(res, { shop });
});

// GET /v1/shops/me
router.get('/me', requireMerchant, async (req, res) => {
  const shop = await prisma.shop.findUnique({
    where: { userId: req.userId },
    include: {
      theme: true,
      categories: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { products: { where: { status: 'active' } }, orders: true } },
    },
  });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'You have not created a store yet');
  return ok(res, { shop });
});

// PATCH /v1/shops/me
router.patch('/me', requireMerchant, validate(UpdateShopSchema), async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const updated = await prisma.shop.update({ where: { id: shop.id }, data: req.body });
  return ok(res, { shop: updated });
});

// POST /v1/shops/me/publish
router.post('/me/publish', requireMerchant, async (req, res) => {
  const shop = await prisma.shop.findUnique({
    where: { userId: req.userId },
    include: { paymentConfigs: { where: { isEnabled: true } } },
  });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');
  if (shop.status === 'published') return fail(res, 409, 'ALREADY_PUBLISHED', 'Store is already published');

  if (shop.paymentConfigs.length === 0) {
    return fail(res, 422, 'NO_PAYMENT_METHOD', 'Enable at least one payment method before publishing');
  }

  const published = await prisma.shop.update({
    where: { id: shop.id },
    data: { status: 'published', publishedAt: new Date() },
  });
  return ok(res, { shop: published });
});

// GET /v1/shops/me/theme
router.get('/me/theme', requireMerchant, async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');
  const theme = await prisma.shopTheme.findUnique({ where: { shopId: shop.id } });
  return ok(res, { theme });
});

// PATCH /v1/shops/me/theme
router.patch('/me/theme', requireMerchant, async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');
  const theme = await prisma.shopTheme.update({ where: { shopId: shop.id }, data: req.body });
  return ok(res, { theme });
});

export default router;
