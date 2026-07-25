'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import MarketplaceHeader from '../_components/MarketplaceHeader';
import ProductCard from '../_components/ProductCard';
import { ProductGridSkeleton } from '../_components/skeletons';
import { fetchProducts, type MarketplaceProduct, type ProductSort } from '../_components/api';

function ProductsBrowse() {
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [sort, setSort] = useState<ProductSort>('newest');

  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Debounce the search box so we refetch once the user pauses, not per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Guard against out-of-order responses: only the latest request may commit.
  const reqId = useRef(0);

  // Reset + refetch page 1 whenever the query or sort changes.
  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    fetchProducts({ search, sort, limit: 20 })
      .then((d) => {
        if (id !== reqId.current) return;
        setProducts(d.products);
        setNextCursor(d.nextCursor);
        setLoading(false);
      })
      .catch(() => {
        if (id !== reqId.current) return;
        setProducts([]);
        setNextCursor(null);
        setLoading(false);
      });
  }, [search, sort]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const d = await fetchProducts({ search, sort, cursor: nextCursor, limit: 20 });
    setProducts((prev) => [...prev, ...d.products]);
    setNextCursor(d.nextCursor);
    setLoadingMore(false);
  }, [nextCursor, loadingMore, search, sort]);

  return (
    <div className="mk-root">
      <MarketplaceHeader active="products" />

      <div className="sf-container mk-browse">
        <div className="mk-browse-head">
          <h1 className="mk-browse-title">All products</h1>
          <p className="mk-browse-sub">Search across every published shop on BazarHQ.</p>
        </div>

        <div className="mk-browse-controls">
          <div className="sf-search-wrap mk-browse-search">
            <svg className="sf-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              className="sf-search mk-browse-search-input"
              placeholder="Search products…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search products"
            />
          </div>
          <label className="mk-sort">
            <span className="mk-sort-label">Sort</span>
            <select
              className="mk-sort-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as ProductSort)}
            >
              <option value="newest">Newest</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </label>
        </div>

        {loading ? (
          <ProductGridSkeleton count={12} />
        ) : products.length === 0 ? (
          <div className="sf-empty">
            <svg className="sf-empty-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <p className="sf-empty-title">
              {search ? 'No products match your search' : 'No products yet'}
            </p>
            <p className="sf-empty-sub">
              {search ? 'Try a different keyword.' : 'Check back soon.'}
            </p>
          </div>
        ) : (
          <>
            <div className="sf-grid">
              {products.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
            {nextCursor && (
              <div className="sf-load-more">
                <button className="sf-load-more-btn" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function MarketplaceProductsPage() {
  return (
    <Suspense fallback={
      <div className="mk-root">
        <MarketplaceHeader active="products" />
        <div className="sf-container mk-browse">
          <div className="mk-browse-head">
            <h1 className="mk-browse-title">All products</h1>
          </div>
          <ProductGridSkeleton count={12} />
        </div>
      </div>
    }>
      <ProductsBrowse />
    </Suspense>
  );
}
