import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireMerchant } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { ok, created, fail } from '../utils/response';
import { prisma } from '../lib/prisma';
import { uploadStream, deleteImage } from '../services/cloudinary';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireMerchant);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function uniqueSlug(shopId: string, base: string, excludeId?: string): Promise<string> {
  let slug = slugify(base);
  let n = 0;
  while (true) {
    const candidate = n === 0 ? slug : `${slug}-${n}`;
    const existing = await prisma.product.findUnique({ where: { shopId_slug: { shopId, slug: candidate } } });
    if (!existing || existing.id === excludeId) return candidate;
    n++;
  }
}

// ─── Categories ───────────────────────────────────────────────────────────────

const CategorySchema = z.object({
  name: z.string().min(1).max(50),
  sortOrder: z.number().int().min(0).optional(),
});

// GET /v1/products/categories
router.get('/categories', async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const categories = await prisma.shopCategory.findMany({
    where: { shopId: shop.id },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { products: true } } },
  });
  return ok(res, { categories });
});

// POST /v1/products/categories
router.post('/categories', validate(CategorySchema), async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const { name, sortOrder } = req.body;
  const slug = slugify(name);

  const existing = await prisma.shopCategory.findUnique({ where: { shopId_slug: { shopId: shop.id, slug } } });
  if (existing) return fail(res, 409, 'CATEGORY_EXISTS', 'A category with this name already exists');

  const category = await prisma.shopCategory.create({
    data: { shopId: shop.id, name, slug, sortOrder: sortOrder ?? 0 },
  });
  return created(res, { category });
});

// PATCH /v1/products/categories/:categoryId
router.patch('/categories/:categoryId', validate(CategorySchema.partial()), async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const category = await prisma.shopCategory.findFirst({
    where: { id: req.params.categoryId, shopId: shop.id },
  });
  if (!category) return fail(res, 404, 'CATEGORY_NOT_FOUND', 'Category not found');

  const data: Record<string, unknown> = { ...req.body };
  if (req.body.name) data.slug = slugify(req.body.name);

  const updated = await prisma.shopCategory.update({ where: { id: category.id }, data });
  return ok(res, { category: updated });
});

// DELETE /v1/products/categories/:categoryId
router.delete('/categories/:categoryId', async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const category = await prisma.shopCategory.findFirst({
    where: { id: req.params.categoryId, shopId: shop.id },
  });
  if (!category) return fail(res, 404, 'CATEGORY_NOT_FOUND', 'Category not found');

  // Unlink products from this category before deleting
  await prisma.product.updateMany({ where: { categoryId: category.id }, data: { categoryId: null } });
  await prisma.shopCategory.delete({ where: { id: category.id } });
  return ok(res, { deleted: true });
});

// ─── Products ─────────────────────────────────────────────────────────────────

const CreateProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  basePrice: z.number().positive(),
  compareAtPrice: z.number().positive().optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(['draft', 'active']).default('draft'),
  tags: z.array(z.string().max(50)).max(20).default([]),
});

const UpdateProductSchema = CreateProductSchema.partial();

const VariantsSchema = z.object({
  variants: z.array(z.object({
    name: z.string().min(1).max(100),
    sku: z.string().max(100).optional(),
    price: z.number().positive(),
    stock: z.number().int().min(0),
  })).min(1).max(50),
});

// GET /v1/products
router.get('/', async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const { status, category, search, cursor, limit: limitRaw } = req.query;
  const limit = Math.min(Number(limitRaw) || 20, 100);

  const where: Parameters<typeof prisma.product.findMany>[0]['where'] = { shopId: shop.id };
  if (status) where.status = status as 'draft' | 'active' | 'archived';
  if (category) where.categoryId = String(category);
  if (search) where.name = { contains: String(search), mode: 'insensitive' };
  if (cursor) where.id = { lt: String(cursor) };

  const products = await prisma.product.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    include: {
      images: { where: { sortOrder: 0 }, take: 1 },
      category: { select: { id: true, name: true } },
      _count: { select: { variants: true, orderItems: true } },
    },
  });

  const hasMore = products.length > limit;
  const items = hasMore ? products.slice(0, limit) : products;
  return ok(res, { products: items, nextCursor: hasMore ? items[items.length - 1].id : null });
});

// POST /v1/products
router.post('/', validate(CreateProductSchema), async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const { name, description, basePrice, compareAtPrice, categoryId, status, tags } = req.body;

  if (categoryId) {
    const cat = await prisma.shopCategory.findFirst({ where: { id: categoryId, shopId: shop.id } });
    if (!cat) return fail(res, 404, 'CATEGORY_NOT_FOUND', 'Category not found');
  }

  const slug = await uniqueSlug(shop.id, name);
  const product = await prisma.product.create({
    data: { shopId: shop.id, name, slug, description, basePrice, compareAtPrice, categoryId, status, tags },
    include: { images: true, variants: true, category: true },
  });
  return created(res, { product });
});

// GET /v1/products/:id
router.get('/:id', async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const product = await prisma.product.findFirst({
    where: { id: req.params.id, shopId: shop.id },
    include: {
      images: { orderBy: { sortOrder: 'asc' } },
      variants: { orderBy: { createdAt: 'asc' } },
      category: { select: { id: true, name: true } },
    },
  });
  if (!product) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'Product not found');
  return ok(res, { product });
});

// PATCH /v1/products/:id
router.patch('/:id', validate(UpdateProductSchema), async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const product = await prisma.product.findFirst({ where: { id: req.params.id, shopId: shop.id } });
  if (!product) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'Product not found');

  if (req.body.categoryId) {
    const cat = await prisma.shopCategory.findFirst({ where: { id: req.body.categoryId, shopId: shop.id } });
    if (!cat) return fail(res, 404, 'CATEGORY_NOT_FOUND', 'Category not found');
  }

  const data = { ...req.body };
  if (req.body.name) data.slug = await uniqueSlug(shop.id, req.body.name, product.id);

  const updated = await prisma.product.update({
    where: { id: product.id },
    data,
    include: { images: { orderBy: { sortOrder: 'asc' } }, variants: true, category: true },
  });
  return ok(res, { product: updated });
});

// DELETE /v1/products/:id
router.delete('/:id', async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const product = await prisma.product.findFirst({
    where: { id: req.params.id, shopId: shop.id },
    include: { images: true, _count: { select: { orderItems: true } } },
  });
  if (!product) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'Product not found');

  if (product._count.orderItems > 0) {
    return fail(res, 409, 'HAS_ORDER_HISTORY',
      'This product has order history and cannot be deleted. Archive it instead.');
  }

  // Delete Cloudinary images before removing the DB row
  await Promise.all(product.images.map(img => deleteImage(img.cloudinaryId).catch(() => {})));
  await prisma.product.delete({ where: { id: product.id } });
  return ok(res, { deleted: true });
});

// POST /v1/products/:id/images
router.post('/:id/images', upload.single('image'), async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const product = await prisma.product.findFirst({
    where: { id: req.params.id, shopId: shop.id },
    include: { _count: { select: { images: true } } },
  });
  if (!product) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'Product not found');
  if (product._count.images >= 6) return fail(res, 422, 'IMAGE_LIMIT', 'Maximum 6 images per product');

  if (!req.file) return fail(res, 422, 'NO_FILE', 'Image file is required');

  const sortOrder = product._count.images;
  const { url, cloudinaryId } = await uploadStream(req.file.buffer, `bazarhq/products/${shop.id}`);
  const image = await prisma.productImage.create({
    data: { productId: product.id, url, cloudinaryId, sortOrder },
  });
  return created(res, { image });
});

// DELETE /v1/products/:id/images/:imageId
router.delete('/:id/images/:imageId', async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const image = await prisma.productImage.findFirst({
    where: { id: req.params.imageId, product: { id: req.params.id, shopId: shop.id } },
  });
  if (!image) return fail(res, 404, 'IMAGE_NOT_FOUND', 'Image not found');

  await deleteImage(image.cloudinaryId).catch(() => {});
  await prisma.productImage.delete({ where: { id: image.id } });
  return ok(res, { deleted: true });
});

// POST /v1/products/:id/variants  (bulk replace)
router.post('/:id/variants', validate(VariantsSchema), async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const product = await prisma.product.findFirst({ where: { id: req.params.id, shopId: shop.id } });
  if (!product) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'Product not found');

  const { variants } = req.body;
  const [, , updatedProduct] = await prisma.$transaction([
    prisma.productVariant.deleteMany({ where: { productId: product.id } }),
    prisma.productVariant.createMany({ data: variants.map((v: typeof variants[0]) => ({ ...v, productId: product.id })) }),
    prisma.product.update({
      where: { id: product.id },
      data: { hasVariants: true },
      include: { variants: { orderBy: { createdAt: 'asc' } } },
    }),
  ]);
  return ok(res, { product: updatedProduct });
});

// POST /v1/products/:id/duplicate
router.post('/:id/duplicate', async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const source = await prisma.product.findFirst({
    where: { id: req.params.id, shopId: shop.id },
    include: { variants: true },
  });
  if (!source) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'Product not found');

  const slug = await uniqueSlug(shop.id, `${source.name} copy`);
  const copy = await prisma.product.create({
    data: {
      shopId: shop.id,
      categoryId: source.categoryId,
      name: `${source.name} (Copy)`,
      slug,
      description: source.description,
      basePrice: source.basePrice,
      compareAtPrice: source.compareAtPrice,
      tags: source.tags,
      status: 'draft',
      hasVariants: source.hasVariants,
      stock: source.stock,
      variants: {
        create: source.variants.map(v => ({
          name: v.name, sku: v.sku, price: v.price, stock: v.stock,
        })),
      },
    },
    include: { variants: true, images: true },
  });
  return created(res, { product: copy });
});

export default router;
