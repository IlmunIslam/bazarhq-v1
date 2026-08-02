import { Router } from 'express';
import { publicRateLimit } from '../middleware/rate-limiter';
import { ok, fail } from '../utils/response';
import { prisma } from '../lib/prisma';

// Sprint C0 — read-only access to the global marketplace taxonomy and its
// per-category spec templates.
//
// Public (no auth) and behind publicRateLimit, because three different callers
// need exactly this data and none of it is sensitive:
//   • the merchant product form  (merchant JWT)  — to pick a category + render fields
//   • the marketplace / compare  (anonymous)     — to label and align spec rows
//   • the mobile app             (both of these)
//
// Admin CRUD over the same tables arrives in C1 under /v1/admin/categories.
// Nothing here mutates anything.

const router = Router();

// Inactive rows stay in the database (soft delete) but never reach a public
// response — an admin retiring a category or field hides it everywhere at once.
const ACTIVE_FIELD_SELECT = {
  id: true,
  key: true,
  label: true,
  unit: true,
  dataType: true,
  options: true,
  sortOrder: true,
  isComparable: true,
  isRequired: true,
} as const;

// ─── GET /v1/categories ──────────────────────────────────────────────────────
//
// The active taxonomy as a two-level tree. `?flat=1` returns a flat list
// instead, which is what a mobile picker and the compare view want.
router.get('/', publicRateLimit, async (req, res) => {
  const rows = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      slug: true,
      name: true,
      parentId: true,
      sortOrder: true,
      _count: { select: { specFields: { where: { isActive: true } } } },
    },
  });

  const categories = rows.map(({ _count, ...c }) => ({
    ...c,
    specFieldCount: _count.specFields,
  }));

  if (req.query.flat) return ok(res, { categories });

  // Build the tree in memory rather than with a recursive query: the taxonomy is
  // a curated list of tens of rows, not thousands, and this keeps it to one
  // round trip. A child whose parent is inactive is dropped rather than
  // promoted to the top level — hiding a parent hides its branch.
  const byId = new Map(categories.map(c => [c.id, { ...c, children: [] as typeof categories }]));
  const tree: (typeof categories[number] & { children: typeof categories })[] = [];

  for (const node of byId.values()) {
    if (node.parentId) byId.get(node.parentId)?.children.push(node);
    else tree.push(node);
  }

  return ok(res, { categories: tree });
});

// ─── GET /v1/categories/:idOrSlug/spec-fields ────────────────────────────────
//
// The spec template driving the merchant form and the comparison rows. Accepts
// either a uuid or a slug so callers can deep-link by slug without a lookup.
//
// An empty `specFields` array is a NORMAL result, not an error: a category with
// no template yet is the default state until C1 authoring happens, and clients
// render an empty state rather than a failure.
router.get('/:idOrSlug/spec-fields', publicRateLimit, async (req, res) => {
  const { idOrSlug } = req.params;

  const category = await prisma.category.findFirst({
    where: { isActive: true, OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: {
      id: true,
      slug: true,
      name: true,
      parentId: true,
      specFields: {
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        select: ACTIVE_FIELD_SELECT,
      },
    },
  });

  if (!category) return fail(res, 404, 'CATEGORY_NOT_FOUND', 'Category not found');

  const { specFields, ...rest } = category;
  return ok(res, { category: rest, specFields });
});

export default router;
