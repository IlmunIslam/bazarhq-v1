import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  openAppSettings,
  pickFromLibrary,
  takePhoto,
  type PickedAsset,
  type PickOutcome,
} from '@/lib/image-picker';
import {
  createProduct,
  deleteProductImage,
  fetchCategories,
  saveVariants,
  updateProduct,
  uploadProductImage,
  MAX_PRODUCT_IMAGES,
  type Category,
  type ProductImage,
  type ProductPayload,
  type VariantInput,
} from '@/lib/products-api';

// Shared create/edit product form (Merchant tab, B1 + B2). Same data model as
// the web ProductForm: product fields via POST/PATCH /products, then — only
// when there's ≥1 variant — the whole variant set via POST
// /products/:id/variants (which replaces all variants).
//
// Images (B2) are a separate resource and can only be attached to a product
// that already exists, since the endpoint is POST /products/:id/images. The web
// dashboard resolves that by refusing to show the image picker until the
// product is saved. On a phone that round trip is hostile, so instead images
// picked before the first save are held locally as `pending` and uploaded right
// after the product is created — see onSubmit.

export interface VariantDraft {
  name: string;
  price: string;
  stock: string;
  sku: string;
}

export interface ProductFormDefaults {
  name: string;
  description: string;
  basePrice: string;
  compareAtPrice: string;
  categoryId: string | null;
  status: 'draft' | 'active';
  tags: string;
  variants: VariantDraft[];
  images: ProductImage[];
}

// A device photo that is not on the server yet: either waiting for the product
// to be created, currently uploading, or left over from a failed upload (which
// the merchant can retry or discard). Keyed by `asset.uri` — the picker writes
// each pick to its own cache path, so it is unique.
interface PendingImage {
  asset: PickedAsset;
  uploading: boolean;
}

const EMPTY: ProductFormDefaults = {
  name: '',
  description: '',
  basePrice: '',
  compareAtPrice: '',
  categoryId: null,
  status: 'draft',
  tags: '',
  variants: [],
  images: [],
};

export default function ProductForm({
  productId,
  defaultValues,
}: {
  productId?: string;
  defaultValues?: ProductFormDefaults;
}) {
  const router = useRouter();
  const initial = defaultValues ?? EMPTY;

  // Tracks the product's server id. Starts as `productId` when editing, and is
  // filled in once a new product is created — so if a later step (variants or
  // an image upload) fails, tapping save again PATCHes the product that now
  // exists instead of creating a duplicate.
  const [savedId, setSavedId] = useState<string | undefined>(productId);
  const isEdit = !!savedId;

  const [categories, setCategories] = useState<Category[]>([]);

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [basePrice, setBasePrice] = useState(initial.basePrice);
  const [compareAtPrice, setCompareAtPrice] = useState(initial.compareAtPrice);
  const [categoryId, setCategoryId] = useState<string | null>(initial.categoryId);
  const [status, setStatus] = useState<'draft' | 'active'>(initial.status);
  const [tags, setTags] = useState(initial.tags);
  const [variants, setVariants] = useState<VariantDraft[]>(initial.variants);

  const [images, setImages] = useState<ProductImage[]>(initial.images);
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [imageError, setImageError] = useState('');
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const totalImages = images.length + pending.length;
  const imagesBusy = pending.some(p => p.uploading) || deletingId !== null;

  useEffect(() => {
    fetchCategories().then(res => {
      if (res.success) setCategories(res.data.categories);
    });
  }, []);

  const setVariant = (i: number, patch: Partial<VariantDraft>) =>
    setVariants(prev => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  const addVariant = () =>
    setVariants(prev => [...prev, { name: '', price: '', stock: '', sku: '' }]);
  const removeVariant = (i: number) =>
    setVariants(prev => prev.filter((_, idx) => idx !== i));

  // ── Images ──────────────────────────────────────────────────────────────────

  const setPendingUploading = (uri: string, uploading: boolean) =>
    setPending(prev => prev.map(p => (p.asset.uri === uri ? { ...p, uploading } : p)));

  /** Uploads one already-picked asset against a known product id. */
  const uploadPending = async (id: string, asset: PickedAsset) => {
    setPendingUploading(asset.uri, true);
    const res = await uploadProductImage(id, asset);
    if (res.success) {
      setImages(prev => [...prev, res.data.image]);
      setPending(prev => prev.filter(p => p.asset.uri !== asset.uri));
      return true;
    }
    // Leave the tile in place, no longer spinning, so it can be retried or removed.
    setPendingUploading(asset.uri, false);
    setImageError(res.error.message);
    return false;
  };

  const handlePicked = async (outcome: PickOutcome) => {
    if (outcome.status === 'cancelled') return;
    if (outcome.status === 'denied') {
      setPermissionBlocked(outcome.blocked);
      setImageError(outcome.message);
      return;
    }

    setImageError('');
    setPermissionBlocked(false);
    setPending(prev => [...prev, { asset: outcome.asset, uploading: false }]);

    // Editing an existing product: upload straight away. Creating a new one:
    // hold it until the product exists (onSubmit picks it up).
    if (savedId) await uploadPending(savedId, outcome.asset);
  };

  const addImage = () => {
    if (totalImages >= MAX_PRODUCT_IMAGES) {
      setImageError(`Maximum ${MAX_PRODUCT_IMAGES} images per product.`);
      return;
    }
    Alert.alert('Add photo', 'Where should the photo come from?', [
      { text: 'Take photo', onPress: () => void takePhoto().then(handlePicked) },
      { text: 'Choose from library', onPress: () => void pickFromLibrary().then(handlePicked) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const removeImage = async (image: ProductImage) => {
    if (!savedId) return;
    setImageError('');
    setDeletingId(image.id);
    const res = await deleteProductImage(savedId, image.id);
    setDeletingId(null);
    if (res.success) setImages(prev => prev.filter(i => i.id !== image.id));
    else setImageError(res.error.message);
  };

  const removePending = (uri: string) => {
    setImageError('');
    setPending(prev => prev.filter(p => p.asset.uri !== uri));
  };

  const onSubmit = async () => {
    setError('');

    // ── Validate ──
    if (!name.trim()) return setError('Product name is required.');
    const priceNum = Number(basePrice);
    if (!basePrice.trim() || Number.isNaN(priceNum) || priceNum <= 0) {
      return setError('Enter a valid price greater than 0.');
    }
    let compareNum: number | undefined;
    if (compareAtPrice.trim()) {
      compareNum = Number(compareAtPrice);
      if (Number.isNaN(compareNum) || compareNum <= 0) return setError('Compare-at price must be a positive number.');
    }
    const variantInputs: VariantInput[] = [];
    for (const v of variants) {
      if (!v.name.trim()) return setError('Every variant needs a name.');
      const vp = Number(v.price);
      const vs = Number(v.stock);
      if (Number.isNaN(vp) || vp <= 0) return setError(`Variant "${v.name}" needs a valid price.`);
      if (Number.isNaN(vs) || vs < 0 || !Number.isInteger(vs)) return setError(`Variant "${v.name}" needs a valid stock count.`);
      variantInputs.push({ name: v.name.trim(), price: vp, stock: vs, sku: v.sku.trim() || undefined });
    }

    const payload: ProductPayload = {
      name: name.trim(),
      description: description.trim() || undefined,
      basePrice: priceNum,
      compareAtPrice: compareNum,
      categoryId: categoryId ?? undefined,
      status,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    };

    setSubmitting(true);

    // ── Save product ──
    let id = savedId;
    if (id) {
      const res = await updateProduct(id, payload);
      if (!res.success) { setError(res.error.message); setSubmitting(false); return; }
    } else {
      const res = await createProduct(payload);
      if (!res.success) { setError(res.error.message); setSubmitting(false); return; }
      id = res.data.product.id;
      setSavedId(id);
    }

    // ── Save variants (only when present; replaces the whole set) ──
    if (variantInputs.length > 0) {
      const vRes = await saveVariants(id, variantInputs);
      if (!vRes.success) { setError(vRes.error.message); setSubmitting(false); return; }
    }

    // ── Upload images picked before the product existed ──
    // Sequential, mirroring the web form's upload loop. On failure we stop and
    // stay on the form: the product itself is already saved, and `savedId` is
    // now set, so the merchant can retry the image without duplicating it.
    for (const p of pending) {
      const uploaded = await uploadPending(id, p.asset);
      if (!uploaded) {
        setError('Product saved, but an image failed to upload. Retry it below, or leave and add it later.');
        setSubmitting(false);
        return;
      }
    }

    setSubmitting(false);
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Details */}
        <Text style={styles.sectionTitle}>Details</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Product name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Cotton T-Shirt"
            placeholderTextColor="#9ca3af"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe your product…"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Pricing */}
        <Text style={styles.sectionTitle}>Pricing</Text>
        <View style={styles.row}>
          <View style={[styles.field, styles.flex1]}>
            <Text style={styles.label}>Price (৳) *</Text>
            <TextInput
              style={styles.input}
              value={basePrice}
              onChangeText={setBasePrice}
              placeholder="0.00"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
            />
          </View>
          <View style={[styles.field, styles.flex1]}>
            <Text style={styles.label}>Compare-at (৳)</Text>
            <TextInput
              style={styles.input}
              value={compareAtPrice}
              onChangeText={setCompareAtPrice}
              placeholder="Optional"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        {/* Status */}
        <Text style={styles.sectionTitle}>Status</Text>
        <View style={styles.toggle}>
          {(['draft', 'active'] as const).map(s => {
            const active = status === s;
            return (
              <Pressable
                key={s}
                style={[styles.toggleBtn, active && styles.toggleBtnActive]}
                onPress={() => setStatus(s)}
              >
                <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                  {s === 'draft' ? 'Draft' : 'Active'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>Only active products appear in your store.</Text>

        {/* Category */}
        <Text style={styles.sectionTitle}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {[{ id: '', name: 'Uncategorised' }, ...categories].map(c => {
            const selected = (c.id === '' && categoryId === null) || categoryId === c.id;
            return (
              <Pressable
                key={c.id || 'none'}
                style={[styles.chip, selected && styles.chipActive]}
                onPress={() => setCategoryId(c.id === '' ? null : c.id)}
              >
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>{c.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.field}>
          <Text style={styles.label}>Tags (comma-separated)</Text>
          <TextInput
            style={styles.input}
            value={tags}
            onChangeText={setTags}
            placeholder="e.g. summer, cotton, sale"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
          />
        </View>

        {/* Variants */}
        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionTitle}>Variants</Text>
          <Pressable onPress={addVariant} hitSlop={8}>
            <Text style={styles.addLink}>+ Add variant</Text>
          </Pressable>
        </View>
        {variants.length === 0 ? (
          <Text style={styles.hint}>
            Add variants for products with options (size, colour…). Stock is then tracked per variant.
          </Text>
        ) : (
          variants.map((v, i) => (
            <View key={i} style={styles.variantCard}>
              <View style={styles.variantHead}>
                <Text style={styles.variantIndex}>Variant {i + 1}</Text>
                <Pressable onPress={() => removeVariant(i)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color="#b91c1c" />
                </Pressable>
              </View>
              <TextInput
                style={styles.input}
                value={v.name}
                onChangeText={t => setVariant(i, { name: t })}
                placeholder="Name — e.g. Red / Large"
                placeholderTextColor="#9ca3af"
              />
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.flex1]}
                  value={v.price}
                  onChangeText={t => setVariant(i, { price: t })}
                  placeholder="Price ৳"
                  placeholderTextColor="#9ca3af"
                  keyboardType="decimal-pad"
                />
                <TextInput
                  style={[styles.input, styles.flex1]}
                  value={v.stock}
                  onChangeText={t => setVariant(i, { stock: t })}
                  placeholder="Stock"
                  placeholderTextColor="#9ca3af"
                  keyboardType="number-pad"
                />
              </View>
              <TextInput
                style={styles.input}
                value={v.sku}
                onChangeText={t => setVariant(i, { sku: t })}
                placeholder="SKU (optional)"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
              />
            </View>
          ))
        )}

        {/* Images */}
        <Text style={styles.sectionTitle}>Images</Text>
        <View style={styles.imageGrid}>
          {images.map((img, i) => {
            const deleting = deletingId === img.id;
            return (
              <View key={img.id} style={styles.imageTile}>
                <Image source={img.url} style={styles.imageThumb} contentFit="cover" transition={120} />
                {i === 0 && (
                  <View style={styles.primaryBadge}>
                    <Text style={styles.primaryBadgeText}>Primary</Text>
                  </View>
                )}
                {deleting ? (
                  <View style={styles.tileOverlay}>
                    <ActivityIndicator color="#ffffff" />
                  </View>
                ) : (
                  <Pressable
                    style={styles.tileRemove}
                    onPress={() => removeImage(img)}
                    disabled={imagesBusy || submitting}
                    hitSlop={6}
                  >
                    <Ionicons name="close" size={14} color="#ffffff" />
                  </Pressable>
                )}
              </View>
            );
          })}

          {pending.map(p => {
            // Not on the server yet. While `uploading`, it shows progress; when
            // it has stopped and the product already exists, the upload failed
            // and tapping the tile retries it.
            const canRetry = !p.uploading && !!savedId;
            return (
              <Pressable
                key={p.asset.uri}
                style={styles.imageTile}
                onPress={() => canRetry && savedId && uploadPending(savedId, p.asset)}
                disabled={!canRetry || submitting}
              >
                <Image source={p.asset.uri} style={styles.imageThumb} contentFit="cover" transition={120} />
                {p.uploading ? (
                  <View style={styles.tileOverlay}>
                    <ActivityIndicator color="#ffffff" />
                    <Text style={styles.tileOverlayText}>Uploading…</Text>
                  </View>
                ) : (
                  <>
                    {canRetry ? (
                      <View style={[styles.tileOverlay, styles.tileOverlayFailed]}>
                        <Ionicons name="refresh" size={18} color="#ffffff" />
                        <Text style={styles.tileOverlayText}>Retry</Text>
                      </View>
                    ) : (
                      <View style={styles.pendingBadge}>
                        <Text style={styles.pendingBadgeText}>Pending</Text>
                      </View>
                    )}
                    <Pressable
                      style={styles.tileRemove}
                      onPress={() => removePending(p.asset.uri)}
                      disabled={submitting}
                      hitSlop={6}
                    >
                      <Ionicons name="close" size={14} color="#ffffff" />
                    </Pressable>
                  </>
                )}
              </Pressable>
            );
          })}

          {totalImages < MAX_PRODUCT_IMAGES && (
            <Pressable
              style={[styles.imageTile, styles.addTile, (imagesBusy || submitting) && styles.disabled]}
              onPress={addImage}
              disabled={imagesBusy || submitting}
            >
              <Ionicons name="camera-outline" size={22} color="#6b7280" />
              <Text style={styles.addTileText}>Add photo</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.hint}>
          {totalImages}/{MAX_PRODUCT_IMAGES} images. The first photo is the primary one shoppers see.
          {!savedId && totalImages > 0 ? ' Photos upload when you create the product.' : ''}
        </Text>

        {imageError !== '' && (
          <View style={styles.imageErrorRow}>
            <Text style={styles.error}>{imageError}</Text>
            {permissionBlocked && (
              <Pressable onPress={openAppSettings} hitSlop={8}>
                <Text style={styles.settingsLink}>Open Settings</Text>
              </Pressable>
            )}
          </View>
        )}

        {error !== '' && <Text style={styles.error}>{error}</Text>}

        <View style={styles.actions}>
          <Pressable style={[styles.btn, styles.cancelBtn]} onPress={() => router.back()} disabled={submitting}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.saveBtn, submitting && styles.disabled]} onPress={onSubmit} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.saveText}>{isEdit ? 'Save changes' : 'Create product'}</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 20, paddingBottom: 48, gap: 4 },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 10 },
  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 10 },
  addLink: { fontSize: 14, fontWeight: '700', color: '#0f172a' },

  field: { gap: 6, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fafafa',
    marginBottom: 8,
  },
  textarea: { minHeight: 96, marginBottom: 0 },
  row: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },

  toggle: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 999, padding: 3, alignSelf: 'flex-start' },
  toggleBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999 },
  toggleBtnActive: { backgroundColor: '#ffffff' },
  toggleText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  toggleTextActive: { color: '#0f172a' },
  hint: { fontSize: 13, color: '#6b7280', marginTop: 8, lineHeight: 18 },

  chips: { gap: 8, paddingBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  chipActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#ffffff' },

  variantCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#fafafa',
  },
  variantHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  variantIndex: { fontSize: 13, fontWeight: '700', color: '#374151' },

  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  imageTile: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  imageThumb: { width: '100%', height: '100%' },
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#d1d5db',
    backgroundColor: '#fafafa',
  },
  addTileText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },

  tileOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(15,23,42,0.55)',
  },
  tileOverlayFailed: { backgroundColor: 'rgba(185,28,28,0.65)' },
  tileOverlayText: { fontSize: 11, fontWeight: '700', color: '#ffffff' },

  tileRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.7)',
  },
  primaryBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(15,23,42,0.75)',
  },
  primaryBadgeText: { fontSize: 10, fontWeight: '700', color: '#ffffff' },
  pendingBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(217,119,6,0.9)',
  },
  pendingBadgeText: { fontSize: 10, fontWeight: '700', color: '#ffffff' },

  imageErrorRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  settingsLink: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginTop: 16, textDecorationLine: 'underline' },

  error: { fontSize: 14, fontWeight: '600', color: '#b91c1c', marginTop: 16 },

  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' },
  cancelText: { color: '#374151', fontSize: 16, fontWeight: '700' },
  saveBtn: { backgroundColor: '#0f172a' },
  saveText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
