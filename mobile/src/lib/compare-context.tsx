import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  addToCompare,
  clearCompare,
  getCompare,
  removeFromCompare,
  COMPARE_LIMIT,
  type CompareItem,
} from './compare';

// Comparison selection shared across the customer stack. Mirrors web's
// lib/compare-context.tsx, and mirrors CartProvider's shape in this folder —
// except it is mounted once in (customer)/_layout rather than per shop, because
// a comparison spans shops while a cart does not.

interface CompareContextValue {
  items: CompareItem[];
  /** False until AsyncStorage has been read, so the tray never flashes on launch. */
  ready: boolean;
  limit: number;
  isFull: boolean;
  isSelected: (id: string) => boolean;
  /** Adds or removes. Resolves to the refusal reason when the cap blocked an add. */
  toggle: (item: CompareItem) => Promise<string | null>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
}

const CompareContext = createContext<CompareContextValue | null>(null);

export function CompareProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CompareItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    getCompare().then(stored => {
      if (!active) return;
      setItems(stored);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const isSelected = useCallback((id: string) => items.some(i => i.id === id), [items]);

  const toggle = useCallback(
    async (item: CompareItem): Promise<string | null> => {
      if (items.some(i => i.id === item.id)) {
        setItems(await removeFromCompare(item.id));
        return null;
      }
      const result = await addToCompare(item);
      setItems(result.items);
      return result.added ? null : result.reason ?? null;
    },
    [items]
  );

  const remove = useCallback(async (id: string) => {
    setItems(await removeFromCompare(id));
  }, []);

  const clear = useCallback(async () => {
    setItems(await clearCompare());
  }, []);

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
    }),
    [items, ready, isSelected, toggle, remove, clear]
  );

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare(): CompareContextValue {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error('useCompare must be used within CompareProvider');
  return ctx;
}
