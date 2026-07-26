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

// Cart state shared across one shop's stack (storefront / detail / cart screens),
// plus the header badge. Web keeps this in StorefrontShell, keyed by subdomain;
// mobile mirrors that with a provider mounted in the per-shop layout
// (app/(customer)/shop/[subdomain]/_layout). Each shop gets its own provider
// instance, so state is persisted to AsyncStorage under `cart_${subdomain}` and
// every shop keeps a fully separate cart automatically (Option A).

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

export function CartProvider({ subdomain, children }: { subdomain: string; children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  // Restore the persisted cart for THIS shop. Keyed on subdomain so that if the
  // provider is ever reused across shops, it reloads the correct cart.
  useEffect(() => {
    let active = true;
    setReady(false);
    getCart(subdomain).then(stored => {
      if (!active) return;
      setItems(stored);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [subdomain]);

  const add = useCallback(async (item: CartItem) => {
    setItems(await addToCart(subdomain, item));
  }, [subdomain]);

  const update = useCallback(
    async (productId: string, variantId: string | undefined, qty: number) => {
      setItems(await updateQuantity(subdomain, productId, variantId, qty));
    },
    [subdomain],
  );

  const remove = useCallback(async (productId: string, variantId?: string) => {
    setItems(await removeFromCart(subdomain, productId, variantId));
  }, [subdomain]);

  const clear = useCallback(async () => {
    await clearCart(subdomain);
    setItems([]);
  }, [subdomain]);

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
