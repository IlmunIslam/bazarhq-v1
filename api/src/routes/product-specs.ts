import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { validate } from '../middleware/validate';
import { ok, fail } from '../utils/response';
import { prisma } from '../lib/prisma';

// Sprint C2 — per-product spec values against the C1-authored templates.
//
// This router carries NO auth of its own: it is mounted inside routes/products.ts
// after `router.use(requireMerchant)`, so every handler already has a verified
// merchant on req.userId. Spec values are MERCHANT-owned data (a merchant
// describes their own products), unlike the templates themselves, which are
// platform vocabulary and stay admin-only.
//
// Deliberately three dedicated endpoints rather than extending PATCH/GET
// /v1/products/:id as the design doc originally sketched: assigning a global
// category has a side effect — it clears the product's specs — and a side effect
// that destructive does not belong hidden inside a generic product update.

const router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const PutSpecsSchema = z
  .object({
    specs: z
      .array(
        z
          .object({
            specFieldId: z.string().uuid(),
            // null / "" means "no value" — the row is deleted rather than stored
            // blank, so "unset" has exactly one representation in the database.
            value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
          })
          .strict()
      )
      .max(100),
  })
  .strict();

const GlobalCategorySchema = z
  .object({
    globalCategoryId: z.string().uuid().nullable(),
    clearSpecs: z.boolean().optional(),
  })
  .strict();

// ─── Ownership ───────────────────────────────────────────────────────────────

interface OwnedProduct {
  id: string;
  globalCategoryId: string | null;
}

/**
 * Resolves :id to a product the authenticated merchant actually owns.
 *
 * Matches the pattern used throughout products.ts: derive the shop from the
 * authenticated user rather than trusting req.shopId from the JWT, then scope
 * the product lookup by that shop. Another merchant's product id yields 404
 * rather than 403 — consistent with the sibling routes, and it does not leak
 * whether the id exists.
 */
async function findOwnedProduct(
  req: Request
): Promise<{ product: OwnedProduct } | { code: string; message: string }> {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return { code: 'SHOP_NOT_FOUND', message: 'Shop not found' };

  const product = await prisma.product.findFirst({
    where: { id: req.params.id, shopId: shop.id },
    select: { id: true, globalCategoryId: true },
  });
  if (!product) return { code: 'PRODUCT_NOT_FOUND', message: 'Product not found' };

  return { product };
}

// ─── Reading the template + values ───────────────────────────────────────────

type SpecValue = string | boolean;

/**
 * A stored row carries its value in exactly one typed column. Numbers come back
 * as strings, the way money already does elsewhere in this API: value_number is
 * numeric(14,4), and routing it through a JS float would be a silent precision
 * trap. Prisma's Decimal.toString() drops the scale padding, so 8.0000 reads
 * back as "8".
 */
function serialiseValue(row: {
  valueText: string | null;
  valueNumber: Prisma.Decimal | null;
  valueBool: boolean | null;
}): SpecValue | null {
  if (row.valueNumber !== null) return row.valueNumber.toString();
  if (row.valueBool !== null) return row.valueBool;
  return row.valueText;
}

/**
 * The merchant-form payload: the category's active template, the product's
 * current values keyed by field id, and which required fields are still empty.
 *
 * `missingRequired` is reported, never enforced — blocking a save on it would
 * strand merchants whose products predate the template.
 */
async function loadSpecState(product: OwnedProduct) {
  if (!product.globalCategoryId) {
    return { globalCategory: null, specFields: [], values: {}, missingRequired: [] };
  }

  const [category, specFields] = await Promise.all([
    prisma.category.findUnique({
      where: { id: product.globalCategoryId },
      select: {
        id: true,
        slug: true,
        name: true,
        // Surfaced so the form can tell a merchant their category was retired by
        // the platform after they picked it. The assignment still stands.
        isActive: true,
        parent: { select: { id: true, slug: true, name: true } },
      },
    }),
    prisma.specField.findMany({
      where: { categoryId: product.globalCategoryId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: {
        id: true,
        key: true,
        label: true,
        unit: true,
        dataType: true,
        options: true,
        sortOrder: true,
        isComparable: true,
        isRequired: true,
      },
    }),
  ]);

  const rows = specFields.length
    ? await prisma.productSpec.findMany({
        where: { productId: product.id, specFieldId: { in: specFields.map(f => f.id) } },
        select: { specFieldId: true, valueText: true, valueNumber: true, valueBool: true },
      })
    : [];

  const values: Record<string, SpecValue> = {};
  for (const row of rows) {
    const value = serialiseValue(row);
    if (value !== null) values[row.specFieldId] = value;
  }

  return {
    globalCategory: category,
    specFields,
    values,
    missingRequired: specFields.filter(f => f.isRequired && values[f.id] === undefined).map(f => f.id),
  };
}

// ─── Value coercion ──────────────────────────────────────────────────────────

interface TypedColumns {
  valueText: string | null;
  valueNumber: Prisma.Decimal | null;
  valueBool: boolean | null;
}

interface CoercionField {
  label: string;
  dataType: 'text' | 'number' | 'boolean' | 'enum';
  options: string[];
}

type Coerced = { clear: true } | { data: TypedColumns } | { error: string };

// numeric(14,4) leaves ten digits ahead of the decimal point.
const MAX_NUMERIC = 1e10;

/**
 * Checks a submitted value against its field's declared type and routes it into
 * the matching typed column, leaving the other two null. Booleans must arrive as
 * real JSON booleans — accepting "true" as a string invites a whole class of
 * quiet mis-stores for no real benefit.
 */
function coerce(field: CoercionField, value: unknown): Coerced {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return { clear: true };
  }

  switch (field.dataType) {
    case 'text': {
      if (typeof value !== 'string') return { error: `"${field.label}" expects text` };
      const text = value.trim();
      if (text.length > 500) return { error: `"${field.label}" is limited to 500 characters` };
      return { data: { valueText: text, valueNumber: null, valueBool: null } };
    }

    case 'number': {
      const n =
        typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
      if (!Number.isFinite(n)) return { error: `"${field.label}" expects a number` };
      if (Math.abs(n) >= MAX_NUMERIC) return { error: `"${field.label}" is out of range` };
      return { data: { valueText: null, valueNumber: new Prisma.Decimal(n), valueBool: null } };
    }

    case 'boolean': {
      if (typeof value !== 'boolean') return { error: `"${field.label}" expects true or false` };
      return { data: { valueText: null, valueNumber: null, valueBool: value } };
    }

    case 'enum': {
      if (typeof value !== 'string') {
        return { error: `"${field.label}" expects one of its listed options` };
      }
      const choice = value.trim();
      if (!field.options.includes(choice)) {
        return {
          error: `"${choice}" is not an option for "${field.label}" (expected one of: ${field.options.join(', ')})`,
        };
      }
      return { data: { valueText: choice, valueNumber: null, valueBool: null } };
    }
  }
}

function notFound(res: Response, owner: { code: string; message: string }) {
  return fail(res, 404, owner.code, owner.message);
}

// ─── GET /v1/products/:id/specs ──────────────────────────────────────────────
//
// Template and values aligned, for the C3 merchant form. A product with no
// marketplace category returns an empty template rather than an error — that is
// the normal state, not a failure.
router.get('/:id/specs', async (req, res) => {
  const owned = await findOwnedProduct(req);
  if (!('product' in owned)) return notFound(res, owned);

  return ok(res, await loadSpecState(owned.product));
});

// ─── PUT /v1/products/:id/specs ──────────────────────────────────────────────
//
// Bulk replace, mirroring POST /:id/variants. Idempotent via the
// @@unique([productId, specFieldId]) upsert.
//
// "Replace" is scoped to the ACTIVE fields of the product's current category:
// those are upserted, and any the payload omits are cleared. Rows held against
// retired fields are deliberately left alone — C1 promises that retiring a field
// preserves the values already entered against it, and a naive
// delete-everything-then-insert would quietly break that promise.
router.put('/:id/specs', validate(PutSpecsSchema), async (req, res) => {
  const owned = await findOwnedProduct(req);
  if (!('product' in owned)) return notFound(res, owned);
  const { product } = owned;

  if (!product.globalCategoryId) {
    return fail(
      res,
      409,
      'NO_GLOBAL_CATEGORY',
      'Assign a marketplace category to this product before saving specifications'
    );
  }

  const fields = await prisma.specField.findMany({
    where: { categoryId: product.globalCategoryId, isActive: true },
    select: { id: true, label: true, dataType: true, options: true },
  });
  const byId = new Map(fields.map(f => [f.id, f]));

  const specs = req.body.specs as { specFieldId: string; value: unknown }[];

  // Everything is validated before anything is written, so a bad entry can never
  // leave the product half-saved.
  const seen = new Set<string>();
  const upserts: { specFieldId: string; data: TypedColumns }[] = [];
  const explicitClears: string[] = [];

  for (const { specFieldId, value } of specs) {
    if (seen.has(specFieldId)) {
      return fail(res, 422, 'DUPLICATE_FIELD', 'The same spec field was submitted more than once');
    }
    seen.add(specFieldId);

    const field = byId.get(specFieldId);
    if (!field) {
      // The guard that stops spec data drifting across categories. Retired
      // fields land here too: their stored values survive, but no new ones.
      return fail(
        res,
        422,
        'FIELD_NOT_IN_CATEGORY',
        `Spec field ${specFieldId} is not an active field of this product's marketplace category`
      );
    }

    const result = coerce(field, value);
    if ('error' in result) return fail(res, 422, 'INVALID_SPEC_VALUE', result.error);
    if ('clear' in result) explicitClears.push(specFieldId);
    else upserts.push({ specFieldId, data: result.data });
  }

  const toDelete = [...explicitClears, ...fields.filter(f => !seen.has(f.id)).map(f => f.id)];

  await prisma.$transaction([
    ...(toDelete.length
      ? [
          prisma.productSpec.deleteMany({
            where: { productId: product.id, specFieldId: { in: toDelete } },
          }),
        ]
      : []),
    ...upserts.map(u =>
      prisma.productSpec.upsert({
        where: { productId_specFieldId: { productId: product.id, specFieldId: u.specFieldId } },
        create: { productId: product.id, specFieldId: u.specFieldId, ...u.data },
        update: u.data,
      })
    ),
  ]);

  return ok(res, await loadSpecState(product));
});

// ─── PUT /v1/products/:id/global-category ────────────────────────────────────
//
// Changing the category invalidates every spec, because the values belong to the
// OLD category's fields. Rather than trusting the UI to remember the warning,
// the API refuses with 409 SPECS_EXIST until the caller explicitly confirms —
// silent data loss here would be the worst bug in the feature. The clear and the
// reassignment then happen in one transaction, so a product can never end up in
// the new category still holding the old one's values.
router.put('/:id/global-category', validate(GlobalCategorySchema), async (req, res) => {
  const owned = await findOwnedProduct(req);
  if (!('product' in owned)) return notFound(res, owned);
  const { product } = owned;

  const { globalCategoryId, clearSpecs } = req.body as {
    globalCategoryId: string | null;
    clearSpecs?: boolean;
  };

  if (globalCategoryId) {
    const category = await prisma.category.findUnique({
      where: { id: globalCategoryId },
      select: { id: true, name: true, isActive: true, _count: { select: { children: true } } },
    });
    if (!category) return fail(res, 422, 'CATEGORY_NOT_FOUND', 'Marketplace category not found');
    if (!category.isActive) {
      return fail(
        res,
        422,
        'CATEGORY_RETIRED',
        'That marketplace category has been retired and can no longer be assigned'
      );
    }
    if (category._count.children > 0) {
      return fail(
        res,
        422,
        'NOT_A_LEAF',
        `"${category.name}" has sub-categories. Products are tagged to the sub-category that carries the spec template.`
      );
    }
  }

  const current = product.globalCategoryId ?? null;
  const next = globalCategoryId ?? null;

  if (current === next) {
    return ok(res, { ...(await loadSpecState(product)), changed: false, clearedSpecs: 0 });
  }

  const specCount = await prisma.productSpec.count({ where: { productId: product.id } });

  if (specCount > 0 && !clearSpecs) {
    return fail(
      res,
      409,
      'SPECS_EXIST',
      `This product has ${specCount} saved specification${specCount === 1 ? '' : 's'} belonging to its current category. Changing the category clears them. Re-send with "clearSpecs": true to confirm.`
    );
  }

  await prisma.$transaction([
    ...(specCount > 0 ? [prisma.productSpec.deleteMany({ where: { productId: product.id } })] : []),
    prisma.product.update({ where: { id: product.id }, data: { globalCategoryId: next } }),
  ]);

  const updated: OwnedProduct = { id: product.id, globalCategoryId: next };
  return ok(res, { ...(await loadSpecState(updated)), changed: true, clearedSpecs: specCount });
});

export default router;
