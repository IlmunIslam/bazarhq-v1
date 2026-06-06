'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useShop } from './_components/StorefrontShell';

interface ProductImage { url: string; }
interface Product {
  id: string;
  name: string;
  slug: string;
  basePrice: string;
  compareAtPrice: string | null;
  stock: number;
  images: ProductImage[];
  _count: { variants: number };
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';

function StorefrontHomeContent() {
  const { shop, theme, categories, subdomain } = useShop();
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeCategory = searchParams.get('category') ?? '';
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [searchInput, setSearchInput] = useState(search);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchProducts = useCallback(async (opts: {
    category?: string; search?: string; cursor?: string;
  }) => {
    const params = new URLSearchParams();
    if (opts.category) params.set('category', opts.category);
    if (opts.search) params.set('search', opts.search);
    if (opts.cursor) params.set('cursor', opts.cursor);
    params.set('limit', '20');

    const res = await fetch(`${API}/storefront/${subdomain}/products?${params}`);
    const json = await res.json();
    return json.success ? json.data : { products: [], nextCursor: null };
  }, [subdomain]);

  // Load products when filters change
  useEffect(() => {
    setLoading(true);
    fetchProducts({ category: activeCategory, search }).then(data => {
      setProducts(data.products);
      setNextCursor(data.nextCursor);
      setLoading(false);
    });
  }, [activeCategory, search, fetchProducts]);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    const data = await fetchProducts({ category: activeCategory, search, cursor: nextCursor });
    setProducts(prev => [...prev, ...data.products]);
    setNextCursor(data.nextCursor);
    setLoadingMore(false);
  };

  const handleCategoryClick = (slug: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (slug) params.set('category', slug);
    else params.delete('category');
    router.push(`/?${params}`);
  };

  return (
    <div>
      {/* Hero */}
      {theme.bannerUrl ? (
        <div className="sf-hero" style={{ backgroundImage: `url(${theme.bannerUrl})` }}>
          <div className="sf-hero-overlay">
            <h1 className="sf-hero-title">{shop.name}</h1>
            {shop.description && <p className="sf-hero-subtitle">{shop.description}</p>}
          </div>
        </div>
      ) : (
        <div className="sf-hero-text">
          <div className="sf-container">
            <h1 className="sf-hero-title-plain">{shop.name}</h1>
            {shop.description && <p className="sf-hero-subtitle-plain">{shop.description}</p>}
          </div>
        </div>
      )}

      {/* Products section */}
      <div className="sf-container sf-products-section">
        {/* Controls: category pills + search */}
        <div className="sf-controls">
          <div className="sf-category-pills">
            <button
              className={`sf-pill ${!activeCategory ? 'active' : ''}`}
              onClick={() => handleCategoryClick('')}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                className={`sf-pill ${activeCategory === cat.slug ? 'active' : ''}`}
                onClick={() => handleCategoryClick(cat.slug)}
              >
                {cat.name}
              </button>
            ))}
          </div>
          <input
            className="sf-search"
            placeholder="Search products…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>

        {/* Grid */}
        {loading ? (
          <div className="sf-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="sf-product-card sf-skeleton" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="sf-empty">
            <p>{search || activeCategory ? 'No products match your search.' : 'No products yet.'}</p>
          </div>
        ) : (
          <>
            <div className="sf-grid">
              {products.map(p => (
                <Link key={p.id} href={`/products/${p.slug}`} className="sf-product-card">
                  <div className="sf-product-img-wrap">
                    {p.images[0] ? (
                      <img src={p.images[0].url} alt={p.name} className="sf-product-img" />
                    ) : (
                      <div className="sf-product-img sf-no-img">No image</div>
                    )}
                  </div>
                  <div className="sf-product-info">
                    <p className="sf-product-name">{p.name}</p>
                    <div className="sf-product-price-row">
                      <span className="sf-product-price">৳{Number(p.basePrice).toLocaleString()}</span>
                      {p.compareAtPrice && (
                        <span className="sf-product-was">৳{Number(p.compareAtPrice).toLocaleString()}</span>
                      )}
                    </div>
                    {p._count.variants > 0 && (
                      <p className="sf-product-variants">{p._count.variants} variants</p>
                    )}
                  </div>
                </Link>
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

export default function StorefrontHomePage() {
  return (
    <Suspense fallback={<div className="sf-container" style={{ padding: '4rem 0', textAlign: 'center', color: '#9ca3af' }}>Loading…</div>}>
      <StorefrontHomeContent />
    </Suspense>
  );
}
