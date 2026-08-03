import type { CompareProduct, CompareSpecRow } from './api';

// Pure presentation rules for the comparison view, kept out of the component so
// they can be exercised directly — and so the mobile view can mirror them
// exactly rather than reinventing the em-dash and differences-only semantics.

/** A missing value renders as an em dash — blank reads as broken. */
export const NONE = '—';

export function displaySpec(product: CompareProduct, row: CompareSpecRow): string {
  const value = product.specs[row.specFieldId];
  if (value === undefined) return NONE;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === '') return NONE;
  return row.unit ? `${value} ${row.unit}` : String(value);
}

export function discountOf(product: CompareProduct): string {
  const price = Number(product.basePrice);
  const was = product.compareAtPrice ? Number(product.compareAtPrice) : null;
  if (!was || !Number.isFinite(was) || was <= price) return NONE;
  return `−${Math.round((1 - price / was) * 100)}%`;
}

/**
 * Whether a row is worth showing under "differences only".
 *
 * A row counts as identical only when every column shows the same text — and the
 * em dash counts as a value. So [8 GB, —, 8 GB] IS a difference, because "one of
 * these has no data" is exactly what a shopper wants to see. Comparing the
 * rendered strings also means 8 and "8" can never read as different.
 */
export function rowVaries(products: CompareProduct[], row: CompareSpecRow): boolean {
  return new Set(products.map(p => displaySpec(p, row))).size > 1;
}

export interface RowGroup {
  categoryId: string | null;
  rows: CompareSpecRow[];
}

/**
 * Splits the ordered rows into per-category runs for the mixed-mode subheadings.
 *
 * The server already groups rows by category, so a run-length pass is enough —
 * and if that ever stopped holding, this would surface it as repeated headings
 * rather than silently mislabelling rows.
 */
export function groupRows(rows: CompareSpecRow[]): RowGroup[] {
  const groups: RowGroup[] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last && last.categoryId === row.categoryId) last.rows.push(row);
    else groups.push({ categoryId: row.categoryId, rows: [row] });
  }
  return groups;
}

export type CompareMode = 'empty' | 'uncategorised' | 'aligned' | 'mixed';

/**
 * The render mode, derived from what the server reported. `sharedCategoryId` is
 * the authority — this never re-derives the alignment rule from the products.
 */
export function compareMode(
  productCount: number,
  categoryCount: number,
  sharedCategoryId: string | null,
): CompareMode {
  if (productCount === 0) return 'empty';
  if (categoryCount === 0) return 'uncategorised';
  return sharedCategoryId ? 'aligned' : 'mixed';
}
