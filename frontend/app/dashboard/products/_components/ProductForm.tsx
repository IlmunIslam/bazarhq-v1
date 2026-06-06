'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(5000).optional(),
  basePrice: z.number({ invalid_type_error: 'Enter a valid price' }).positive('Price must be positive'),
  compareAtPrice: z.number({ invalid_type_error: 'Enter a valid price' }).positive().optional().or(z.literal('')),
  categoryId: z.string().optional(),
  status: z.enum(['draft', 'active']),
  tags: z.string().optional(),
  variants: z.array(z.object({
    name: z.string().min(1, 'Variant name required'),
    price: z.number({ invalid_type_error: 'Enter a valid price' }).positive('Must be positive'),
    stock: z.number({ invalid_type_error: 'Enter a valid number' }).int().min(0),
    sku: z.string().optional(),
  })).optional(),
});

type FormData = z.infer<typeof schema>;

export interface ProductImage {
  id: string;
  url: string;
  cloudinaryId: string;
  sortOrder: number;
}

export interface ProductFormProps {
  productId?: string;
  defaultValues?: Partial<FormData> & { images?: ProductImage[] };
}

interface Category { id: string; name: string; }

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProductForm({ productId, defaultValues }: ProductFormProps) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [images, setImages] = useState<ProductImage[]>(defaultValues?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [serverError, setServerError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const isEdit = !!productId;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      status: 'draft',
      variants: [],
      ...defaultValues,
      compareAtPrice: defaultValues?.compareAtPrice ?? '',
      tags: Array.isArray(defaultValues?.tags)
        ? (defaultValues.tags as string[]).join(', ')
        : (defaultValues?.tags ?? ''),
    },
  });

  const { fields: variantFields, append: appendVariant, remove: removeVariant } = useFieldArray({
    control,
    name: 'variants',
  });

  useEffect(() => {
    api.get<{ categories: Category[] }>('/products/categories').then(res => {
      if (res.success) setCategories(res.data.categories);
    });
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (images.length + files.length > 6) {
      alert('Maximum 6 images per product.');
      return;
    }
    setUploading(true);
    for (const file of files) {
      const form = new FormData();
      form.append('image', file);
      const res = await api.postForm<{ image: ProductImage }>(`/products/${productId}/images`, form);
      if (res.success) setImages(prev => [...prev, res.data.image]);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDeleteImage = async (imageId: string) => {
    const res = await api.delete(`/products/${productId}/images/${imageId}`);
    if (res.success) setImages(prev => prev.filter(img => img.id !== imageId));
  };

  const onSubmit = async (data: FormData) => {
    setServerError('');
    const tagsArray = data.tags
      ? data.tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];
    const payload = {
      name: data.name,
      description: data.description || undefined,
      basePrice: data.basePrice,
      compareAtPrice: data.compareAtPrice || undefined,
      categoryId: data.categoryId || undefined,
      status: data.status,
      tags: tagsArray,
    };

    let savedId = productId;

    if (isEdit) {
      const res = await api.patch<{ product: { id: string } }>(`/products/${productId}`, payload);
      if (!res.success) { setServerError(res.error.message); return; }
    } else {
      const res = await api.post<{ product: { id: string } }>('/products', payload);
      if (!res.success) { setServerError(res.error.message); return; }
      savedId = res.data.product.id;
    }

    // Save variants if any
    if (data.variants && data.variants.length > 0) {
      const vRes = await api.post(`/products/${savedId}/variants`, { variants: data.variants });
      if (!vRes.success) { setServerError((vRes as { error: { message: string } }).error.message); return; }
    }

    router.push('/dashboard/products');
  };

  const hasVariants = watch('variants')?.length ? watch('variants')!.length > 0 : false;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="product-form">
      <div className="form-layout">
        {/* Left column — main fields */}
        <div className="form-main">
          <div className="card form-section">
            <div className="field">
              <label>Product name <span className="text-error">*</span></label>
              <input
                {...register('name')}
                placeholder="e.g. Cotton T-Shirt"
                className={errors.name ? 'error' : ''}
                autoFocus
              />
              {errors.name && <span className="field-error">{errors.name.message}</span>}
            </div>

            <div className="field">
              <label>Description</label>
              <textarea
                {...register('description')}
                placeholder="Describe your product…"
                rows={5}
                className="textarea"
              />
            </div>
          </div>

          {/* Images — only editable after product is saved */}
          <div className="card form-section">
            <h2 className="section-title">Images</h2>
            {!isEdit && (
              <p className="text-muted text-sm">Save the product first, then add images.</p>
            )}
            {isEdit && (
              <>
                <div className="image-grid">
                  {images.map((img, i) => (
                    <div key={img.id} className="image-thumb-wrap">
                      <img src={img.url} alt="" className="image-thumb" />
                      {i === 0 && <span className="image-primary-badge">Primary</span>}
                      <button
                        type="button"
                        className="image-delete-btn"
                        onClick={() => handleDeleteImage(img.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {images.length < 6 && (
                    <button
                      type="button"
                      className="image-upload-btn"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? 'Uploading…' : '+ Add image'}
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={handleImageUpload}
                />
                <p className="text-muted text-sm" style={{ marginTop: '0.5rem' }}>
                  {images.length}/6 images. First image is the primary.
                </p>
              </>
            )}
          </div>

          {/* Variants */}
          <div className="card form-section">
            <div className="section-header">
              <h2 className="section-title">Variants</h2>
              <button
                type="button"
                className="btn-link"
                onClick={() => appendVariant({ name: '', price: 0, stock: 0, sku: '' })}
              >
                + Add variant
              </button>
            </div>

            {!hasVariants && (
              <p className="text-muted text-sm">
                Add variants for products with multiple options (size, colour, etc.).
                When variants are used, stock is tracked per variant.
              </p>
            )}

            {variantFields.map((field, i) => (
              <div key={field.id} className="variant-row">
                <div className="field" style={{ flex: 2 }}>
                  {i === 0 && <label>Name</label>}
                  <input
                    {...register(`variants.${i}.name`)}
                    placeholder="e.g. Red / Large"
                    className={errors.variants?.[i]?.name ? 'error' : ''}
                  />
                  {errors.variants?.[i]?.name && (
                    <span className="field-error">{errors.variants[i]!.name!.message}</span>
                  )}
                </div>
                <div className="field" style={{ flex: 1 }}>
                  {i === 0 && <label>Price (৳)</label>}
                  <input
                    {...register(`variants.${i}.price`, { valueAsNumber: true })}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className={errors.variants?.[i]?.price ? 'error' : ''}
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  {i === 0 && <label>Stock</label>}
                  <input
                    {...register(`variants.${i}.stock`, { valueAsNumber: true })}
                    type="number"
                    min="0"
                    placeholder="0"
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  {i === 0 && <label>SKU</label>}
                  <input {...register(`variants.${i}.sku`)} placeholder="Optional" />
                </div>
                <button
                  type="button"
                  className="variant-remove-btn"
                  style={{ alignSelf: i === 0 ? 'flex-end' : 'center' }}
                  onClick={() => removeVariant(i)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right column — meta */}
        <div className="form-sidebar">
          <div className="card form-section">
            <h2 className="section-title">Status</h2>
            <div className="field">
              <select {...register('status')} className="select">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
              </select>
              <p className="text-muted text-sm" style={{ marginTop: '0.375rem' }}>
                Only active products appear in your store.
              </p>
            </div>
          </div>

          <div className="card form-section">
            <h2 className="section-title">Pricing</h2>
            <div className="field">
              <label>Price (৳) <span className="text-error">*</span></label>
              <input
                {...register('basePrice', { valueAsNumber: true })}
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className={errors.basePrice ? 'error' : ''}
              />
              {errors.basePrice && <span className="field-error">{errors.basePrice.message}</span>}
            </div>
            <div className="field">
              <label>Compare-at price (৳) <span className="optional">(optional)</span></label>
              <input
                {...register('compareAtPrice', { setValueAs: v => v === '' ? '' : Number(v) })}
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
              />
              <span className="field-hint">Shown as the original price (crossed out).</span>
            </div>
          </div>

          <div className="card form-section">
            <h2 className="section-title">Organisation</h2>
            <div className="field">
              <label>Category</label>
              <select {...register('categoryId')} className="select">
                <option value="">Uncategorised</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Tags <span className="optional">(comma-separated)</span></label>
              <input {...register('tags')} placeholder="e.g. summer, cotton, sale" />
            </div>
          </div>
        </div>
      </div>

      {serverError && <div className="alert alert-error">{serverError}</div>}

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => router.push('/dashboard/products')}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
        </button>
      </div>
    </form>
  );
}
