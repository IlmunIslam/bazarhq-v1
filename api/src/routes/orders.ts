import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { requireMerchant } from '../middleware/auth';
import { publicRateLimit } from '../middleware/rate-limiter';
import { validate } from '../middleware/validate';
import { ok, created, fail } from '../utils/response';
import { prisma } from '../lib/prisma';
import {
  sendOrderConfirmation,
  sendMerchantNewOrder,
  sendOrderStatusUpdate,
} from '../services/email';

const router = Router();

function generateOrderNumber(): string {
  return 'ORD-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:    ['confirmed', 'cancelled'],
  confirmed:  ['processing', 'shipped', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped:    ['delivered'],
  delivered:  [],
  cancelled:  [],
};

// ─── Schemas ──────────────────────────────────────────────────────────────────

const GuestOrderSchema = z.object({
  subdomain: z.string().min(1).max(100),
  customerName: z.string().min(1).max(100),
  customerPhone: z.string().regex(/^01[3-9]\d{8}$/, 'Phone must be a valid Bangladeshi number'),
  customerEmail: z.string().email().optional(),
  shippingAddress: z.object({
    line1: z.string().min(5).max(200),
    line2: z.string().max(200).optional(),
    city: z.string().min(1).max(100),
    district: z.string().min(1).max(100),
  }),
  paymentMethod: z.enum(['cod', 'bkash', 'nagad']),
  transactionId: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().optional(),
    quantity: z.number().int().min(1).max(100),
  })).min(1).max(50),
});

const StatusUpdateSchema = z.object({
  status: z.enum(['confirmed', 'processing', 'shipped', 'delivered', 'cancelled']),
  note: z.string().max(500).optional(),
});

// ─── Public: place a guest order ──────────────────────────────────────────────

router.post('/guest', publicRateLimit, validate(GuestOrderSchema), async (req, res) => {
  const { subdomain, customerName, customerPhone, customerEmail,
          shippingAddress, paymentMethod, transactionId, notes, items } = req.body;

  // Require transactionId for bKash / Nagad
  if ((paymentMethod === 'bkash' || paymentMethod === 'nagad') && !transactionId) {
    return fail(res, 422, 'TRANSACTION_ID_REQUIRED', 'Transaction ID is required for bKash / Nagad payments');
  }

  const shop = await prisma.shop.findFirst({ where: { subdomain, status: 'published' } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const paymentConfig = await prisma.paymentConfig.findFirst({
    where: { shopId: shop.id, method: paymentMethod, isEnabled: true },
  });
  if (!paymentConfig) return fail(res, 422, 'PAYMENT_METHOD_UNAVAILABLE', 'This payment method is not available');

  // Resolve products + variants
  type LineItem = {
    productId: string; variantId?: string; quantity: number;
    productName: string; variantName?: string;
    unitPrice: number; subtotal: number;
    hasVariants: boolean;
  };

  const lineItems: LineItem[] = [];
  for (const item of items as Array<{ productId: string; variantId?: string; quantity: number }>) {
    const product = await prisma.product.findFirst({
      where: { id: item.productId, shopId: shop.id, status: 'active' },
      include: { variants: item.variantId ? { where: { id: item.variantId } } : false },
    });
    if (!product) return fail(res, 422, 'PRODUCT_NOT_FOUND', `Product ${item.productId} not found`);

    let unitPrice: number;
    let variantName: string | undefined;

    if (item.variantId) {
      const variants = product.variants as { id: string; name: string; price: { toNumber(): number } }[];
      const variant = variants[0];
      if (!variant) return fail(res, 422, 'VARIANT_NOT_FOUND', `Variant ${item.variantId} not found`);
      unitPrice = variant.price.toNumber();
      variantName = variant.name;
    } else {
      unitPrice = (product.basePrice as { toNumber(): number }).toNumber();
    }

    lineItems.push({
      productId: product.id,
      variantId: item.variantId,
      quantity: item.quantity,
      productName: product.name,
      variantName,
      unitPrice,
      subtotal: unitPrice * item.quantity,
      hasVariants: product.hasVariants,
    });
  }

  const subtotal = lineItems.reduce((s, i) => s + i.subtotal, 0);
  const total = subtotal; // shipping fee = 0 for now

  // Place order in a transaction with stock validation + decrement
  let order;
  try {
  order = await prisma.$transaction(async (tx) => {
    // Validate and lock stock
    for (const item of lineItems) {
      if (item.variantId) {
        const v = await tx.productVariant.findUnique({ where: { id: item.variantId } });
        if (!v || v.stock < item.quantity) {
          throw Object.assign(new Error(`Insufficient stock for: ${item.productName}`), { code: 'INSUFFICIENT_STOCK' });
        }
      } else {
        const p = await tx.product.findUnique({ where: { id: item.productId } });
        if (!p || p.stock < item.quantity) {
          throw Object.assign(new Error(`Insufficient stock for: ${item.productName}`), { code: 'INSUFFICIENT_STOCK' });
        }
      }
    }

    let orderNumber = generateOrderNumber();
    // Retry on collision (astronomically unlikely but correct)
    while (await tx.order.findUnique({ where: { orderNumber } })) {
      orderNumber = generateOrderNumber();
    }

    const newOrder = await tx.order.create({
      data: {
        shopId: shop.id,
        orderNumber,
        status: 'pending',
        paymentMethod,
        paymentStatus: 'unpaid',
        subtotal,
        shippingFee: 0,
        total,
        customerName,
        customerPhone,
        customerEmail,
        shippingAddress,
        transactionId,
        notes,
        items: {
          create: lineItems.map(i => ({
            productId: i.productId,
            variantId: i.variantId ?? null,
            productName: i.productName,
            variantName: i.variantName ?? null,
            unitPrice: i.unitPrice,
            quantity: i.quantity,
            subtotal: i.subtotal,
          })),
        },
        timeline: {
          create: { status: 'pending', note: 'Order placed', createdBy: 'customer' },
        },
      },
      include: {
        items: true,
        timeline: true,
      },
    });

    // Decrement stock
    for (const item of lineItems) {
      if (item.variantId) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { decrement: item.quantity } },
        });
      }
      // Always keep product-level stock in sync
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    return newOrder;
  });
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'INSUFFICIENT_STOCK') {
      return fail(res, 422, 'INSUFFICIENT_STOCK', e.message);
    }
    throw err;
  }

  // Fire-and-forget emails (never block the response)
  void (async () => {
    try {
      const shopWithUser = await prisma.shop.findUnique({
        where: { id: shop.id },
        include: { user: { select: { email: true } } },
      });
      const shopData = { name: shop.name, subdomain };
      const orderData = {
        ...order,
        customerEmail: order.customerEmail ?? undefined,
        items: order.items.map(i => ({
          productName: i.productName,
          variantName: i.variantName,
          quantity: i.quantity,
          subtotal: i.subtotal,
        })),
        shippingAddress: order.shippingAddress as { line1: string; city: string; district: string },
      };
      await Promise.all([
        sendOrderConfirmation(orderData, shopData),
        shopWithUser?.user?.email
          ? sendMerchantNewOrder(orderData, shopWithUser.user.email, shopData)
          : Promise.resolve(),
      ]);
    } catch (err) {
      console.error('[orders] email notification error:', (err as Error).message);
    }
  })();

  return created(res, { order });
});

// ─── Public: track order ──────────────────────────────────────────────────────

router.get('/track', publicRateLimit, async (req, res) => {
  const { orderNumber, phone } = req.query;
  if (!orderNumber || !phone) {
    return fail(res, 422, 'MISSING_PARAMS', 'orderNumber and phone are required');
  }

  const order = await prisma.order.findUnique({
    where: { orderNumber: String(orderNumber) },
    include: {
      items: true,
      timeline: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!order || order.customerPhone !== String(phone)) {
    return fail(res, 404, 'ORDER_NOT_FOUND', 'Order not found');
  }

  return ok(res, { order });
});

// ─── Merchant: list orders ────────────────────────────────────────────────────

router.get('/', requireMerchant, async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const { status, search, cursor, limit: limitRaw } = req.query;
  const limit = Math.min(Number(limitRaw) || 20, 100);

  type Where = NonNullable<Parameters<typeof prisma.order.findMany>[0]>['where'];
  const where: Where = { shopId: shop.id };
  if (status) where.status = status as 'pending';
  if (search) {
    where.OR = [
      { orderNumber: { contains: String(search), mode: 'insensitive' } },
      { customerName: { contains: String(search), mode: 'insensitive' } },
      { customerPhone: { contains: String(search) } },
    ];
  }
  if (cursor) where.id = { lt: String(cursor) };

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    include: {
      _count: { select: { items: true } },
    },
  });

  const hasMore = orders.length > limit;
  const items = hasMore ? orders.slice(0, limit) : orders;
  return ok(res, { orders: items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null });
});

// ─── Merchant: order detail ───────────────────────────────────────────────────

router.get('/:id', requireMerchant, async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const order = await prisma.order.findFirst({
    where: { id: req.params.id, shopId: shop.id },
    include: {
      items: true,
      timeline: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!order) return fail(res, 404, 'ORDER_NOT_FOUND', 'Order not found');

  return ok(res, { order });
});

// ─── Merchant: update order status ───────────────────────────────────────────

router.patch('/:id/status', requireMerchant, validate(StatusUpdateSchema), async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const order = await prisma.order.findFirst({
    where: { id: req.params.id, shopId: shop.id },
    include: { items: { include: { variant: true } } },
  });
  if (!order) return fail(res, 404, 'ORDER_NOT_FOUND', 'Order not found');

  const { status, note } = req.body as { status: string; note?: string };
  const allowed = VALID_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(status)) {
    return fail(res, 422, 'INVALID_TRANSITION',
      `Cannot transition from ${order.status} to ${status}`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Restore stock on cancellation
    if (status === 'cancelled') {
      for (const item of order.items) {
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        }
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }

    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        status: status as 'confirmed',
        timeline: {
          create: { status: status as 'confirmed', note: note ?? null, createdBy: req.userId },
        },
      },
      include: {
        items: true,
        timeline: { orderBy: { createdAt: 'asc' } },
      },
    });

    return updatedOrder;
  });

  // Fire-and-forget status update email (never block the response)
  if (updated.customerEmail) {
    void (async () => {
      try {
        const shopData = { name: shop.name, subdomain: shop.subdomain };
        await sendOrderStatusUpdate({
          orderNumber: updated.orderNumber,
          customerName: updated.customerName,
          customerPhone: updated.customerPhone,
          customerEmail: updated.customerEmail ?? undefined,
          total: updated.total,
          paymentMethod: updated.paymentMethod,
          items: updated.items.map(i => ({
            productName: i.productName,
            variantName: i.variantName,
            quantity: i.quantity,
            subtotal: i.subtotal,
          })),
          shippingAddress: updated.shippingAddress as { line1: string; city: string; district: string },
          status,
        }, shopData);
      } catch (err) {
        console.error('[orders] status email error:', (err as Error).message);
      }
    })();
  }

  return ok(res, { order: updated });
});

export default router;
