'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  getCart, addToCart, updateQuantity, removeFromCart, clearCart,
  type CartItem,
} from '@/lib/cart';
import { shopHref } from './shop-href';

// ─── Shop context (read-only data from server) ────────────────────────────────

export interface ShopData {
  id: string;
  name: string;
  subdomain: string;
  description: string | null;
  logoUrl: string | null;
  status: string;
}

export interface ThemeData {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  bannerUrl: string | null;
  themePreset: string;
}

export interface CategoryData {
  id: string;
  name: string;
  slug: string;
}

interface ShopContextValue {
  shop: ShopData;
  theme: ThemeData;
  categories: CategoryData[];
  subdomain: string;
  paymentMethods: string[];
}

const ShopContext = createContext<ShopContextValue | null>(null);
export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop must be inside StorefrontShell');
  return ctx;
}

// ─── Cart context ─────────────────────────────────────────────────────────────

interface CartContextValue {
  items: CartItem[];
  count: number;
  total: number;
  add: (item: CartItem) => void;
  update: (productId: string, variantId: string | undefined, qty: number) => void;
  remove: (productId: string, variantId?: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be inside StorefrontShell');
  return ctx;
}

// ─── Shell ────────────────────────────────────────────────────────────────────

interface Props {
  shop: ShopData;
  theme: ThemeData;
  categories: CategoryData[];
  subdomain: string;
  paymentMethods: string[];
  children: React.ReactNode;
}

export default function StorefrontShell({ shop, theme, categories, subdomain, paymentMethods, children }: Props) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(getCart(subdomain));
  }, [subdomain]);

  const count = items.reduce((s, i) => s + i.quantity, 0);
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);

  const add = useCallback((item: CartItem) => setItems(addToCart(subdomain, item)), [subdomain]);
  const update = useCallback(
    (productId: string, variantId: string | undefined, qty: number) =>
      setItems(updateQuantity(subdomain, productId, variantId, qty)),
    [subdomain],
  );
  const remove = useCallback(
    (productId: string, variantId?: string) =>
      setItems(removeFromCart(subdomain, productId, variantId)),
    [subdomain],
  );
  const clear = useCallback(() => { clearCart(subdomain); setItems([]); }, [subdomain]);

  return (
    <ShopContext.Provider value={{ shop, theme, categories, subdomain, paymentMethods }}>
      <CartContext.Provider value={{ items, count, total, add, update, remove, clear }}>
        <div
          className="sf-root"
          style={{
            '--sf-primary': theme.primaryColor,
            '--sf-secondary': theme.secondaryColor,
            fontFamily: `${theme.fontFamily}, sans-serif`,
          } as React.CSSProperties}
        >
          <header className="sf-header">
            <div className="sf-container sf-header-inner">
              <Link href={shopHref('/', subdomain)} className="sf-brand">
                {shop.logoUrl
                  ? <img src={shop.logoUrl} alt={shop.name} className="sf-logo" />
                  : <span className="sf-brand-name">{shop.name}</span>
                }
              </Link>

              <nav className="sf-nav">
                <Link href={shopHref('/', subdomain)} className="sf-nav-link">All</Link>
                {categories.map(cat => (
                  <Link key={cat.id} href={shopHref(`/?category=${cat.slug}`, subdomain)} className="sf-nav-link">
                    {cat.name}
                  </Link>
                ))}
              </nav>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Link href={shopHref('/account', subdomain)} className="sf-nav-link" style={{ fontSize: '0.875rem' }}>
                  My Orders
                </Link>
                <Link href={shopHref('/cart', subdomain)} className="sf-cart-link">
                  Cart{count > 0 && <span className="sf-cart-badge">{count}</span>}
                </Link>
              </div>
            </div>
          </header>

          <main className="sf-main">{children}</main>

          <footer className="sf-footer">
            <div className="sf-container sf-footer-inner">
              <p>© {new Date().getFullYear()} {shop.name} · Powered by BazarHQ</p>
              <Link href={shopHref('/track', subdomain)} className="sf-footer-track-link">Track Order</Link>
            </div>
          </footer>
        </div>
      </CartContext.Provider>
    </ShopContext.Provider>
  );
}
