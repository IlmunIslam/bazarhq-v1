import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
  createProduct,
  fetchCategories,
  saveVariants,
  updateProduct,
  type Category,
  type ProductPayload,
  type VariantInput,
} from '@/lib/products-api';

// Shared create/edit product form (Merchant tab, B1). Same data model as the
// web ProductForm: product fields via POST/PATCH /products, then — only when
// there's ≥1 variant — the whole variant set via POST /products/:id/variants
// (which replaces all variants). Images are deliberately out of scope for B1
// (a note stands in); B2 adds device upload via the separate images endpoint.

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
};

export default function ProductForm({
  productId,
  defaultValues,
}: {
  productId?: string;
  defaultValues?: ProductFormDefaults;
}) {
  const router = useRouter();
  const isEdit = !!productId;
  const initial = defaultValues ?? EMPTY;

  const [categories, setCategories] = useState<Category[]>([]);

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [basePrice, setBasePrice] = useState(initial.basePrice);
  const [compareAtPrice, setCompareAtPrice] = useState(initial.compareAtPrice);
  const [categoryId, setCategoryId] = useState<string | null>(initial.categoryId);
  const [status, setStatus] = useState<'draft' | 'active'>(initial.status);
  const [tags, setTags] = useState(initial.tags);
  const [variants, setVariants] = useState<VariantDraft[]>(initial.variants);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
    let savedId = productId;
    if (isEdit && productId) {
      const res = await updateProduct(productId, payload);
      if (!res.success) { setError(res.error.message); setSubmitting(false); return; }
    } else {
      const res = await createProduct(payload);
      if (!res.success) { setError(res.error.message); setSubmitting(false); return; }
      savedId = res.data.product.id;
    }

    // ── Save variants (only when present; replaces the whole set) ──
    if (savedId && variantInputs.length > 0) {
      const vRes = await saveVariants(savedId, variantInputs);
      if (!vRes.success) { setError(vRes.error.message); setSubmitting(false); return; }
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

        {/* Images — deferred to B2 */}
        <Text style={styles.sectionTitle}>Images</Text>
        <View style={styles.imageNote}>
          <Ionicons name="image-outline" size={18} color="#6b7280" />
          <Text style={styles.imageNoteText}>
            Photo upload from your device is coming next. For now, add images from the web dashboard.
          </Text>
        </View>

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

  imageNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#fafafa',
  },
  imageNoteText: { flexShrink: 1, fontSize: 13, color: '#6b7280', lineHeight: 18 },

  error: { fontSize: 14, fontWeight: '600', color: '#b91c1c', marginTop: 16 },

  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' },
  cancelText: { color: '#374151', fontSize: 16, fontWeight: '700' },
  saveBtn: { backgroundColor: '#0f172a' },
  saveText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
