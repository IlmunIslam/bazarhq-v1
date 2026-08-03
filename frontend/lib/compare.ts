// Comparison selection — the customer's shortlist of products to compare.
//
// Deliberately mirrors lib/cart.ts: a plain module over localStorage, with the
// same SSR guard, so there is one storage idiom in this codebase rather than
// two. The differences from the cart are both intentional:
//
//   • NOT keyed by subdomain. A cart belongs to one shop; a comparison is
//     cross-shop by definition — that is the whole point of the marketplace.
//   • Capped. Four columns is what a comparison table can show before it stops
//     being readable (mobile uses three; see mobile/src/lib/compare.ts).
//
// The cap is enforced HERE rather than in the components, so the toggle, the
// tray and any future entry point cannot disagree about what the limit is.

export interface CompareItem {
  id: string;
  name: string;
  slug: string;
  basePrice: string;
  compareAtPrice: string | null;
  image: string | null;
  shop: { name: string; subdomain: string };
}

export const COMPARE_LIMIT = 4;

const KEY = 'compare';

export function getCompare(): CompareItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as CompareItem[];
    // Guard against a hand-edited or half-written value: anything without an id
    // would break keying and rendering downstream.
    return Array.isArray(parsed) ? parsed.filter(i => i && typeof i.id === 'string') : [];
  } catch {
    return [];
  }
}

function save(items: CompareItem[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(items));
}

export interface AddResult {
  items: CompareItem[];
  added: boolean;
  /** Set only when the add was refused, so callers can explain rather than fail silently. */
  reason?: string;
}

export function addToCompare(item: CompareItem): AddResult {
  const items = getCompare();

  // Idempotent: adding something already selected is a no-op, not a duplicate.
  if (items.some(i => i.id === item.id)) return { items, added: false };

  if (items.length >= COMPARE_LIMIT) {
    return {
      items,
      added: false,
      reason: `You can compare up to ${COMPARE_LIMIT} products. Remove one to add another.`,
    };
  }

  const next = [...items, item];
  save(next);
  return { items: next, added: true };
}

export function removeFromCompare(id: string): CompareItem[] {
  const next = getCompare().filter(i => i.id !== id);
  save(next);
  return next;
}

export function clearCompare(): CompareItem[] {
  save([]);
  return [];
}

/**
 * Drops anything not in `ids`, in one write.
 *
 * Used after the compare endpoint reports which selections it could not serve —
 * a product that was unpublished or deleted since it was picked would otherwise
 * sit in the tray forever, since the tray is client-side storage with no idea
 * the catalogue moved on.
 */
export function keepOnlyInCompare(ids: string[]): CompareItem[] {
  const keep = new Set(ids);
  const next = getCompare().filter(i => keep.has(i.id));
  save(next);
  return next;
}
