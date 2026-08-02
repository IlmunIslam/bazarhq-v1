'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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

// ─── Marketplace taxonomy (Sprint C3) ─────────────────────────────────────────
//
// The global marketplace category is entirely separate from `categoryId` above,
// which stays the merchant's own per-shop category for their storefront. This
// one is the shared vocabulary that makes products comparable across shops.

type SpecDataType = 'text' | 'number' | 'boolean' | 'enum';

interface GlobalCategoryNode {
  id: string;
  slug: string;
  name: string;
  specFieldCount: number;
  children: GlobalCategoryNode[];
}

interface SpecField {
  id: string;
  key: string;
  label: string;
  unit: string | null;
  dataType: SpecDataType;
  options: string[];
  isRequired: boolean;
}

interface SpecState {
  globalCategory: { id: string; name: string } | null;
  specFields: SpecField[];
  values: Record<string, string | boolean>;
}

// Form values are held as strings so every input is controlled the same way.
// Booleans are TRI-STATE — '' | 'yes' | 'no' — because "not set" and "false" are
// genuinely different: the API stores null vs false, and a plain checkbox would
// silently write `false` onto every product the moment a category is picked.
type SpecFormValues = Record<string, string>;

function toFormValues(fields: SpecField[], values: Record<string, string | boolean>): SpecFormValues {
  const out: SpecFormValues = {};
  for (const f of fields) {
    const v = values[f.id];
    if (v === undefined) out[f.id] = '';
    else if (f.dataType === 'boolean') out[f.id] = v === true ? 'yes' : 'no';
    else out[f.id] = String(v);
  }
  return out;
}

// Every field is sent, including the empty ones: PUT /specs is a bulk replace,
// and an explicit null is what clears a value the merchant emptied.
function toSpecPayload(fields: SpecField[], values: SpecFormValues) {
  return fields.map(f => {
    const raw = values[f.id] ?? '';
    if (raw === '') return { specFieldId: f.id, value: null };
    if (f.dataType === 'boolean') return { specFieldId: f.id, value: raw === 'yes' };
    return { specFieldId: f.id, value: raw };
  });
}

/**
 * The API reports the affected spec count inside the 409 message rather than as
 * a field, so read it back out — falling back to what the form itself knows if
 * the wording ever changes.
 */
function specCountFromMessage(message: string, fallback: number): number {
  const match = message.match(/\b(\d+)\b/);
  return match ? Number(match[1]) : fallback;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProductForm({ productId, defaultValues }: ProductFormProps) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [images, setImages] = useState<ProductImage[]>(defaultValues?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Tracks the product's server id. Starts as `productId` when editing and is
  // filled in once a new product is created — so if a later step (variants,
  // marketplace category, specs) fails, submitting again UPDATES the product
  // that now exists instead of creating a duplicate. Same approach the mobile
  // form already uses; C3 adds two more post-create steps, which is what makes
  // holding this in state rather than a local matter.
  const [savedId, setSavedId] = useState<string | undefined>(productId);
  const isEdit = !!savedId;

  // ── Marketplace taxonomy state ──
  const [globalTree, setGlobalTree] = useState<GlobalCategoryNode[]>([]);
  const [globalCategoryId, setGlobalCategoryId] = useState<string | null>(null);
  // What the server currently holds, so the save can tell whether the selection
  // actually changed and the cancel path knows what to revert to.
  const [serverCategoryId, setServerCategoryId] = useState<string | null>(null);
  const [specFields, setSpecFields] = useState<SpecField[]>([]);
  const [specValues, setSpecValues] = useState<SpecFormValues>({});
  const [specsLoading, setSpecsLoading] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{ id: string; count: number } | null>(null);

  // The template + values as last loaded from the server, so switching category
  // away and back before saving restores the merchant's entries instead of
  // silently dropping them.
  const loadedSpecs = useRef<{ categoryId: string | null; fields: SpecField[]; values: SpecFormValues } | null>(null);

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
    api.get<{ categories: GlobalCategoryNode[] }>('/categories').then(res => {
      if (res.success) setGlobalTree(res.data.categories);
    });
  }, []);

  // On edit, the marketplace category and its values come from C2's endpoint —
  // GET /products/:id returns neither, and this one call carries the category,
  // the template and the saved values together.
  const loadSpecState = useCallback(async (id: string) => {
    const res = await api.get<SpecState>(`/products/${id}/specs`);
    if (!res.success) return;
    const { globalCategory, specFields: fields, values } = res.data;
    const catId = globalCategory?.id ?? null;
    const formValues = toFormValues(fields, values);
    setServerCategoryId(catId);
    setGlobalCategoryId(catId);
    setSpecFields(fields);
    setSpecValues(formValues);
    loadedSpecs.current = { categoryId: catId, fields, values: formValues };
  }, []);

  useEffect(() => {
    if (productId) loadSpecState(productId);
  }, [productId, loadSpecState]);

  const handleGlobalCategoryChange = async (nextValue: string) => {
    const nextId = nextValue || null;
    setGlobalCategoryId(nextId);
    setNotice('');

    if (!nextId) {
      setSpecFields([]);
      setSpecValues({});
      return;
    }

    // Returning to the category this product was loaded with restores what the
    // merchant had, rather than making them retype it.
    const loaded = loadedSpecs.current;
    if (loaded && loaded.categoryId === nextId) {
      setSpecFields(loaded.fields);
      setSpecValues(loaded.values);
      return;
    }

    setSpecsLoading(true);
    const res = await api.get<{ specFields: SpecField[] }>(`/categories/${nextId}/spec-fields`);
    setSpecsLoading(false);
    if (res.success) {
      setSpecFields(res.data.specFields);
      setSpecValues({});
    } else {
      setSpecFields([]);
      setServerError(res.error.message);
    }
  };

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

  /**
   * Steps 3 and 4 of the save, plus the exit — factored out so the confirmation
   * dialog can resume the sequence after the merchant approves clearing specs.
   *
   * Both steps are skipped when nothing about the marketplace category changed,
   * so an ordinary edit costs no extra requests.
   */
  const finishSave = async (id: string, clearSpecs: boolean): Promise<void> => {
    if (globalCategoryId !== serverCategoryId) {
      const res = await api.put<unknown>(`/products/${id}/global-category`, {
        globalCategoryId,
        ...(clearSpecs ? { clearSpecs: true } : {}),
      });
      if (!res.success) {
        // The API refuses to discard specs without explicit confirmation. This
        // is where that gate becomes visible to the merchant.
        if (res.error.code === 'SPECS_EXIST') {
          const known = Object.values(loadedSpecs.current?.values ?? {}).filter(Boolean).length;
          setPendingConfirm({ id, count: specCountFromMessage(res.error.message, known) });
          return;
        }
        setServerError(res.error.message);
        return;
      }
      setServerCategoryId(globalCategoryId);
    }

    if (globalCategoryId && specFields.length > 0) {
      const res = await api.put<unknown>(`/products/${id}/specs`, {
        specs: toSpecPayload(specFields, specValues),
      });
      if (!res.success) {
        setServerError(res.error.message);
        return;
      }
    }

    router.push('/dashboard/products');
  };

  const confirmCategoryChange = async () => {
    const pending = pendingConfirm;
    if (!pending) return;
    setPendingConfirm(null);
    setFinishing(true);
    await finishSave(pending.id, true);
    setFinishing(false);
  };

  /**
   * Declining leaves the product and variants saved — those already committed —
   * and puts the category picker back to what the server still holds, so the
   * form can never sit in a state the server does not agree with.
   */
  const cancelCategoryChange = async () => {
    const pending = pendingConfirm;
    if (!pending) return;
    setPendingConfirm(null);
    setFinishing(true);
    await loadSpecState(pending.id);
    setFinishing(false);
    setNotice('Product saved. Marketplace category left unchanged.');
  };

  const onSubmit = async (data: FormData) => {
    setServerError('');
    setNotice('');
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

    let id = savedId;

    if (id) {
      const res = await api.patch<{ product: { id: string } }>(`/products/${id}`, payload);
      if (!res.success) { setServerError(res.error.message); return; }
    } else {
      const res = await api.post<{ product: { id: string } }>('/products', payload);
      if (!res.success) { setServerError(res.error.message); return; }
      id = res.data.product.id;
      // Recorded before the later steps run: if one of them fails, submitting
      // again must update this product rather than create a second one.
      setSavedId(id);
    }

    // Save variants if any
    if (data.variants && data.variants.length > 0) {
      const vRes = await api.post(`/products/${id}/variants`, { variants: data.variants });
      if (!vRes.success) { setServerError((vRes as { error: { message: string } }).error.message); return; }
    }

    await finishSave(id, false);
  };

  const hasVariants = watch('variants')?.length ? watch('variants')!.length > 0 : false;

  // Required specs are advisory: they are surfaced live as the merchant types,
  // but never block a save — blocking would strand products that predate the
  // template they are now measured against.
  const missingRequired = specFields.filter(f => f.isRequired && !(specValues[f.id] ?? '').trim());

  const selectedCategoryName = globalCategoryId
    ? globalTree.flatMap(p => [p, ...p.children]).find(c => c.id === globalCategoryId)?.name ?? null
    : null;

  const setSpecValue = (fieldId: string, value: string) =>
    setSpecValues(prev => ({ ...prev, [fieldId]: value }));

  const busy = isSubmitting || finishing;

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

          {/* Specifications — driven by the marketplace category's template */}
          {globalCategoryId && (
            <div className="card form-section">
              <div className="section-header">
                <h2 className="section-title">Specifications</h2>
                {selectedCategoryName && (
                  <span className="text-muted text-sm">{selectedCategoryName}</span>
                )}
              </div>

              {specsLoading ? (
                <p className="text-muted text-sm">Loading specifications…</p>
              ) : specFields.length === 0 ? (
                <p className="text-muted text-sm">
                  No specification fields defined for this category yet. You can still save the
                  product — specifications can be filled in once they are added.
                </p>
              ) : (
                <>
                  <p className="text-muted text-sm" style={{ marginBottom: '0.875rem' }}>
                    These appear when shoppers compare products in this category. Leave any blank.
                  </p>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '0 1rem',
                    }}
                  >
                    {specFields.map(f => {
                      const value = specValues[f.id] ?? '';
                      const label = (
                        <label>
                          {f.label}
                          {f.unit && <span className="optional"> ({f.unit})</span>}
                          {f.isRequired && <span className="text-error"> *</span>}
                        </label>
                      );

                      if (f.dataType === 'boolean') {
                        return (
                          <div className="field" key={f.id}>
                            {label}
                            <select
                              className="select"
                              value={value}
                              onChange={e => setSpecValue(f.id, e.target.value)}
                            >
                              {/* "Not set" is a real state, distinct from "No" */}
                              <option value="">—</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                          </div>
                        );
                      }

                      if (f.dataType === 'enum') {
                        return (
                          <div className="field" key={f.id}>
                            {label}
                            <select
                              className="select"
                              value={value}
                              onChange={e => setSpecValue(f.id, e.target.value)}
                            >
                              <option value="">—</option>
                              {f.options.map(o => (
                                <option key={o} value={o}>{o}</option>
                              ))}
                            </select>
                          </div>
                        );
                      }

                      return (
                        <div className="field" key={f.id}>
                          {label}
                          <input
                            type={f.dataType === 'number' ? 'number' : 'text'}
                            step={f.dataType === 'number' ? 'any' : undefined}
                            value={value}
                            onChange={e => setSpecValue(f.id, e.target.value)}
                            placeholder={f.dataType === 'number' ? '0' : ''}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {missingRequired.length > 0 && (
                    <p className="text-sm" style={{ color: 'var(--color-warning, #b45309)' }}>
                      Recommended but empty: {missingRequired.map(f => f.label).join(', ')}. You can
                      still save.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
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

          {/* Marketplace — the shared, cross-shop taxonomy. Separate from the
              merchant's own category above, which is unchanged. */}
          <div className="card form-section">
            <h2 className="section-title">Marketplace</h2>
            <div className="field">
              <label>Category <span className="optional">(optional)</span></label>
              <select
                className="select"
                value={globalCategoryId ?? ''}
                onChange={e => handleGlobalCategoryChange(e.target.value)}
              >
                <option value="">— None —</option>
                {globalTree.map(parent =>
                  // A top-level category with no children is itself a leaf and
                  // can be picked directly; otherwise only its leaves can.
                  parent.children.length > 0 ? (
                    <optgroup key={parent.id} label={parent.name}>
                      {parent.children.map(leaf => (
                        <option key={leaf.id} value={leaf.id}>{leaf.name}</option>
                      ))}
                    </optgroup>
                  ) : (
                    <option key={parent.id} value={parent.id}>{parent.name}</option>
                  )
                )}
              </select>
              <span className="field-hint">
                Lets shoppers compare this product against similar ones from other shops.
              </span>
            </div>
          </div>
        </div>
      </div>

      {serverError && <div className="alert alert-error">{serverError}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => router.push('/dashboard/products')}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
        </button>
      </div>

      {/* Category-change confirmation. The API refuses to discard spec values
          without an explicit acknowledgement (409 SPECS_EXIST); this is that
          refusal surfaced to the merchant. */}
      {pendingConfirm && (
        <div className="modal-overlay" onClick={cancelCategoryChange}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Change marketplace category?</h2>
            <p className="text-sm">
              {pendingConfirm.count} specification{pendingConfirm.count === 1 ? '' : 's'} entered for
              this product&apos;s previous category will be cleared. This can&apos;t be undone.
            </p>
            <p className="text-muted text-sm" style={{ marginTop: '0.5rem' }}>
              The rest of your changes have already been saved.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={cancelCategoryChange}>
                Keep current category
              </button>
              <button type="button" className="btn btn-danger" onClick={confirmCategoryChange}>
                Change and clear
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
