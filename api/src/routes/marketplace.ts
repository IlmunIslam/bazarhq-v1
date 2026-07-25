import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { publicRateLimit } from '../middleware/rate-limiter';
import { ok } from '../utils/response';
import { prisma } from '../lib/prisma';

// ─── Marketplace (Sprint M1) ─────────────────────────────────────────────────
//
// Cross-shop discovery layer. Completely separate from the per-shop
// /storefront/:subdomain routes — those are untouched. Every query here filters
// strictly on published shops (and active products) so unpublished/suspended
// merchants never leak. Read-only and public; unlike storefront, these do NOT
// record page views.

const router = Router();

// Popularity ranking uses only signals we actually collect: recent order counts
// (primary) and recent page views (tie-break), then recency. See docs/marketplace-plan.md §3.
const RANKING_WINDOW_DAYS = 30;

function windowStart(): Date {
  return new Date(Date.now() - RANKING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

// GET /v1/marketplace/shops?sort=popular|newest&limit=&offset=
//
// Lists PUBLISHED shops that have at least one active product. `popular` ranks by
// 30-day order count, then 30-day page views, then publishedAt (all desc).
// `newest` is publishedAt desc. Offset pagination: the `popular` ranking is
// computed in-app (can't be keyset-paginated), so both sorts share offset paging
// for a consistent interface.
router.get('/shops', publicRateLimit, async (req, res) => {
  const sort = req.query.sort === 'newest' ? 'newest' : 'popular';
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  // Candidate set: published shops with ≥1 active product. Lightweight card fields only.
  const shops = await prisma.shop.findMany({
    where: { status: 'published', products: { some: { status: 'active' } } },
    select: {
      id: true,
      name: true,
      subdomain: true,
      description: true,
      logoUrl: true,
      publishedAt: true,
    },
  });

  // Active product count per shop (for the card).
  const productCounts = await prisma.product.groupBy({
    by: ['shopId'],
    where: { shopId: { in: shops.map(s => s.id) }, status: 'active' },
    _count: { _all: true },
  });
  const productCountByShop = new Map(productCounts.map(p => [p.shopId, p._count._all]));

  let ranked: typeof shops;
  if (sort === 'newest') {
    ranked = [...shops].sort(
      (a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
    );
  } else {
    // Aggregate the two honest popularity signals over the ranking window.
    const since = windowStart();
    const shopIds = shops.map(s => s.id);
    const [orderAgg, viewAgg] = await Promise.all([
      prisma.order.groupBy({
        by: ['shopId'],
        where: { shopId: { in: shopIds }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.pageView.groupBy({
        by: ['shopId'],
        where: { shopId: { in: shopIds }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);
    const orders = new Map(orderAgg.map(o => [o.shopId, o._count._all]));
    const views = new Map(viewAgg.map(v => [v.shopId, v._count._all]));

    ranked = [...shops].sort((a, b) => {
      const byOrders = (orders.get(b.id) ?? 0) - (orders.get(a.id) ?? 0);
      if (byOrders !== 0) return byOrders;
      const byViews = (views.get(b.id) ?? 0) - (views.get(a.id) ?? 0);
      if (byViews !== 0) return byViews;
      return (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
    });
  }

  const total = ranked.length;
  const page = ranked.slice(offset, offset + limit).map(s => ({
    ...s,
    productCount: productCountByShop.get(s.id) ?? 0,
  }));

  return ok(res, {
    shops: page,
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
  });
});

// GET /v1/marketplace/products?search=&sort=&cursor=&limit=
//
// Search/browse ACTIVE products across all PUBLISHED shops. Cursor pagination
// mirrors the storefront products endpoint. Each item carries its shop's
// subdomain + slug (slugs are unique only per-shop) so the web can deep-link.
router.get('/products', publicRateLimit, async (req, res) => {
  const { search, sort, cursor, limit: limitRaw } = req.query;
  const limit = Math.min(Number(limitRaw) || 20, 100);

  // Strict isolation: active products whose shop is published.
  const where: Prisma.ProductWhereInput = {
    status: 'active',
    shop: { status: 'published' },
  };

  if (search) {
    where.OR = [
      { name: { contains: String(search), mode: 'insensitive' } },
      { description: { contains: String(search), mode: 'insensitive' } },
      { tags: { has: String(search) } },
    ];
  }

  if (cursor) where.id = { lt: String(cursor) };

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    sort === 'price_asc'  ? { basePrice: 'asc' } :
    sort === 'price_desc' ? { basePrice: 'desc' } :
                            { createdAt: 'desc' };

  const rows = await prisma.product.findMany({
    where,
    orderBy,
    take: limit + 1,
    select: {
      id: true,
      name: true,
      slug: true,
      basePrice: true,
      compareAtPrice: true,
      images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
      shop: { select: { name: true, subdomain: true, logoUrl: true } },
    },
  });

  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map(({ images, ...p }) => ({
    ...p,
    image: images[0]?.url ?? null,
  }));

  return ok(res, {
    products: items,
    nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
  });
});

export default router;
