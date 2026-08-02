import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  fetchGlobalCategories,
  fetchProductSpecs,
  fetchSpecTemplate,
  saveProductSpecs,
  saveVariants,
  setGlobalCategory,
  updateProduct,
  uploadProductImage,
  MAX_PRODUCT_IMAGES,
  type Category,
  type GlobalCategoryNode,
  type ProductImage,
  type ProductPayload,
  type SpecField,
  type SpecInput,
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
// Spec values are held as strings so every control is driven the same way.
// Booleans are TRI-STATE — '' | 'yes' | 'no' — because "not set" and "false" are
// genuinely different: the API stores null vs false, and a plain on/off switch
// would silently write `false` onto every product the moment a category is
// picked.
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

// Every field is sent, including empty ones: PUT /specs is a bulk replace, and
// an explicit null is what clears a value the merchant emptied.
function toSpecPayload(fields: SpecField[], values: SpecFormValues): SpecInput[] {
  return fields.map(f => {
    const raw = values[f.id] ?? '';
    if (raw === '') return { specFieldId: f.id, value: null };
    if (f.dataType === 'boolean') return { specFieldId: f.id, value: raw === 'yes' };
    return { specFieldId: f.id, value: raw };
  });
}

/**
 * The API reports the affected spec count inside the 409 message rather than as
 * a field, so read it back out — falling back to what the form already knows if
 * the wording ever changes.
 */
function specCountFromMessage(message: string, fallback: number): number {
  const match = message.match(/\b(\d+)\b/);
  return match ? Number(match[1]) : fallback;
}

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
  const [notice, setNotice] = useState('');

  // ── Marketplace taxonomy ──
  const [globalTree, setGlobalTree] = useState<GlobalCategoryNode[]>([]);
  const [globalCategoryId, setGlobalCategoryId] = useState<string | null>(null);
  // What the server currently holds, so the save can tell whether the selection
  // actually changed and the decline path knows what to revert to.
  const [serverCategoryId, setServerCategoryId] = useState<string | null>(null);
  const [openParentId, setOpenParentId] = useState<string | null>(null);
  const [specFields, setSpecFields] = useState<SpecField[]>([]);
  const [specValues, setSpecValues] = useState<SpecFormValues>({});
  const [specsLoading, setSpecsLoading] = useState(false);

  // The template + values as last loaded from the server, so switching category
  // away and back before saving restores the merchant's entries instead of
  // silently dropping them.
  const loadedSpecs = useRef<{ categoryId: string | null; fields: SpecField[]; values: SpecFormValues } | null>(null);

  const totalImages = images.length + pending.length;
  const imagesBusy = pending.some(p => p.uploading) || deletingId !== null;

  // Required specs are advisory: surfaced live as the merchant types, but never
  // blocking a save — blocking would strand products that predate the template
  // they are now measured against.
  const missingRequired = specFields.filter(f => f.isRequired && !(specValues[f.id] ?? '').trim());
  const openParent = globalTree.find(p => p.id === openParentId) ?? null;

  useEffect(() => {
    fetchCategories().then(res => {
      if (res.success) setCategories(res.data.categories);
    });
    fetchGlobalCategories().then(res => {
      if (res.success) setGlobalTree(res.data.categories);
    });
  }, []);

  // On edit, the marketplace category and its values come from the specs
  // endpoint — GET /products/:id returns neither, and this one call carries the
  // category, the template and the saved values together.
  const loadSpecState = useCallback(async (id: string) => {
    const res = await fetchProductSpecs(id);
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

  // Keeps the leaf row showing the branch the current selection lives in.
  useEffect(() => {
    if (!globalCategoryId || openParentId) return;
    const parent = globalTree.find(p => p.children.some(c => c.id === globalCategoryId));
    if (parent) setOpenParentId(parent.id);
  }, [globalCategoryId, globalTree, openParentId]);

  const chooseGlobalCategory = async (nextId: string | null) => {
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
    const res = await fetchSpecTemplate(nextId);
    setSpecsLoading(false);
    if (res.success) {
      setSpecFields(res.data.specFields);
      setSpecValues({});
    } else {
      setSpecFields([]);
      setError(res.error.message);
    }
  };

  const setSpecValue = (fieldId: string, value: string) =>
    setSpecValues(prev => ({ ...prev, [fieldId]: value }));

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

  /**
   * The category-change gate, surfaced. The API refuses to discard spec values
   * without an explicit acknowledgement (409 SPECS_EXIST); this is that refusal
   * put in front of the merchant. Wrapped in a promise so the save sequence can
   * simply await the answer.
   */
  const confirmClear = (count: number) =>
    new Promise<boolean>(resolve => {
      Alert.alert(
        'Change marketplace category?',
        `${count} specification${count === 1 ? '' : 's'} entered for this product's previous ` +
          `category will be cleared. This can't be undone.\n\n` +
          `The rest of your changes have already been saved.`,
        [
          { text: 'Keep current category', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Change and clear', style: 'destructive', onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) }
      );
    });

  /**
   * Steps 4 and 5 of the save. Both are skipped when nothing about the
   * marketplace category changed, so an ordinary edit costs no extra requests.
   * Returns false when the sequence should stop without leaving the form.
   */
  const finishSave = async (id: string): Promise<boolean> => {
    if (globalCategoryId !== serverCategoryId) {
      let res = await setGlobalCategory(id, globalCategoryId);

      if (!res.success && res.error.code === 'SPECS_EXIST') {
        const known = Object.values(loadedSpecs.current?.values ?? {}).filter(Boolean).length;
        const approved = await confirmClear(specCountFromMessage(res.error.message, known));

        if (!approved) {
          // Declining leaves the product, variants and images saved — those
          // already committed — and puts the picker back to what the server
          // still holds, so the form can never sit in a state the server does
          // not agree with.
          await loadSpecState(id);
          setNotice('Product saved. Marketplace category left unchanged.');
          return false;
        }
        res = await setGlobalCategory(id, globalCategoryId, true);
      }

      if (!res.success) {
        setError(res.error.message);
        return false;
      }
      setServerCategoryId(globalCategoryId);
    }

    if (globalCategoryId && specFields.length > 0) {
      const res = await saveProductSpecs(id, toSpecPayload(specFields, specValues));
      if (!res.success) {
        setError(res.error.message);
        return false;
      }
    }

    return true;
  };

  const onSubmit = async () => {
    setError('');
    setNotice('');

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

    // ── Marketplace category, then specs (C3) ──
    const finished = await finishSave(id);
    setSubmitting(false);
    if (!finished) return;

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

        {/* Marketplace category — the shared, cross-shop taxonomy. Separate from
            the merchant's own category above, which is unchanged. Two chip rows
            rather than one: the taxonomy is two levels, and tapping a top-level
            chip opens its leaves. */}
        <Text style={styles.sectionTitle}>Marketplace category</Text>
        <Text style={styles.hint}>
          Lets shoppers compare this product against similar ones from other shops. Optional.
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Pressable
            style={[styles.chip, globalCategoryId === null && styles.chipActive]}
            onPress={() => {
              setOpenParentId(null);
              chooseGlobalCategory(null);
            }}
          >
            <Text style={[styles.chipText, globalCategoryId === null && styles.chipTextActive]}>
              None
            </Text>
          </Pressable>
          {globalTree.map(parent => {
            // A top-level category with no children is itself a leaf and is
            // picked directly; otherwise the chip just opens its branch.
            const isLeaf = parent.children.length === 0;
            const active = isLeaf ? globalCategoryId === parent.id : openParentId === parent.id;
            return (
              <Pressable
                key={parent.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => {
                  if (isLeaf) {
                    setOpenParentId(null);
                    chooseGlobalCategory(parent.id);
                  } else {
                    setOpenParentId(openParentId === parent.id ? null : parent.id);
                  }
                }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{parent.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {openParent && openParent.children.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {openParent.children.map(leaf => {
              const active = globalCategoryId === leaf.id;
              return (
                <Pressable
                  key={leaf.id}
                  style={[styles.chip, styles.leafChip, active && styles.chipActive]}
                  onPress={() => chooseGlobalCategory(leaf.id)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{leaf.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Specifications — driven by the chosen category's template */}
        {globalCategoryId !== null && (
          <>
            <Text style={styles.sectionTitle}>Specifications</Text>

            {specsLoading ? (
              <Text style={styles.hint}>Loading specifications…</Text>
            ) : specFields.length === 0 ? (
              <Text style={styles.hint}>
                No specification fields defined for this category yet. You can still save the
                product — specifications can be filled in once they are added.
              </Text>
            ) : (
              <>
                <Text style={styles.hint}>
                  These appear when shoppers compare products in this category. Leave any blank.
                </Text>

                {specFields.map(f => {
                  const value = specValues[f.id] ?? '';
                  return (
                    <View key={f.id} style={styles.field}>
                      <Text style={styles.label}>
                        {f.label}
                        {f.unit ? ` (${f.unit})` : ''}
                        {f.isRequired ? ' *' : ''}
                      </Text>

                      {f.dataType === 'boolean' ? (
                        // Three states, not two: "not set" is distinct from "No".
                        <View style={styles.toggle}>
                          {([['', '—'], ['yes', 'Yes'], ['no', 'No']] as const).map(([v, label]) => {
                            const active = value === v;
                            return (
                              <Pressable
                                key={v || 'unset'}
                                style={[styles.toggleBtn, active && styles.toggleBtnActive]}
                                onPress={() => setSpecValue(f.id, v)}
                              >
                                <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                                  {label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : f.dataType === 'enum' ? (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.chips}
                        >
                          {['', ...f.options].map(o => {
                            const active = value === o;
                            return (
                              <Pressable
                                key={o || 'unset'}
                                style={[styles.chip, active && styles.chipActive]}
                                onPress={() => setSpecValue(f.id, o)}
                              >
                                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                  {o === '' ? '—' : o}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      ) : (
                        <TextInput
                          style={styles.input}
                          value={value}
                          onChangeText={t => setSpecValue(f.id, t)}
                          keyboardType={f.dataType === 'number' ? 'numeric' : 'default'}
                          placeholder={f.dataType === 'number' ? '0' : ''}
                          placeholderTextColor="#9ca3af"
                          autoCapitalize={f.dataType === 'number' ? 'none' : 'sentences'}
                        />
                      )}
                    </View>
                  );
                })}

                {missingRequired.length > 0 && (
                  <Text style={styles.warn}>
                    Recommended but empty: {missingRequired.map(f => f.label).join(', ')}. You can
                    still save.
                  </Text>
                )}
              </>
            )}
          </>
        )}

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
        {notice !== '' && <Text style={styles.notice}>{notice}</Text>}

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
  // Second row of the marketplace picker — indented so the leaves read as
  // belonging to the top-level chip opened above them.
  leafChip: { marginLeft: 0, backgroundColor: '#f9fafb' },

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
  notice: { fontSize: 14, fontWeight: '600', color: '#047857', marginTop: 16 },
  warn: { fontSize: 13, color: '#b45309', marginTop: 10, lineHeight: 18 },

  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' },
  cancelText: { color: '#374151', fontSize: 16, fontWeight: '700' },
  saveBtn: { backgroundColor: '#0f172a' },
  saveText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
