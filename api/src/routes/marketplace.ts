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

// ─── Comparison (Sprint C5) ──────────────────────────────────────────────────
//
// GET /v1/marketplace/compare?ids=a,b,c,d
//
// Resolves the client-side comparison tray into something renderable: current
// authoritative product data, each product's global category, and its spec
// values — plus the merged, ordered spec rows both clients draw, so neither has
// to re-derive the alignment rule.
//
// Same isolation as every other route in this file: active products in published
// shops only. Ids that are stale, hidden or deleted are DROPPED rather than
// errored — the tray is client-side storage that can outlive a product, and a
// saved comparison link should degrade, not 404. They come back in `droppedIds`
// so the client can prune its tray; it is information, not a failure.

const MAX_COMPARE = 4;

type SpecValue = string | boolean;

function serialiseSpec(row: {
  valueText: string | null;
  valueNumber: Prisma.Decimal | null;
  valueBool: boolean | null;
}): SpecValue | null {
  // Numbers as strings, exactly as GET /products/:id/specs returns them: the
  // column is numeric(14,4), and routing it through a JS float would be a silent
  // precision trap. Clients format using `unit` from specRows.
  if (row.valueNumber !== null) return row.valueNumber.toString();
  if (row.valueBool !== null) return row.valueBool;
  return row.valueText;
}

router.get('/compare', publicRateLimit, async (req, res) => {
  const requested = [
    ...new Set(
      String(req.query.ids ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    ),
  ].slice(0, MAX_COMPARE);

  const empty = {
    products: [] as unknown[],
    specRows: [] as unknown[],
    categories: [] as unknown[],
    sharedCategoryId: null,
    droppedIds: [] as string[],
  };
  if (requested.length === 0) return ok(res, empty);

  const rows = await prisma.product.findMany({
    where: { id: { in: requested }, status: 'active', shop: { status: 'published' } },
    select: {
      id: true,
      name: true,
      slug: true,
      basePrice: true,
      compareAtPrice: true,
      images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
      shop: { select: { name: true, subdomain: true } },
      globalCategory: { select: { id: true, name: true, slug: true, isActive: true } },
      specs: {
        select: {
          specFieldId: true,
          valueText: true,
          valueNumber: true,
          valueBool: true,
          specField: { select: { categoryId: true, isActive: true, isComparable: true } },
        },
      },
    },
  });

  // Prisma's `in` does not preserve argument order, and the tray's order is the
  // one the customer built — so re-key and walk the request.
  const byId = new Map(rows.map(r => [r.id, r]));
  const found = requested.map(id => byId.get(id)).filter((r): r is (typeof rows)[number] => !!r);
  const droppedIds = requested.filter(id => !byId.has(id));

  // A category an admin has retired is hidden everywhere else public (see
  // GET /v1/categories), so for comparison purposes such a product counts as
  // uncategorised: no category, no spec rows. Its values stay in the database
  // and reappear if the category is restored.
  const liveCategory = (p: (typeof rows)[number]) =>
    p.globalCategory && p.globalCategory.isActive ? p.globalCategory : null;

  // Category order follows first appearance among the products, so the grouped
  // rendering matches the column order the customer sees.
  const categories: { id: string; name: string; slug: string }[] = [];
  for (const p of found) {
    const c = liveCategory(p);
    if (c && !categories.some(x => x.id === c.id)) {
      categories.push({ id: c.id, name: c.name, slug: c.slug });
    }
  }

  const fields = categories.length
    ? await prisma.specField.findMany({
        where: {
          categoryId: { in: categories.map(c => c.id) },
          isActive: true,
          // isComparable is exactly this decision: a field the admin marked as
          // not worth a comparison row (wash care, ingredients) stays off it.
          isComparable: true,
        },
        select: {
          id: true,
          key: true,
          label: true,
          unit: true,
          dataType: true,
          categoryId: true,
          sortOrder: true,
        },
      })
    : [];

  const categoryRank = new Map(categories.map((c, i) => [c.id, i]));
  const specRows = fields
    .sort(
      (a, b) =>
        (categoryRank.get(a.categoryId) ?? 0) - (categoryRank.get(b.categoryId) ?? 0) ||
        a.sortOrder - b.sortOrder ||
        a.label.localeCompare(b.label)
    )
    .map(({ id, sortOrder: _sortOrder, ...f }) => ({ specFieldId: id, ...f }));

  const products = found.map(p => {
    const category = liveCategory(p);

    const specs: Record<string, SpecValue> = {};
    for (const s of p.specs) {
      // Skip retired and non-comparable fields, and any value left over from a
      // category the product no longer belongs to.
      if (!s.specField.isActive || !s.specField.isComparable) continue;
      if (!category || s.specField.categoryId !== category.id) continue;
      const value = serialiseSpec(s);
      if (value !== null) specs[s.specFieldId] = value;
    }

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      basePrice: p.basePrice.toString(),
      compareAtPrice: p.compareAtPrice?.toString() ?? null,
      image: p.images[0]?.url ?? null,
      shop: p.shop,
      category: category ? { id: category.id, name: category.name, slug: category.slug } : null,
      specs,
    };
  });

  // The single signal that picks the render mode, so neither client re-derives
  // the rule: set only when every product shares one live category.
  const first = products[0]?.category?.id ?? null;
  const sharedCategoryId =
    products.length > 0 && first !== null && products.every(p => p.category?.id === first)
      ? first
      : null;

  return ok(res, { products, specRows, categories, sharedCategoryId, droppedIds });
});

export default router;
