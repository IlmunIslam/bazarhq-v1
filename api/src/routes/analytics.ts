import { Router } from 'express';
import { requireMerchant } from '../middleware/auth';
import { ok, fail } from '../utils/response';
import { prisma } from '../lib/prisma';

const router = Router();

router.use(requireMerchant);

function periodRange(period: string): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  if (period === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  if (period === 'month') {
    const start = new Date(now);
    start.setDate(now.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  // default: all time
  return { start: new Date(0), end };
}

// GET /v1/analytics/overview?period=today|week|month
router.get('/overview', async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const period = String(req.query.period ?? 'month');
  const { start, end } = periodRange(period);

  const [orders, allOrders] = await Promise.all([
    prisma.order.findMany({
      where: { shopId: shop.id, createdAt: { gte: start, lte: end } },
      select: { status: true, total: true, createdAt: true },
    }),
    prisma.order.findMany({
      where: { shopId: shop.id },
      select: { status: true },
    }),
  ]);

  // Revenue = sum of delivered + confirmed + shipped orders in period
  const PAID_STATUSES = ['confirmed', 'processing', 'shipped', 'delivered'];
  const revenue = orders
    .filter(o => PAID_STATUSES.includes(o.status))
    .reduce((sum, o) => sum + Number(o.total), 0);

  const orderCount = orders.length;

  // Order status breakdown for all-time
  const statusBreakdown: Record<string, number> = {};
  for (const o of allOrders) {
    statusBreakdown[o.status] = (statusBreakdown[o.status] ?? 0) + 1;
  }

  // 30-day daily revenue (always last 30 days regardless of period for the chart)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const chartOrders = await prisma.order.findMany({
    where: {
      shopId: shop.id,
      createdAt: { gte: thirtyDaysAgo },
      status: { in: ['confirmed', 'processing', 'shipped', 'delivered'] },
    },
    select: { total: true, createdAt: true },
  });

  // Build day-by-day map for last 30 days
  const dailyMap: Record<string, number> = {};
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    dailyMap[d.toISOString().slice(0, 10)] = 0;
  }
  for (const o of chartOrders) {
    const day = o.createdAt.toISOString().slice(0, 10);
    if (day in dailyMap) dailyMap[day] += Number(o.total);
  }
  const dailyRevenue = Object.entries(dailyMap).map(([date, revenue]) => ({ date, revenue }));

  return ok(res, { revenue, orderCount, statusBreakdown, dailyRevenue });
});

// GET /v1/analytics/top-products?period=month|week|today
router.get('/top-products', async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const period = String(req.query.period ?? 'month');
  const { start, end } = periodRange(period);

  // Aggregate order items in period for this shop
  const items = await prisma.orderItem.findMany({
    where: {
      order: {
        shopId: shop.id,
        createdAt: { gte: start, lte: end },
        status: { in: ['confirmed', 'processing', 'shipped', 'delivered'] },
      },
    },
    select: { productId: true, productName: true, quantity: true, subtotal: true },
  });

  // Group by product
  const productMap: Record<string, { name: string; quantity: number; revenue: number }> = {};
  for (const item of items) {
    if (!productMap[item.productId]) {
      productMap[item.productId] = { name: item.productName, quantity: 0, revenue: 0 };
    }
    productMap[item.productId].quantity += item.quantity;
    productMap[item.productId].revenue += Number(item.subtotal);
  }

  const topProducts = Object.entries(productMap)
    .map(([productId, data]) => ({ productId, ...data }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return ok(res, { topProducts });
});

// GET /v1/analytics/visitors?period=today|week|month
router.get('/visitors', async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const period = String(req.query.period ?? 'month');
  const { start, end } = periodRange(period);

  const views = await prisma.pageView.findMany({
    where: { shopId: shop.id, createdAt: { gte: start, lte: end } },
    select: { visitorHash: true },
  });

  const totalViews = views.length;
  const uniqueVisitors = new Set(views.map(v => v.visitorHash)).size;

  // Conversion = orders / unique visitors (guard div-by-zero)
  const orderCount = await prisma.order.count({
    where: { shopId: shop.id, createdAt: { gte: start, lte: end } },
  });
  const conversionRate = uniqueVisitors > 0
    ? Number(((orderCount / uniqueVisitors) * 100).toFixed(1))
    : 0;

  return ok(res, { totalViews, uniqueVisitors, conversionRate, orderCount });
});

export default router;
