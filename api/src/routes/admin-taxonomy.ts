import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { validate } from '../middleware/validate';
import { ok, created, fail } from '../utils/response';
import { writeAuditLog } from '../services/audit';
import { prisma } from '../lib/prisma';

// Sprint C1 — superadmin authoring for the global taxonomy created in C0.
//
// This router carries NO auth of its own: it is mounted inside routes/admin.ts
// after `router.use(requireAdmin)`, so every handler here already has a verified
// admin session on req.adminId. Mounting it separately in index.ts would run
// requireAdmin twice per request (two session lookups, two Redis touches).
//
// The taxonomy is platform vocabulary, not merchant configuration — spec
// templates decide what makes products comparable across shops, so alignment
// collapses if merchants can edit them. Hence admin-only, and hence every
// mutation is audit-logged the way merchant suspension already is.
//
// Nothing here deletes. Retiring sets isActive=false so that products tagged to
// a category, and any spec values entered against a field, survive untouched and
// the decision stays reversible.

const router = Router();

// ─── Shared rules ────────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const KEY_RE = /^[a-z][a-z0-9_]*$/;

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .max(60)
  .regex(SLUG_RE, 'Use lowercase letters, numbers and single hyphens (e.g. "mobile-phones")');

const CategoryCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: slugField,
    parentId: z.string().uuid().nullable().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .strict();

const CategoryPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    slug: slugField.optional(),
    parentId: z.string().uuid().nullable().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(body => Object.keys(body).length > 0, { message: 'No fields to update' });

const SpecFieldCreateSchema = z
  .object({
    key: z
      .string()
      .trim()
      .toLowerCase()
      .max(40)
      .regex(KEY_RE, 'Use lowercase letters, numbers and underscores, starting with a letter (e.g. "ram_gb")'),
    label: z.string().trim().min(1).max(80),
    unit: z.string().trim().max(20).nullable().optional(),
    dataType: z.enum(['text', 'number', 'boolean', 'enum']),
    // Blanks are dropped by normaliseOptions rather than rejected here: a
    // trailing empty line in the admin textarea is not a validation failure, and
    // an all-blank list still lands on the specific OPTIONS_REQUIRED error.
    options: z.array(z.string().trim().max(60)).max(30).optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    isComparable: z.boolean().optional(),
    isRequired: z.boolean().optional(),
  })
  .strict();

// `key` is deliberately absent: it is the stable machine identifier the C2 bulk
// spec upsert keys off, and it is permanently immutable once created. A request
// that tries to change it is rejected before validation (see rejectKeyChange).
const SpecFieldPatchSchema = z
  .object({
    label: z.string().trim().min(1).max(80).optional(),
    unit: z.string().trim().max(20).nullable().optional(),
    dataType: z.enum(['text', 'number', 'boolean', 'enum']).optional(),
    // Blanks are dropped by normaliseOptions rather than rejected here: a
    // trailing empty line in the admin textarea is not a validation failure, and
    // an all-blank list still lands on the specific OPTIONS_REQUIRED error.
    options: z.array(z.string().trim().max(60)).max(30).optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    isComparable: z.boolean().optional(),
    isRequired: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(body => Object.keys(body).length > 0, { message: 'No fields to update' });

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function audit(
  req: Request,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: Prisma.InputJsonValue
): Promise<void> {
  const admin = await prisma.adminAccount.findUnique({
    where: { id: req.adminId },
    select: { email: true },
  });
  await writeAuditLog({
    actorId: req.adminId!,
    actorEmail: admin?.email ?? 'unknown',
    action,
    targetType,
    targetId,
    ...(metadata !== undefined ? { metadata } : {}),
    ipAddress: req.ip,
  });
}

// Toggling isActive is the interesting event in an audit trail, so it gets its
// own action name rather than hiding inside a generic *_UPDATED entry.
function mutationAction(prefix: string, wasActive: boolean, isActive?: boolean): string {
  if (isActive !== undefined && isActive !== wasActive) {
    return isActive ? `${prefix}_RESTORED` : `${prefix}_RETIRED`;
  }
  return `${prefix}_UPDATED`;
}

function normaliseOptions(raw: string[]): string[] {
  return [...new Set(raw.map(o => o.trim()).filter(Boolean))];
}

/**
 * enum is the only data type that carries options, and it cannot carry none.
 *
 * Returns an error tuple, or the options to persist. Switching an existing enum
 * field to another type clears its now-meaningless options automatically, but
 * sending options *explicitly* alongside a non-enum type is a client bug and is
 * rejected rather than silently dropped.
 */
function resolveOptions(
  dataType: 'text' | 'number' | 'boolean' | 'enum',
  provided: string[] | undefined,
  stored: string[]
): { error: [string, string] } | { options: string[] } {
  const options = provided !== undefined ? normaliseOptions(provided) : stored;

  if (dataType === 'enum') {
    if (options.length === 0) {
      return { error: ['OPTIONS_REQUIRED', 'A field of type "enum" needs at least one option'] };
    }
    return { options };
  }

  if (provided !== undefined && normaliseOptions(provided).length > 0) {
    return { error: ['OPTIONS_NOT_ALLOWED', `Options only apply to "enum" fields, not "${dataType}"`] };
  }
  return { options: [] };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

// ─── GET /v1/admin/categories ────────────────────────────────────────────────
//
// The whole taxonomy including retired rows — the admin view, unlike the public
// GET /v1/categories which only ever exposes active ones. Counts drive the
// retire confirmation (how much is affected) and the leaf/parent rules below.
router.get('/categories', async (_req, res) => {
  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      slug: true,
      name: true,
      parentId: true,
      sortOrder: true,
      isActive: true,
      createdAt: true,
      _count: { select: { specFields: true, products: true, children: true } },
    },
  });

  const categories = rows.map(({ _count, ...c }) => ({
    ...c,
    specFieldCount: _count.specFields,
    productCount: _count.products,
    childCount: _count.children,
  }));

  const byId = new Map(categories.map(c => [c.id, { ...c, children: [] as typeof categories }]));
  const tree: (typeof categories[number] & { children: typeof categories })[] = [];

  for (const node of byId.values()) {
    if (node.parentId) byId.get(node.parentId)?.children.push(node);
    else tree.push(node);
  }

  return ok(res, { categories: tree });
});

// ─── POST /v1/admin/categories ───────────────────────────────────────────────

router.post('/categories', validate(CategoryCreateSchema), async (req, res) => {
  const { name, slug, parentId, sortOrder } = req.body;

  if (parentId) {
    const parent = await prisma.category.findUnique({
      where: { id: parentId },
      select: { id: true, parentId: true, _count: { select: { specFields: true } } },
    });
    if (!parent) return fail(res, 422, 'PARENT_NOT_FOUND', 'The selected parent category does not exist');
    if (parent.parentId) {
      return fail(
        res,
        422,
        'MAX_DEPTH_EXCEEDED',
        'The taxonomy is two levels deep. A sub-category cannot have sub-categories of its own.'
      );
    }
    if (parent._count.specFields > 0) {
      return fail(
        res,
        422,
        'HAS_SPEC_FIELDS',
        'Spec templates belong to leaf categories only. Remove this category\'s spec fields before giving it sub-categories.'
      );
    }
  }

  try {
    const category = await prisma.category.create({
      data: { name, slug, parentId: parentId ?? null, sortOrder: sortOrder ?? 0 },
    });

    await audit(req, 'CATEGORY_CREATED', 'Category', category.id, { slug, name });

    return created(res, { category });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail(res, 409, 'SLUG_TAKEN', `The slug "${slug}" is already used by another category`);
    }
    console.error('[admin-taxonomy] category create failed', err);
    return fail(res, 500, 'INTERNAL_ERROR', 'Could not create the category');
  }
});

// ─── PATCH /v1/admin/categories/:id ──────────────────────────────────────────
//
// Also the restore path: isActive=true brings a retired category back with its
// products and spec template exactly as they were.
router.patch('/categories/:id', validate(CategoryPatchSchema), async (req, res) => {
  const { id } = req.params;
  const { name, slug, parentId, sortOrder, isActive } = req.body;

  const existing = await prisma.category.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      isActive: true,
      _count: { select: { children: true, specFields: true } },
    },
  });
  if (!existing) return fail(res, 404, 'NOT_FOUND', 'Category not found');

  // Re-parenting. Two levels are enforced from both ends: the new parent must
  // itself be top-level, and a category that already has children cannot become
  // someone's child.
  if (parentId !== undefined && parentId !== null) {
    if (parentId === id) {
      return fail(res, 422, 'SELF_PARENT', 'A category cannot be its own parent');
    }
    if (existing._count.children > 0) {
      return fail(
        res,
        422,
        'HAS_CHILDREN',
        'This category has sub-categories, so it cannot become a sub-category itself. The taxonomy is two levels deep.'
      );
    }
    const parent = await prisma.category.findUnique({
      where: { id: parentId },
      select: { id: true, parentId: true, _count: { select: { specFields: true } } },
    });
    if (!parent) return fail(res, 422, 'PARENT_NOT_FOUND', 'The selected parent category does not exist');
    if (parent.parentId) {
      return fail(
        res,
        422,
        'MAX_DEPTH_EXCEEDED',
        'The taxonomy is two levels deep. A sub-category cannot have sub-categories of its own.'
      );
    }
    if (parent._count.specFields > 0) {
      return fail(
        res,
        422,
        'HAS_SPEC_FIELDS',
        'Spec templates belong to leaf categories only. Remove that category\'s spec fields before giving it sub-categories.'
      );
    }
  }

  try {
    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(parentId !== undefined ? { parentId } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    });

    await audit(req, mutationAction('CATEGORY', existing.isActive, isActive), 'Category', id, {
      slug: category.slug,
      changed: Object.keys(req.body),
    });

    return ok(res, { category });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail(res, 409, 'SLUG_TAKEN', `The slug "${slug}" is already used by another category`);
    }
    console.error('[admin-taxonomy] category update failed', err);
    return fail(res, 500, 'INTERNAL_ERROR', 'Could not update the category');
  }
});

// ─── DELETE /v1/admin/categories/:id ─────────────────────────────────────────
//
// Soft delete, always — there is no hard delete for a category. Products keep
// their global_category_id and every product_specs row survives; the category
// simply stops appearing in the public taxonomy. PATCH isActive=true undoes it.
router.delete('/categories/:id', async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.category.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      isActive: true,
      _count: { select: { products: true, children: true, specFields: true } },
    },
  });
  if (!existing) return fail(res, 404, 'NOT_FOUND', 'Category not found');

  const counts = {
    productCount: existing._count.products,
    childCount: existing._count.children,
    specFieldCount: existing._count.specFields,
  };

  if (!existing.isActive) {
    return ok(res, { message: 'Category is already retired', ...counts });
  }

  const category = await prisma.category.update({ where: { id }, data: { isActive: false } });

  await audit(req, 'CATEGORY_RETIRED', 'Category', id, { slug: existing.slug, ...counts });

  return ok(res, { category, message: 'Category retired', ...counts });
});

// ─── GET /v1/admin/categories/:id/spec-fields ────────────────────────────────
//
// Includes retired fields, and a valueCount per field — that count is what makes
// dataType immutable below, and the UI shows it as the reason.
router.get('/categories/:id/spec-fields', async (req, res) => {
  const { id } = req.params;

  const category = await prisma.category.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      name: true,
      parentId: true,
      isActive: true,
      parent: { select: { id: true, name: true, slug: true } },
      _count: { select: { children: true, products: true } },
    },
  });
  if (!category) return fail(res, 404, 'NOT_FOUND', 'Category not found');

  const rows = await prisma.specField.findMany({
    where: { categoryId: id },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    include: { _count: { select: { values: true } } },
  });

  const { _count, ...rest } = category;

  return ok(res, {
    category: { ...rest, childCount: _count.children, productCount: _count.products },
    specFields: rows.map(({ _count: c, categoryId: _cid, ...f }) => ({ ...f, valueCount: c.values })),
  });
});

// ─── POST /v1/admin/categories/:id/spec-fields ───────────────────────────────

router.post('/categories/:id/spec-fields', validate(SpecFieldCreateSchema), async (req, res) => {
  const { id } = req.params;
  const { key, label, unit, dataType, options, sortOrder, isComparable, isRequired } = req.body;

  const category = await prisma.category.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { children: true } } },
  });
  if (!category) return fail(res, 404, 'NOT_FOUND', 'Category not found');

  if (category._count.children > 0) {
    return fail(
      res,
      422,
      'NOT_A_LEAF',
      `"${category.name}" has sub-categories. Spec templates belong to leaf categories — add fields to its sub-categories instead.`
    );
  }

  const resolved = resolveOptions(dataType, options, []);
  if ('error' in resolved) return fail(res, 422, resolved.error[0], resolved.error[1]);

  try {
    const specField = await prisma.specField.create({
      data: {
        categoryId: id,
        key,
        label,
        unit: unit ?? null,
        dataType,
        options: resolved.options,
        sortOrder: sortOrder ?? 0,
        ...(isComparable !== undefined ? { isComparable } : {}),
        ...(isRequired !== undefined ? { isRequired } : {}),
      },
    });

    await audit(req, 'SPEC_FIELD_CREATED', 'SpecField', specField.id, {
      categoryId: id,
      key,
      dataType,
    });

    return created(res, { specField: { ...specField, valueCount: 0 } });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail(res, 409, 'KEY_TAKEN', `This category already has a field with the key "${key}"`);
    }
    console.error('[admin-taxonomy] spec field create failed', err);
    return fail(res, 500, 'INTERNAL_ERROR', 'Could not create the spec field');
  }
});

// ─── PATCH /v1/admin/spec-fields/:id ─────────────────────────────────────────

// `key` never changes after creation, so say so explicitly rather than letting
// Zod strip it and silently return a success that did not do what was asked.
function rejectKeyChange(req: Request, res: import('express').Response, next: import('express').NextFunction) {
  if (req.body && typeof req.body === 'object' && 'key' in req.body) {
    return fail(
      res,
      422,
      'KEY_IMMUTABLE',
      'A spec field\'s key cannot be changed after creation. Edit the label instead, or retire this field and add a new one.'
    );
  }
  next();
}

router.patch('/spec-fields/:id', rejectKeyChange, validate(SpecFieldPatchSchema), async (req, res) => {
  const { id } = req.params;
  const { label, unit, dataType, options, sortOrder, isComparable, isRequired, isActive } = req.body;

  const existing = await prisma.specField.findUnique({
    where: { id },
    select: {
      id: true,
      key: true,
      categoryId: true,
      dataType: true,
      options: true,
      isActive: true,
      _count: { select: { values: true } },
    },
  });
  if (!existing) return fail(res, 404, 'NOT_FOUND', 'Spec field not found');

  // Retyping a field that already holds values would strand them: a text value
  // lives in value_text, and a reader of a number field looks at value_number
  // and finds nothing. Refuse rather than silently blank real data.
  if (dataType !== undefined && dataType !== existing.dataType && existing._count.values > 0) {
    return fail(
      res,
      409,
      'HAS_VALUES',
      `${existing._count.values} product${existing._count.values === 1 ? ' has' : 's have'} values for this field, so its data type can no longer be changed. Retire it and add a new field instead.`
    );
  }

  const effectiveType = dataType ?? existing.dataType;
  const resolved = resolveOptions(effectiveType, options, existing.options);
  if ('error' in resolved) return fail(res, 422, resolved.error[0], resolved.error[1]);

  const specField = await prisma.specField.update({
    where: { id },
    data: {
      ...(label !== undefined ? { label } : {}),
      ...(unit !== undefined ? { unit } : {}),
      ...(dataType !== undefined ? { dataType } : {}),
      options: resolved.options,
      ...(sortOrder !== undefined ? { sortOrder } : {}),
      ...(isComparable !== undefined ? { isComparable } : {}),
      ...(isRequired !== undefined ? { isRequired } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
  });

  await audit(req, mutationAction('SPEC_FIELD', existing.isActive, isActive), 'SpecField', id, {
    categoryId: existing.categoryId,
    key: existing.key,
    changed: Object.keys(req.body),
  });

  return ok(res, { specField: { ...specField, valueCount: existing._count.values } });
});

// ─── DELETE /v1/admin/spec-fields/:id ────────────────────────────────────────
//
// Soft delete. Any values already entered against this field stay in
// product_specs — the field just stops being offered or compared.
router.delete('/spec-fields/:id', async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.specField.findUnique({
    where: { id },
    select: {
      id: true,
      key: true,
      categoryId: true,
      isActive: true,
      _count: { select: { values: true } },
    },
  });
  if (!existing) return fail(res, 404, 'NOT_FOUND', 'Spec field not found');

  if (!existing.isActive) {
    return ok(res, { message: 'Spec field is already retired', valueCount: existing._count.values });
  }

  const specField = await prisma.specField.update({ where: { id }, data: { isActive: false } });

  await audit(req, 'SPEC_FIELD_RETIRED', 'SpecField', id, {
    categoryId: existing.categoryId,
    key: existing.key,
    valueCount: existing._count.values,
  });

  return ok(res, {
    specField: { ...specField, valueCount: existing._count.values },
    message: 'Spec field retired',
    valueCount: existing._count.values,
  });
});

export default router;
