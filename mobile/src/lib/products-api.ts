import type { ApiResponse, ProductStatus } from '@bazarhq/shared';

import { api } from './api-client';
import type { PickedAsset } from './image-picker';

// Typed wrappers over the merchant product endpoints (all requireMerchant →
// Bearer). Shapes mirror the web dashboard exactly so products stay consistent
// across web and mobile. Images are a SEPARATE resource (POST /:id/images),
// added in B2 at the bottom of this file — the same endpoint the web dashboard
// posts to, which uploads to Cloudinary server-side.

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

export interface ProductImage {
  id: string;
  url: string;
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
  images: ProductImage[];
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

// ─── Marketplace taxonomy + specs (C3) ────────────────────────────────────────
//
// The global marketplace category is entirely separate from `categoryId` above,
// which stays the merchant's own per-shop category. This one is the shared
// vocabulary that makes products comparable across shops.
//
// The two GETs are public (no auth needed); they go through the merchant client
// anyway so every call in this file behaves the same way.

export type SpecDataType = 'text' | 'number' | 'boolean' | 'enum';

export interface GlobalCategoryNode {
  id: string;
  slug: string;
  name: string;
  specFieldCount: number;
  children: GlobalCategoryNode[];
}

export interface SpecField {
  id: string;
  key: string;
  label: string;
  unit: string | null;
  dataType: SpecDataType;
  options: string[];
  isRequired: boolean;
}

export interface SpecState {
  globalCategory: { id: string; name: string } | null;
  specFields: SpecField[];
  values: Record<string, string | boolean>;
}

/** One entry of the bulk replace. `null` clears the value. */
export interface SpecInput {
  specFieldId: string;
  value: string | boolean | null;
}

/** The active two-level taxonomy, for the picker. */
export function fetchGlobalCategories() {
  return api.get<{ categories: GlobalCategoryNode[] }>('/categories');
}

/** A category's active spec template — used when the merchant picks a new one. */
export function fetchSpecTemplate(categoryId: string) {
  return api.get<{ specFields: SpecField[] }>(`/categories/${categoryId}/spec-fields`);
}

/**
 * The product's marketplace category, its template and its saved values in one
 * call. GET /products/:id returns none of this, so the edit screen reads it here.
 */
export function fetchProductSpecs(productId: string) {
  return api.get<SpecState>(`/products/${productId}/specs`);
}

/**
 * Assign, change or clear (null) the marketplace category.
 *
 * Fails with 409 SPECS_EXIST when the product already holds spec values, unless
 * `clearSpecs` is true — the API refuses to discard a merchant's work without an
 * explicit acknowledgement. Pass true only after they confirm.
 */
export function setGlobalCategory(productId: string, globalCategoryId: string | null, clearSpecs = false) {
  return api.put<SpecState & { changed: boolean; clearedSpecs: number }>(
    `/products/${productId}/global-category`,
    { globalCategoryId, ...(clearSpecs ? { clearSpecs: true } : {}) }
  );
}

/** Bulk replace of the product's spec values. Idempotent. */
export function saveProductSpecs(productId: string, specs: SpecInput[]) {
  return api.put<SpecState>(`/products/${productId}/specs`, { specs });
}

// ─── Images (B2) ──────────────────────────────────────────────────────────────
//
// Identical server contract to the web dashboard: multipart POST with the file
// under the field name `image`. The API buffers it (multer, memory storage),
// uploads to Cloudinary with its own server-side credentials, and stores the
// resulting row. No Cloudinary key ever reaches the device.

/** Server-side cap — multer `fileSize` in api/src/routes/products.ts. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Server-side cap — the API rejects the 7th image with IMAGE_LIMIT. */
export const MAX_PRODUCT_IMAGES = 6;

export function uploadProductImage(
  productId: string,
  asset: PickedAsset
): Promise<ApiResponse<{ image: ProductImage }>> {
  // Fail fast rather than push megabytes over a mobile connection just to be
  // rejected. `fileSize` is optional in the picker's result, so this is a
  // best-effort guard — the API's 413 is still handled by the caller.
  if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
    return Promise.resolve({
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: 'That image is over 5 MB. Try a smaller photo.' },
    });
  }

  const form = new FormData();
  // React Native has no `File`. Its FormData implementation special-cases an
  // object shaped `{ uri, name, type }` and streams that file as a multipart
  // part — this is the one place the mobile upload differs from the web's
  // `form.append('image', file)`. The cast is needed because TypeScript
  // resolves the DOM `FormData`, which only accepts string | Blob.
  form.append('image', {
    uri: asset.uri,
    name: asset.fileName ?? `product-${Date.now()}.jpg`,
    type: asset.mimeType ?? 'image/jpeg',
  } as unknown as Blob);

  return api.postForm<{ image: ProductImage }>(`/products/${productId}/images`, form);
}

/** Removes the image from Cloudinary and the database (server handles both). */
export function deleteProductImage(productId: string, imageId: string) {
  return api.delete<{ deleted: boolean }>(`/products/${productId}/images/${imageId}`);
}
