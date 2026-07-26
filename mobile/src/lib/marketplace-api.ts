import { api } from './api-client';

// Typed wrappers over the public /v1/marketplace/* endpoints — the SAME ones the
// web marketplace uses (frontend/app/marketplace/_components/api.ts). Read-only,
// no auth. Shapes are defined locally (they aren't in @bazarhq/shared) and mirror
// the web types exactly.

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

/** A page of cross-shop products. Cursor-paginated via `nextCursor`. */
export function fetchMarketplaceProducts(
  opts: { search?: string; sort?: ProductSort; cursor?: string; limit?: number } = {},
) {
  const params = new URLSearchParams();
  if (opts.search) params.set('search', opts.search);
  if (opts.sort) params.set('sort', opts.sort);
  if (opts.cursor) params.set('cursor', opts.cursor);
  params.set('limit', String(opts.limit ?? 20));
  return api.get<ProductsPage>(`/marketplace/products?${params}`);
}

/** A page of published shops. `popular` is ranked in-app; offset-paginated. */
export function fetchMarketplaceShops(
  opts: { sort?: ShopSort; limit?: number; offset?: number } = {},
) {
  const params = new URLSearchParams();
  if (opts.sort) params.set('sort', opts.sort);
  params.set('limit', String(opts.limit ?? 12));
  if (opts.offset) params.set('offset', String(opts.offset));
  return api.get<ShopsPage>(`/marketplace/shops?${params}`);
}
