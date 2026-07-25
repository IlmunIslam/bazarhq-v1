'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import MarketplaceHeader from './_components/MarketplaceHeader';
import ProductCard from './_components/ProductCard';
import ShopCard from './_components/ShopCard';
import { ProductGridSkeleton, ShopRowSkeleton } from './_components/skeletons';
import {
  fetchProducts,
  fetchShops,
  type MarketplaceProduct,
  type MarketplaceShop,
  type ShopSort,
} from './_components/api';

export default function MarketplaceHomePage() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const [shopSort, setShopSort] = useState<ShopSort>('popular');
  const [shops, setShops] = useState<MarketplaceShop[] | null>(null);

  const [products, setProducts] = useState<MarketplaceProduct[] | null>(null);

  // Shops react to the popular/newest toggle. Abortable so a fast toggle can't
  // land an out-of-order response.
  useEffect(() => {
    const ac = new AbortController();
    setShops(null);
    fetchShops({ sort: shopSort, limit: 12, signal: ac.signal })
      .then((d) => setShops(d.shops))
      .catch(() => {});
    return () => ac.abort();
  }, [shopSort]);

  // Featured products load once — a newest-first preview of the full browse page.
  useEffect(() => {
    const ac = new AbortController();
    fetchProducts({ sort: 'newest', limit: 10, signal: ac.signal })
      .then((d) => setProducts(d.products))
      .catch(() => {});
    return () => ac.abort();
  }, []);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/marketplace/products?search=${encodeURIComponent(q)}` : '/marketplace/products');
  };

  return (
    <div className="mk-root">
      <MarketplaceHeader active="home" />

      {/* Hero */}
      <section className="mk-hero">
        <div className="sf-container">
          <h1 className="mk-hero-title">Everything from Bangladesh&apos;s best shops, in one place</h1>
          <p className="mk-hero-sub">
            Browse products across every published BazarHQ store — then check out on the shop that sells it.
          </p>
          <form className="mk-hero-search" onSubmit={submitSearch} role="search">
            <svg className="mk-hero-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              className="mk-hero-search-input"
              placeholder="Search products across all shops…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search products"
            />
            <button type="submit" className="mk-hero-search-btn">Search</button>
          </form>
        </div>
      </section>

      <div className="sf-container mk-sections">
        {/* Shops */}
        <section className="mk-section">
          <div className="mk-section-head">
            <h2 className="mk-section-title">Shops</h2>
            <div className="mk-toggle" role="tablist" aria-label="Sort shops">
              <button
                role="tab"
                aria-selected={shopSort === 'popular'}
                className={`mk-toggle-btn${shopSort === 'popular' ? ' active' : ''}`}
                onClick={() => setShopSort('popular')}
              >
                Popular
              </button>
              <button
                role="tab"
                aria-selected={shopSort === 'newest'}
                className={`mk-toggle-btn${shopSort === 'newest' ? ' active' : ''}`}
                onClick={() => setShopSort('newest')}
              >
                Newest
              </button>
            </div>
          </div>
          {shops === null ? (
            <ShopRowSkeleton />
          ) : shops.length === 0 ? (
            <p className="mk-section-empty">No shops published yet.</p>
          ) : (
            <div className="mk-shop-row">
              {shops.map((s) => (
                <ShopCard key={s.id} shop={s} />
              ))}
            </div>
          )}
        </section>

        {/* Featured products */}
        <section className="mk-section">
          <div className="mk-section-head">
            <h2 className="mk-section-title">Fresh finds</h2>
            <Link href="/marketplace/products" className="mk-section-link">
              Browse all products →
            </Link>
          </div>
          {products === null ? (
            <ProductGridSkeleton count={10} />
          ) : products.length === 0 ? (
            <p className="mk-section-empty">No products yet — check back soon.</p>
          ) : (
            <div className="sf-grid">
              {products.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
          )}
        </section>
      </div>

      <footer className="mk-footer">
        <div className="sf-container">
          <p>Powered by BazarHQ · Multi-tenant commerce for Bangladesh</p>
        </div>
      </footer>
    </div>
  );
}
