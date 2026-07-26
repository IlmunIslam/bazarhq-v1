import type { ProductStatus } from '@bazarhq/shared';

import { api } from './api-client';

// Typed wrappers over the merchant product endpoints (all requireMerchant →
// Bearer). Shapes mirror the web dashboard exactly so products stay consistent
// across web and mobile. Images are a SEPARATE resource (POST /:id/images) and
// are intentionally not touched here — B1 creates/edits products image-free;
// B2 adds device upload without reworking this layer.

export interface ProductListItem {
  id: string;
  name: string;
  status: ProductStatus;
  basePrice: string;
  compareAtPrice: string | null;
  stock: number;
  category: { id: string; name: string } | null;
  images: { url: string }[];
  _count: { variants: number; orderItems: number };
}

export interface ProductDetailVariant {
  name: string;
  price: string;
  stock: number;
  sku: string | null;
}

export interface ProductDetail {
  id: string;
  name: string;
  description: string | null;
  basePrice: string;
  compareAtPrice: string | null;
  categoryId: string | null;
  status: ProductStatus;
  tags: string[];
  images: { id: string; url: string }[];
  variants: ProductDetailVariant[];
}

export interface Category {
  id: string;
  name: string;
}

// Payload for POST/PATCH /products. Same fields the web form sends. `status` is
// draft|active only — matching the API's schema (archived is set elsewhere).
export interface ProductPayload {
  name: string;
  description?: string;
  basePrice: number;
  compareAtPrice?: number;
  categoryId?: string;
  status: 'draft' | 'active';
  tags: string[];
}

// Variant set for POST /products/:id/variants — replaces ALL variants.
export interface VariantInput {
  name: string;
  price: number;
  stock: number;
  sku?: string;
}

export function fetchProducts(opts: { status?: string; search?: string } = {}) {
  const params = new URLSearchParams();
  if (opts.status) params.set('status', opts.status);
  if (opts.search) params.set('search', opts.search);
  params.set('limit', '100');
  return api.get<{ products: ProductListItem[]; nextCursor: string | null }>(`/products?${params}`);
}

export function fetchProduct(id: string) {
  return api.get<{ product: ProductDetail }>(`/products/${id}`);
}

export function createProduct(payload: ProductPayload) {
  return api.post<{ product: { id: string } }>('/products', payload);
}

export function updateProduct(id: string, payload: Partial<ProductPayload>) {
  return api.patch<{ product: { id: string } }>(`/products/${id}`, payload);
}

export function deleteProduct(id: string) {
  return api.delete<{ deleted: boolean }>(`/products/${id}`);
}

// Replaces the product's entire variant set (delete-all + create-all server-side).
// Only call with ≥1 variant — the endpoint requires it, matching the web form.
export function saveVariants(id: string, variants: VariantInput[]) {
  return api.post<{ product: { id: string } }>(`/products/${id}/variants`, { variants });
}

export function fetchCategories() {
  return api.get<{ categories: Category[] }>('/products/categories');
}
