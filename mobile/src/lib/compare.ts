import AsyncStorage from '@react-native-async-storage/async-storage';

// Ported from frontend/lib/compare.ts. Same CompareItem shape and same storage
// key (`compare`), so the two platforms describe a shortlist identically — and
// C5's compare endpoint takes the same product ids from either.
//
// Two deliberate differences from the cart in this folder:
//   • NOT keyed by subdomain. A cart belongs to one shop; a comparison is
//     cross-shop by definition, which is the whole point of the marketplace.
//   • Capped at THREE, not the web's four. A phone cannot show four readable
//     columns side by side; web/lib/compare.ts owns its own limit.
//
// The cap is enforced HERE rather than in the components, so the toggle, the
// tray and the compare screen cannot disagree about what the limit is.
//
// As with the cart, the only structural difference from web is async:
// localStorage is synchronous, AsyncStorage returns Promises.

export interface CompareItem {
  id: string;
  name: string;
  slug: string;
  basePrice: string;
  compareAtPrice: string | null;
  image: string | null;
  shop: { name: string; subdomain: string };
}

export const COMPARE_LIMIT = 3;

const KEY = 'compare';

export async function getCompare(): Promise<CompareItem[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = JSON.parse(raw ?? '[]') as CompareItem[];
    // Guard against a half-written or hand-edited value: anything without an id
    // would break keying and rendering downstream.
    return Array.isArray(parsed) ? parsed.filter(i => i && typeof i.id === 'string') : [];
  } catch {
    return [];
  }
}

async function save(items: CompareItem[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

export interface AddResult {
  items: CompareItem[];
  added: boolean;
  /** Set only when the add was refused, so callers can explain rather than fail silently. */
  reason?: string;
}

export async function addToCompare(item: CompareItem): Promise<AddResult> {
  const items = await getCompare();

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
  await save(next);
  return { items: next, added: true };
}

export async function removeFromCompare(id: string): Promise<CompareItem[]> {
  const next = (await getCompare()).filter(i => i.id !== id);
  await save(next);
  return next;
}

export async function clearCompare(): Promise<CompareItem[]> {
  await save([]);
  return [];
}
