import { Router } from 'express';
import { z } from 'zod';
import { publicRateLimit } from '../middleware/rate-limiter';
import { requireCustomer } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { ok, created, fail } from '../utils/response';
import { signToken } from '../utils/jwt';
import { prisma } from '../lib/prisma';

const router = Router();

const LoginSchema = z.object({
  phone: z.string().regex(/^01[3-9]\d{8}$/, 'Must be a valid Bangladeshi phone number'),
});

const AddressSchema = z.object({
  label: z.string().max(50).optional(),
  fullName: z.string().min(2).max(100),
  phone: z.string().regex(/^01[3-9]\d{8}$/),
  addressLine1: z.string().min(5).max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  district: z.string().max(100).optional(),
  isDefault: z.boolean().optional(),
});

// ─── POST /v1/customer/auth/login ─────────────────────────────────────────────
// Phone-based auth: if the phone has placed at least one order, issue a JWT.

router.post('/auth/login', publicRateLimit, validate(LoginSchema), async (req, res) => {
  const { phone } = req.body as { phone: string };

  const orderCount = await prisma.order.count({ where: { customerPhone: phone } });
  if (orderCount === 0) {
    return fail(res, 404, 'NO_ORDERS', 'No orders found for this phone number. Place an order first to create an account.');
  }

  const { token, jti } = signToken({ sub: phone, role: 'customer' });

  // No session row for customers in demo (stateless JWT)
  void jti; // jti embedded in token for reference

  res.cookie('customerToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  // Find name from the most recent order
  const latestOrder = await prisma.order.findFirst({
    where: { customerPhone: phone },
    orderBy: { createdAt: 'desc' },
    select: { customerName: true, customerEmail: true },
  });

  return ok(res, {
    customer: { phone, name: latestOrder?.customerName ?? '', email: latestOrder?.customerEmail ?? null },
  });
});

// ─── POST /v1/customer/auth/logout ────────────────────────────────────────────

router.post('/auth/logout', (_req, res) => {
  res.clearCookie('customerToken');
  return ok(res, { message: 'Signed out' });
});

// ─── GET /v1/customer/me ──────────────────────────────────────────────────────

router.get('/me', requireCustomer, async (req, res) => {
  const phone = req.userId!; // sub = phone
  const latestOrder = await prisma.order.findFirst({
    where: { customerPhone: phone },
    orderBy: { createdAt: 'desc' },
    select: { customerName: true, customerEmail: true },
  });
  return ok(res, {
    customer: { phone, name: latestOrder?.customerName ?? '', email: latestOrder?.customerEmail ?? null },
  });
});

// ─── GET /v1/customer/orders ──────────────────────────────────────────────────

router.get('/orders', requireCustomer, async (req, res) => {
  const phone = req.userId!;
  const { cursor, limit: limitRaw } = req.query;
  const limit = Math.min(Number(limitRaw) || 10, 50);

  type Where = NonNullable<Parameters<typeof prisma.order.findMany>[0]>['where'];
  const where: Where = { customerPhone: phone };
  if (cursor) where.id = { lt: String(cursor) };

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    include: {
      items: { select: { productName: true, variantName: true, quantity: true, unitPrice: true } },
      shop: { select: { name: true, subdomain: true } },
    },
  });

  const hasMore = orders.length > limit;
  const items = hasMore ? orders.slice(0, limit) : orders;
  return ok(res, { orders: items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null });
});

// ─── GET /v1/customer/addresses ──────────────────────────────────────────────

router.get('/addresses', requireCustomer, async (req, res) => {
  const phone = req.userId!;
  const addresses = await prisma.savedAddress.findMany({
    where: { customerId: phone },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  return ok(res, { addresses });
});

// ─── POST /v1/customer/addresses ─────────────────────────────────────────────

router.post('/addresses', requireCustomer, validate(AddressSchema), async (req, res) => {
  const phone = req.userId!;

  const count = await prisma.savedAddress.count({ where: { customerId: phone } });
  if (count >= 3) {
    return fail(res, 422, 'ADDRESS_LIMIT', 'You can save a maximum of 3 addresses. Delete one to add another.');
  }

  const data = req.body as z.infer<typeof AddressSchema>;

  // If this is set as default, unset all others first
  if (data.isDefault) {
    await prisma.savedAddress.updateMany({
      where: { customerId: phone },
      data: { isDefault: false },
    });
  }

  const address = await prisma.savedAddress.create({
    data: {
      customerId: phone,
      label: data.label ?? null,
      fullName: data.fullName,
      phone: data.phone,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2 ?? null,
      city: data.city,
      district: data.district ?? null,
      isDefault: data.isDefault ?? count === 0, // first address is default
    },
  });

  return created(res, { address });
});

// ─── PATCH /v1/customer/addresses/:id ────────────────────────────────────────

router.patch('/addresses/:id', requireCustomer, validate(AddressSchema.partial()), async (req, res) => {
  const phone = req.userId!;
  const existing = await prisma.savedAddress.findFirst({
    where: { id: req.params.id, customerId: phone },
  });
  if (!existing) return fail(res, 404, 'NOT_FOUND', 'Address not found');

  const data = req.body as Partial<z.infer<typeof AddressSchema>>;

  if (data.isDefault) {
    await prisma.savedAddress.updateMany({
      where: { customerId: phone, NOT: { id: existing.id } },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.savedAddress.update({
    where: { id: existing.id },
    data: {
      ...(data.label !== undefined && { label: data.label ?? null }),
      ...(data.fullName && { fullName: data.fullName }),
      ...(data.phone && { phone: data.phone }),
      ...(data.addressLine1 && { addressLine1: data.addressLine1 }),
      ...(data.addressLine2 !== undefined && { addressLine2: data.addressLine2 ?? null }),
      ...(data.city && { city: data.city }),
      ...(data.district !== undefined && { district: data.district ?? null }),
      ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
    },
  });

  return ok(res, { address: updated });
});

// ─── DELETE /v1/customer/addresses/:id ───────────────────────────────────────

router.delete('/addresses/:id', requireCustomer, async (req, res) => {
  const phone = req.userId!;
  const existing = await prisma.savedAddress.findFirst({
    where: { id: req.params.id, customerId: phone },
  });
  if (!existing) return fail(res, 404, 'NOT_FOUND', 'Address not found');

  await prisma.savedAddress.delete({ where: { id: existing.id } });

  // If deleted address was default, set the next address as default
  if (existing.isDefault) {
    const next = await prisma.savedAddress.findFirst({
      where: { customerId: phone },
      orderBy: { createdAt: 'desc' },
    });
    if (next) {
      await prisma.savedAddress.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  }

  return ok(res, { message: 'Address deleted' });
});

export default router;
