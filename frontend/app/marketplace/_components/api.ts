// Marketplace API client — thin typed wrappers over the public /v1/marketplace
// endpoints (Sprint M1). Read-only, no auth. Base URL mirrors the storefront:
// NEXT_PUBLIC_API_URL is inlined at build time, falling back to local dev.

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';

export interface MarketplaceProduct {
  id: string;
  name: string;
  slug: string;
  basePrice: string;
  compareAtPrice: string | null;
  image: string | null;
  shop: { name: string; subdomain: string; logoUrl: string | null };
}

export interface MarketplaceShop {
  id: string;
  name: string;
  subdomain: string;
  description: string | null;
  logoUrl: string | null;
  publishedAt: string | null;
  productCount: number;
}

export type ProductSort = 'newest' | 'price_asc' | 'price_desc';
export type ShopSort = 'popular' | 'newest';

export interface ProductsPage {
  products: MarketplaceProduct[];
  nextCursor: string | null;
}

export interface ShopsPage {
  shops: MarketplaceShop[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/** Fetch a page of cross-shop products. Cursor-paginated via `nextCursor`. */
export async function fetchProducts(opts: {
  search?: string;
  sort?: ProductSort;
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
} = {}): Promise<ProductsPage> {
  const params = new URLSearchParams();
  if (opts.search) params.set('search', opts.search);
  if (opts.sort) params.set('sort', opts.sort);
  if (opts.cursor) params.set('cursor', opts.cursor);
  params.set('limit', String(opts.limit ?? 20));

  const res = await fetch(`${API}/marketplace/products?${params}`, { signal: opts.signal });
  const json = await res.json();
  return json.success ? (json.data as ProductsPage) : { products: [], nextCursor: null };
}

/** Fetch a page of published shops. Offset-paginated (`popular` is ranked in-app). */
export async function fetchShops(opts: {
  sort?: ShopSort;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
} = {}): Promise<ShopsPage> {
  const params = new URLSearchParams();
  if (opts.sort) params.set('sort', opts.sort);
  params.set('limit', String(opts.limit ?? 12));
  if (opts.offset) params.set('offset', String(opts.offset));

  const res = await fetch(`${API}/marketplace/shops?${params}`, { signal: opts.signal });
  const json = await res.json();
  return json.success
    ? (json.data as ShopsPage)
    : { shops: [], total: 0, limit: opts.limit ?? 12, offset: opts.offset ?? 0, hasMore: false };
}

/** Format a Decimal-string price as a Bangladeshi Taka amount, matching the storefront. */
export function formatTk(value: string): string {
  return `৳${Number(value).toLocaleString()}`;
}
