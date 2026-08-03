'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  addToCompare,
  clearCompare,
  getCompare,
  keepOnlyInCompare,
  removeFromCompare,
  COMPARE_LIMIT,
  type CompareItem,
} from './compare';

// Shared comparison selection. The cart keeps its state inside StorefrontShell
// because it only ever renders within one shop; the comparison tray has to react
// to toggles across /marketplace and /marketplace/products, so it needs a
// context that outlives any single page.
//
// Mounted at the app root (app/providers.tsx). It is a few items of local state
// and reads storage once, so the cost of it existing on non-customer routes is
// nil — and the tray itself only renders inside the marketplace layout.

interface CompareContextValue {
  items: CompareItem[];
  /** False until localStorage has been read, so the tray never flashes on load. */
  ready: boolean;
  limit: number;
  isFull: boolean;
  isSelected: (id: string) => boolean;
  /** Adds or removes. Returns the refusal reason when the cap blocked an add. */
  toggle: (item: CompareItem) => string | null;
  remove: (id: string) => void;
  clear: () => void;
  /** Drops anything not in `ids` — used to prune selections the server dropped. */
  keepOnly: (ids: string[]) => void;
}

const CompareContext = createContext<CompareContextValue | null>(null);

export function CompareProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CompareItem[]>([]);
  const [ready, setReady] = useState(false);

  // Read after mount, never during render: localStorage does not exist during
  // the server pass, and seeding state from it would be a hydration mismatch.
  useEffect(() => {
    setItems(getCompare());
    setReady(true);
  }, []);

  const isSelected = useCallback((id: string) => items.some(i => i.id === id), [items]);

  const toggle = useCallback(
    (item: CompareItem): string | null => {
      if (items.some(i => i.id === item.id)) {
        setItems(removeFromCompare(item.id));
        return null;
      }
      const result = addToCompare(item);
      setItems(result.items);
      return result.added ? null : result.reason ?? null;
    },
    [items]
  );

  const remove = useCallback((id: string) => setItems(removeFromCompare(id)), []);
  const clear = useCallback(() => setItems(clearCompare()), []);
  const keepOnly = useCallback((ids: string[]) => setItems(keepOnlyInCompare(ids)), []);

  const value = useMemo(
    () => ({
      items,
      ready,
      limit: COMPARE_LIMIT,
      isFull: items.length >= COMPARE_LIMIT,
      isSelected,
      toggle,
      remove,
      clear,
      keepOnly,
    }),
    [items, ready, isSelected, toggle, remove, clear, keepOnly]
  );

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare(): CompareContextValue {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error('useCompare must be used within CompareProvider');
  return ctx;
}
