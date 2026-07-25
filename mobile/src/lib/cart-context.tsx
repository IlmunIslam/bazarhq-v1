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
  addToCart,
  clearCart,
  getCart,
  removeFromCart,
  updateQuantity,
  type CartItem,
} from './cart';
import { ACTIVE_SHOP } from './shop';

// Cart state shared across the customer stack (list / detail / cart screens),
// plus the header badge. Web keeps this in StorefrontShell; mobile has no shared
// storefront layout, so a small provider mounted at the app root plays that
// role. State is persisted to AsyncStorage (see lib/cart) and restored on
// launch, namespaced by the active shop's subdomain.

interface CartContextValue {
  items: CartItem[];
  count: number;
  total: number;
  ready: boolean;
  add: (item: CartItem) => Promise<void>;
  update: (productId: string, variantId: string | undefined, qty: number) => Promise<void>;
  remove: (productId: string, variantId?: string) => Promise<void>;
  clear: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  // Restore the persisted cart on launch.
  useEffect(() => {
    let active = true;
    getCart(ACTIVE_SHOP).then(stored => {
      if (!active) return;
      setItems(stored);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const add = useCallback(async (item: CartItem) => {
    setItems(await addToCart(ACTIVE_SHOP, item));
  }, []);

  const update = useCallback(
    async (productId: string, variantId: string | undefined, qty: number) => {
      setItems(await updateQuantity(ACTIVE_SHOP, productId, variantId, qty));
    },
    [],
  );

  const remove = useCallback(async (productId: string, variantId?: string) => {
    setItems(await removeFromCart(ACTIVE_SHOP, productId, variantId));
  }, []);

  const clear = useCallback(async () => {
    await clearCart(ACTIVE_SHOP);
    setItems([]);
  }, []);

  const count = items.reduce((s, i) => s + i.quantity, 0);
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);

  const value = useMemo(
    () => ({ items, count, total, ready, add, update, remove, clear }),
    [items, count, total, ready, add, update, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
