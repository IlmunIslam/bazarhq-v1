import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

import Skeleton from '@/components/Skeleton';
import {
  createCategory,
  fetchAdminCategories,
  retireCategory,
  updateCategory,
  type AdminCategory,
} from '@/lib/admin-api';

// Taxonomy — mirrors the web panel's /superadmin/taxonomy. The shared
// marketplace vocabulary: two levels deep, with spec templates hanging off the
// leaves that products are actually tagged with.
//
// Retiring never destroys: products keep their category and any spec values are
// preserved, so the action is fully reversible via Restore.

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

interface FormState {
  name: string;
  slug: string;
  parentId: string | null;
}

const BLANK: FormState = { name: '', slug: '', parentId: null };

export default function AdminTaxonomyScreen() {
  const router = useRouter();

  const [tree, setTree] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(BLANK);
  const [slugTouched, setSlugTouched] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const res = await fetchAdminCategories();
    if (res.success) setTree(res.data.categories);
    else setError(res.error.message);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Only a top-level category with no spec fields of its own can take children —
  // spec templates belong to leaves, so the API refuses other combinations.
  const parentOptions = tree.filter(c => c.specFieldCount === 0);

  const openCreate = () => {
    setForm(BLANK);
    setSlugTouched(false);
    setFormError('');
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (c: AdminCategory) => {
    setForm({ name: c.name, slug: c.slug, parentId: c.parentId });
    setSlugTouched(true);
    setFormError('');
    setEditingId(c.id);
    setShowForm(true);
  };

  const submit = async () => {
    const name = form.name.trim();
    const slug = (form.slug || slugify(form.name)).trim();
    if (!name) return setFormError('Name is required.');
    if (!slug) return setFormError('Slug is required.');

    setSaving(true);
    setFormError('');
    const res = editingId
      ? await updateCategory(editingId, { name, slug, parentId: form.parentId })
      : await createCategory({ name, slug, parentId: form.parentId, sortOrder: 0 });
    setSaving(false);

    if (res.success) {
      setShowForm(false);
      setEditingId(null);
      setForm(BLANK);
      setLoading(true);
      load();
    } else {
      setFormError(res.error.message);
    }
  };

  const confirmRetire = (c: AdminCategory) => {
    const affected: string[] = [];
    if (c.productCount > 0) {
      affected.push(`${c.productCount} product${c.productCount === 1 ? '' : 's'} tagged to it`);
    }
    if (c.childCount > 0) {
      affected.push(`${c.childCount} sub-categor${c.childCount === 1 ? 'y' : 'ies'}`);
    }

    Alert.alert(
      `Retire "${c.name}"?`,
      `It will stop appearing in the public taxonomy` +
        (affected.length ? `, along with ${affected.join(' and ')}.` : '.') +
        `\n\nNothing is deleted — products keep their category and any spec values are ` +
        `preserved. You can restore it at any time.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Retire', style: 'destructive', onPress: () => void setActive(c, false) },
      ],
    );
  };

  const setActive = async (c: AdminCategory, isActive: boolean) => {
    setBusyId(c.id);
    setError('');
    const res = isActive ? await updateCategory(c.id, { isActive: true }) : await retireCategory(c.id);
    setBusyId(null);
    if (res.success) load();
    else setError(res.error.message);
  };

  // Rewrites sortOrder across the sibling group so the list is always a clean
  // 0..n-1 sequence — self-healing when rows share an order, where a plain swap
  // would do nothing.
  const move = async (siblings: AdminCategory[], index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return;

    const next = [...siblings];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);

    setBusyId(siblings[index].id);
    const results = await Promise.all(
      next
        .map((c, i) => ({ c, i }))
        .filter(({ c, i }) => c.sortOrder !== i)
        .map(({ c, i }) => updateCategory(c.id, { sortOrder: i })),
    );
    setBusyId(null);

    // Reload FIRST — it clears `error` on entry — then report. A partially
    // applied reorder used to revert silently, leaving the admin to wonder why
    // their tap did nothing.
    await load();
    const failed = results.find(r => !r.success);
    if (failed && !failed.success) {
      setError(`Could not reorder: ${failed.error.message}`);
    }
  };

  const renderRow = (c: AdminCategory, siblings: AdminCategory[], index: number, depth: number) => {
    const isLeaf = c.childCount === 0;
    const busy = busyId === c.id;

    return (
      <View key={c.id} style={[styles.card, depth > 0 && styles.cardChild, !c.isActive && styles.cardRetired]}>
        <View style={styles.cardHead}>
          <View style={styles.cardTitleWrap}>
            <Text style={styles.cardTitle}>{c.name}</Text>
            <Text style={styles.slug}>{c.slug}</Text>
          </View>
          {busy && <ActivityIndicator size="small" color="#6b7280" />}
        </View>

        <View style={styles.metaRow}>
          <View style={[styles.badge, c.isActive ? styles.badgeActive : styles.badgeInactive]}>
            <Text style={[styles.badgeText, c.isActive ? styles.badgeTextActive : styles.badgeTextInactive]}>
              {c.isActive ? 'Active' : 'Retired'}
            </Text>
          </View>
          <View style={[styles.badge, styles.badgeNeutral]}>
            <Text style={[styles.badgeText, styles.badgeTextNeutral]}>
              {depth === 0 ? 'Top level' : 'Leaf'}
            </Text>
          </View>
          <Text style={styles.counts}>
            {isLeaf ? `${c.specFieldCount} field${c.specFieldCount === 1 ? '' : 's'} · ` : ''}
            {c.productCount} product{c.productCount === 1 ? '' : 's'}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.iconBtn, index === 0 && styles.disabled]}
            disabled={busy || index === 0}
            onPress={() => move(siblings, index, -1)}
          >
            <Ionicons name="arrow-up" size={15} color="#374151" />
          </Pressable>
          <Pressable
            style={[styles.iconBtn, index === siblings.length - 1 && styles.disabled]}
            disabled={busy || index === siblings.length - 1}
            onPress={() => move(siblings, index, 1)}
          >
            <Ionicons name="arrow-down" size={15} color="#374151" />
          </Pressable>

          <Pressable style={styles.smallBtn} onPress={() => openEdit(c)}>
            <Text style={styles.smallBtnText}>Edit</Text>
          </Pressable>

          {isLeaf && (
            <Pressable
              style={styles.smallBtn}
              onPress={() =>
                router.push({
                  pathname: '/superadmin/taxonomy/[id]',
                  params: { id: c.id, name: c.name },
                })
              }
            >
              <Text style={styles.smallBtnText}>Fields</Text>
            </Pressable>
          )}

          {c.isActive ? (
            <Pressable style={[styles.smallBtn, styles.dangerBtn]} disabled={busy} onPress={() => confirmRetire(c)}>
              <Text style={styles.dangerText}>Retire</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.smallBtn} disabled={busy} onPress={() => void setActive(c, true)}>
              <Text style={styles.smallBtnText}>Restore</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {showForm ? (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>{editingId ? 'Edit category' : 'New category'}</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Name *</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={name =>
                  setForm(f => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }))
                }
                placeholder="e.g. Mobile Phones"
                placeholderTextColor="#9ca3af"
                editable={!saving}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Slug *</Text>
              <TextInput
                style={[styles.input, styles.mono]}
                value={form.slug}
                onChangeText={slug => {
                  setSlugTouched(true);
                  setForm(f => ({ ...f, slug }));
                }}
                placeholder="mobile-phones"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!saving}
              />
              <Text style={styles.hint}>Lowercase, hyphenated. Unique across the whole taxonomy.</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Parent</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                <Pressable
                  style={[styles.chip, form.parentId === null && styles.chipActive]}
                  onPress={() => setForm(f => ({ ...f, parentId: null }))}
                >
                  <Text style={[styles.chipText, form.parentId === null && styles.chipTextActive]}>
                    Top level
                  </Text>
                </Pressable>
                {parentOptions
                  .filter(p => p.id !== editingId)
                  .map(p => {
                    const active = form.parentId === p.id;
                    return (
                      <Pressable
                        key={p.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setForm(f => ({ ...f, parentId: p.id }))}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.name}</Text>
                      </Pressable>
                    );
                  })}
              </ScrollView>
            </View>

            {formError !== '' && <Text style={styles.error}>{formError}</Text>}

            <View style={styles.formActions}>
              <Pressable
                style={[styles.btn, styles.cancelBtn]}
                onPress={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                disabled={saving}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.saveBtn, saving && styles.disabled]} onPress={submit} disabled={saving}>
                {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={styles.newBtn} onPress={openCreate}>
            <Ionicons name="add" size={18} color="#ffffff" />
            <Text style={styles.newBtnText}>New category</Text>
          </Pressable>
        )}

        <Text style={styles.blurb}>
          The shared marketplace vocabulary. Two levels deep — spec templates attach to the
          sub-categories products are tagged with. Retiring hides a category everywhere without
          deleting anything.
        </Text>

        {error !== '' && <Text style={styles.error}>{error}</Text>}

        {loading ? (
          <View style={styles.list}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} style={styles.cardSkeleton} />
            ))}
          </View>
        ) : tree.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="pricetags-outline" size={28} color="#c4c7cc" />
            <Text style={styles.emptyText}>No categories yet.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {tree.map((parent, i) => (
              <View key={parent.id} style={styles.group}>
                {renderRow(parent, tree, i, 0)}
                {parent.children.map((child, j) => renderRow(child, parent.children, j, 1))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 16, paddingBottom: 40 },

  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 13,
  },
  newBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },

  blurb: { fontSize: 12.5, color: '#6b7280', lineHeight: 18, marginTop: 14 },

  formCard: { borderWidth: 1, borderColor: '#ececed', borderRadius: 12, padding: 16, backgroundColor: '#fafafa' },
  formTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 14 },
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
    backgroundColor: '#ffffff',
  },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  hint: { fontSize: 12, color: '#6b7280' },

  chips: { gap: 8, paddingBottom: 2 },
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

  formActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' },
  cancelText: { color: '#374151', fontSize: 15, fontWeight: '700' },
  saveBtn: { backgroundColor: '#0f172a' },
  saveText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.4 },

  list: { gap: 12, marginTop: 16 },
  group: { gap: 8 },
  cardSkeleton: { height: 120, borderRadius: 12 },
  card: { borderWidth: 1, borderColor: '#ececed', borderRadius: 12, padding: 14, backgroundColor: '#ffffff' },
  // Indented so a leaf reads as belonging to the top-level card above it.
  cardChild: { marginLeft: 16, backgroundColor: '#fafafa' },
  cardRetired: { opacity: 0.6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitleWrap: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  slug: { fontSize: 12, color: '#9ca3af', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeActive: { backgroundColor: '#dcfce7' },
  badgeTextActive: { color: '#166534' },
  badgeInactive: { backgroundColor: '#f3f4f6' },
  badgeTextInactive: { color: '#6b7280' },
  badgeNeutral: { backgroundColor: '#eef2ff' },
  badgeTextNeutral: { color: '#3730a3' },
  counts: { fontSize: 12, color: '#9ca3af', marginLeft: 'auto' },

  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  iconBtn: {
    width: 32,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  smallBtnText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  dangerBtn: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  dangerText: { fontSize: 13, fontWeight: '700', color: '#b91c1c' },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 48 },
  emptyText: { fontSize: 14, color: '#9ca3af' },
  error: { fontSize: 14, fontWeight: '600', color: '#b91c1c', marginTop: 12 },
});
