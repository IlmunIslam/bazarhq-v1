import { Router } from 'express';
import { publicRateLimit } from '../middleware/rate-limiter';
import { ok, fail } from '../utils/response';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /v1/storefront/:subdomain
router.get('/:subdomain', publicRateLimit, async (req, res) => {
  const shop = await prisma.shop.findFirst({
    where: { subdomain: req.params.subdomain, status: 'published' },
    include: {
      theme: true,
      categories: { orderBy: { sortOrder: 'asc' } },
      paymentConfigs: { where: { isEnabled: true }, select: { method: true } },
    },
  });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found or not published');

  const { theme, categories, paymentConfigs, ...shopData } = shop;
  const paymentMethods = paymentConfigs.map(p => p.method);
  return ok(res, { shop: shopData, theme, categories, paymentMethods });
});

// GET /v1/storefront/:subdomain/products
router.get('/:subdomain/products', publicRateLimit, async (req, res) => {
  const shop = await prisma.shop.findFirst({
    where: { subdomain: req.params.subdomain, status: 'published' },
  });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const { category, search, sort, cursor, limit: limitRaw } = req.query;
  const limit = Math.min(Number(limitRaw) || 20, 100);

  type ProductWhere = Parameters<typeof prisma.product.findMany>[0]['where'];
  const where: ProductWhere = { shopId: shop.id, status: 'active' };

  if (category) {
    const cat = await prisma.shopCategory.findFirst({
      where: { shopId: shop.id, slug: String(category) },
    });
    where.categoryId = cat?.id ?? '__none__';
  }

  if (search) {
    where.OR = [
      { name: { contains: String(search), mode: 'insensitive' } },
      { description: { contains: String(search), mode: 'insensitive' } },
      { tags: { has: String(search) } },
    ];
  }

  if (cursor) where.id = { lt: String(cursor) };

  type OrderBy = Parameters<typeof prisma.product.findMany>[0]['orderBy'];
  const orderBy: OrderBy =
    sort === 'price_asc'  ? { basePrice: 'asc' } :
    sort === 'price_desc' ? { basePrice: 'desc' } :
                            { createdAt: 'desc' };

  const rawProducts = await prisma.product.findMany({
    where,
    orderBy,
    take: limit + 1,
    include: {
      images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      category: { select: { id: true, name: true, slug: true } },
      _count: { select: { variants: true } },
      variants: { select: { stock: true } },
    },
  });

  const hasMore = rawProducts.length > limit;
  const rawItems = hasMore ? rawProducts.slice(0, limit) : rawProducts;

  // Use sum of variant stocks when variants exist; fall back to product-level stock otherwise
  const items = rawItems.map(({ variants, ...p }) => ({
    ...p,
    stock: variants.length > 0 ? variants.reduce((sum, v) => sum + v.stock, 0) : p.stock,
  }));

  return ok(res, { products: items, nextCursor: hasMore ? rawItems.at(-1)?.id ?? null : null });
});

// GET /v1/storefront/:subdomain/products/:slug
router.get('/:subdomain/products/:slug', publicRateLimit, async (req, res) => {
  const shop = await prisma.shop.findFirst({
    where: { subdomain: req.params.subdomain, status: 'published' },
  });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const product = await prisma.product.findFirst({
    where: { shopId: shop.id, slug: req.params.slug, status: 'active' },
    include: {
      images: { orderBy: { sortOrder: 'asc' } },
      variants: { orderBy: { createdAt: 'asc' } },
      category: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!product) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'Product not found');
  return ok(res, { product });
});

export default router;
