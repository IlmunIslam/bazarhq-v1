import { Router } from 'express';
import { z } from 'zod';
import { requireCustomer } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { ok, created, fail } from '../utils/response';
import { clearCookieOptions } from '../utils/cookies';
import { prisma } from '../lib/prisma';

const router = Router();

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
//
// DISABLED — this endpoint was an authentication bypass.
//
// It accepted only `{ phone }` and, if ANY order existed with that phone number,
// minted a 30-day customer JWT with no credential of any kind. Bangladeshi mobile
// numbers are an 11-digit space behind a known `01[3-9]` prefix, and any merchant
// who has taken one order from a customer knows theirs — so a merchant could mint
// a token for that customer and read their order history at COMPETING shops, plus
// their saved delivery addresses. The token also carried no session row, so it was
// irrevocable for its full 30 days (see requireCustomer in middleware/auth.ts).
//
// The route, its URL and this file are deliberately KEPT so the real customer
// account system (email + password + signup-time email OTP) can land here without
// re-carving the URL space. See docs/customer-accounts-plan.md §1.3 and Sprint 6.
//
// Customers who want to look up an order still can, with proof: GET /v1/orders/track
// requires an order NUMBER as well as the phone, and returns only that one order.

router.post('/auth/login', (_req, res) =>
  fail(
    res,
    410,
    'LOGIN_UNAVAILABLE',
    'Customer sign-in is unavailable. To check an order, use order tracking with your order number and phone number.'
  )
);

// ─── POST /v1/customer/auth/logout ────────────────────────────────────────────

router.post('/auth/logout', (_req, res) => {
  res.clearCookie('customerToken', clearCookieOptions());
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
