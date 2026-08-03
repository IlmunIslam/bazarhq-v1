import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
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
  createSpecField,
  fetchSpecFields,
  retireSpecField,
  updateSpecField,
  type AdminCategoryDetail,
  type AdminSpecField,
  type SpecDataType,
} from '@/lib/admin-api';

// Spec template editor — mirrors the web panel's /superadmin/taxonomy/[id].
//
// These fields drive the merchant product form and the rows of a product
// comparison. Two rules the API enforces and this screen surfaces:
//   • `key` is permanent once created — it is the stable machine identifier the
//     bulk spec save keys off. Edit the label instead.
//   • `dataType` locks once any product holds a value, because retyping would
//     strand that value in the wrong typed column and silently blank it.

const DATA_TYPES: { value: SpecDataType; label: string; hint: string }[] = [
  { value: 'text', label: 'Text', hint: 'Free text, e.g. "Samsung"' },
  { value: 'number', label: 'Number', hint: 'Numeric — comparable and filterable' },
  { value: 'boolean', label: 'Yes / No', hint: 'A flag, e.g. "Dual SIM"' },
  { value: 'enum', label: 'Choice list', hint: 'One of a fixed set you define' },
];

function keyify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+$/g, '')
    .slice(0, 40);
}

interface FormState {
  label: string;
  key: string;
  unit: string;
  dataType: SpecDataType;
  optionsText: string;
  isComparable: boolean;
  isRequired: boolean;
}

const BLANK: FormState = {
  label: '',
  key: '',
  unit: '',
  dataType: 'text',
  optionsText: '',
  isComparable: true,
  isRequired: false,
};

export default function AdminSpecFieldsScreen() {
  const { id } = useLocalSearchParams<{ id: string; name?: string }>();

  const [category, setCategory] = useState<AdminCategoryDetail | null>(null);
  const [fields, setFields] = useState<AdminSpecField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(BLANK);
  const [keyTouched, setKeyTouched] = useState(false);
  const [editing, setEditing] = useState<AdminSpecField | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const res = await fetchSpecFields(id);
    if (res.success) {
      setCategory(res.data.category);
      setFields(res.data.specFields);
    } else {
      setError(res.error.message);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(BLANK);
    setKeyTouched(false);
    setEditing(null);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (f: AdminSpecField) => {
    setForm({
      label: f.label,
      key: f.key,
      unit: f.unit ?? '',
      dataType: f.dataType,
      optionsText: f.options.join('\n'),
      isComparable: f.isComparable,
      isRequired: f.isRequired,
    });
    setKeyTouched(true);
    setEditing(f);
    setFormError('');
    setShowForm(true);
  };

  const submit = async () => {
    const label = form.label.trim();
    if (!label) return setFormError('Label is required.');

    const options = form.optionsText.split('\n').map(o => o.trim()).filter(Boolean);
    if (form.dataType === 'enum' && options.length === 0) {
      return setFormError('A choice list needs at least one option — one per line.');
    }

    setSaving(true);
    setFormError('');

    // `key` is never sent on edit: the API rejects any request carrying it
    // rather than silently ignoring the change.
    const payload = {
      label,
      unit: form.unit.trim() || null,
      dataType: form.dataType,
      ...(form.dataType === 'enum' ? { options } : {}),
      isComparable: form.isComparable,
      isRequired: form.isRequired,
    };

    const res = editing
      ? await updateSpecField(editing.id, payload)
      : await createSpecField(id, {
          ...payload,
          key: form.key || keyify(form.label),
          sortOrder: fields.length,
        });
    setSaving(false);

    if (res.success) {
      setShowForm(false);
      setEditing(null);
      setForm(BLANK);
      setLoading(true);
      load();
    } else {
      setFormError(res.error.message);
    }
  };

  const confirmRetire = (f: AdminSpecField) => {
    Alert.alert(
      `Retire "${f.label}"?`,
      `It will stop appearing on the merchant product form and in comparisons.` +
        (f.valueCount > 0
          ? `\n\n${f.valueCount} product${f.valueCount === 1 ? '' : 's'} already ` +
            `${f.valueCount === 1 ? 'has a value' : 'have values'} for this field. ` +
            `Those values are preserved, not deleted.`
          : '') +
        `\n\nYou can restore it at any time.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Retire', style: 'destructive', onPress: () => void setActive(f, false) },
      ],
    );
  };

  const setActive = async (f: AdminSpecField, isActive: boolean) => {
    setBusyId(f.id);
    setError('');
    const res = isActive ? await updateSpecField(f.id, { isActive: true }) : await retireSpecField(f.id);
    setBusyId(null);
    if (res.success) load();
    else setError(res.error.message);
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;

    const next = [...fields];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);

    setBusyId(fields[index].id);
    await Promise.all(
      next
        .map((f, i) => ({ f, i }))
        .filter(({ f, i }) => f.sortOrder !== i)
        .map(({ f, i }) => updateSpecField(f.id, { sortOrder: i })),
    );
    setBusyId(null);
    load();
  };

  const typeLocked = !!editing && editing.valueCount > 0;

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} style={styles.cardSkeleton} />
        ))}
      </View>
    );
  }

  if (!category) {
    return (
      <View style={styles.empty}>
        <Text style={styles.error}>{error || 'Category not found'}</Text>
      </View>
    );
  }

  // Spec templates attach to leaves only — the ones merchants tag products with.
  if (category.childCount > 0) {
    return (
      <View style={styles.noticeWrap}>
        <Ionicons name="git-branch-outline" size={28} color="#c4c7cc" />
        <Text style={styles.noticeTitle}>
          {category.name} has {category.childCount} sub-categor
          {category.childCount === 1 ? 'y' : 'ies'}
        </Text>
        <Text style={styles.noticeBody}>
          Spec templates attach to leaf categories — the ones merchants actually tag products with.
          Open a sub-category from the taxonomy list to edit its fields.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>
            {category.parent ? `${category.parent.name} / ` : ''}
            {category.name}
          </Text>
          <Text style={styles.summaryMeta}>
            <Text style={styles.mono}>{category.slug}</Text>
            {' · '}
            {category.productCount} product{category.productCount === 1 ? '' : 's'} tagged
            {!category.isActive ? ' · Retired' : ''}
          </Text>
        </View>

        {showForm ? (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>{editing ? 'Edit field' : 'New spec field'}</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Label *</Text>
              <TextInput
                style={styles.input}
                value={form.label}
                onChangeText={label =>
                  setForm(f => ({ ...f, label, key: keyTouched ? f.key : keyify(label) }))
                }
                placeholder="RAM"
                placeholderTextColor="#9ca3af"
                editable={!saving}
              />
              <Text style={styles.hint}>What merchants and shoppers see.</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Key {editing ? '(permanent)' : '*'}</Text>
              <TextInput
                style={[styles.input, styles.mono, editing && styles.inputDisabled]}
                value={form.key}
                onChangeText={key => {
                  setKeyTouched(true);
                  setForm(f => ({ ...f, key }));
                }}
                placeholder="ram_gb"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!editing && !saving}
              />
              <Text style={styles.hint}>
                {editing
                  ? 'Cannot be changed — retire this field and add a new one instead.'
                  : 'Permanent once created. Lowercase, underscores.'}
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Unit</Text>
              <TextInput
                style={styles.input}
                value={form.unit}
                onChangeText={unit => setForm(f => ({ ...f, unit }))}
                placeholder="GB"
                placeholderTextColor="#9ca3af"
                editable={!saving}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Data type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {DATA_TYPES.map(t => {
                  const active = form.dataType === t.value;
                  return (
                    <Pressable
                      key={t.value}
                      style={[styles.chip, active && styles.chipActive, typeLocked && !active && styles.disabled]}
                      disabled={typeLocked}
                      onPress={() => setForm(f => ({ ...f, dataType: t.value }))}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={styles.hint}>
                {typeLocked
                  ? `Locked — ${editing!.valueCount} product${editing!.valueCount === 1 ? ' has a value' : 's have values'} for this field.`
                  : DATA_TYPES.find(t => t.value === form.dataType)?.hint}
              </Text>
            </View>

            {form.dataType === 'enum' && (
              <View style={styles.field}>
                <Text style={styles.label}>Options *</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  value={form.optionsText}
                  onChangeText={optionsText => setForm(f => ({ ...f, optionsText }))}
                  placeholder={'3G\n4G\n5G'}
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  autoCapitalize="none"
                  editable={!saving}
                />
                <Text style={styles.hint}>One per line.</Text>
              </View>
            )}

            <View style={styles.flagRow}>
              {(
                [
                  ['isComparable', 'Comparison row'],
                  ['isRequired', 'Required'],
                ] as const
              ).map(([flag, label]) => {
                const active = form[flag];
                return (
                  <Pressable
                    key={flag}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setForm(f => ({ ...f, [flag]: !f[flag] }))}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {active ? '✓ ' : ''}
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {formError !== '' && <Text style={styles.error}>{formError}</Text>}

            <View style={styles.formActions}>
              <Pressable
                style={[styles.btn, styles.cancelBtn]}
                onPress={() => {
                  setShowForm(false);
                  setEditing(null);
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
            <Text style={styles.newBtnText}>Add field</Text>
          </Pressable>
        )}

        {error !== '' && <Text style={styles.error}>{error}</Text>}

        {fields.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="list-outline" size={28} color="#c4c7cc" />
            <Text style={styles.emptyText}>
              No spec fields yet. Add the first to give this category a comparison template.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {fields.map((f, i) => {
              const busy = busyId === f.id;
              return (
                <View key={f.id} style={[styles.card, !f.isActive && styles.cardRetired]}>
                  <View style={styles.cardHead}>
                    <View style={styles.cardTitleWrap}>
                      <Text style={styles.cardTitle}>
                        {f.label}
                        {f.unit ? ` (${f.unit})` : ''}
                      </Text>
                      <Text style={styles.slug}>{f.key}</Text>
                    </View>
                    {busy && <ActivityIndicator size="small" color="#6b7280" />}
                  </View>

                  <View style={styles.metaRow}>
                    <View style={[styles.badge, f.isActive ? styles.badgeActive : styles.badgeInactive]}>
                      <Text style={[styles.badgeText, f.isActive ? styles.badgeTextActive : styles.badgeTextInactive]}>
                        {f.isActive ? 'Active' : 'Retired'}
                      </Text>
                    </View>
                    <View style={[styles.badge, styles.badgeNeutral]}>
                      <Text style={[styles.badgeText, styles.badgeTextNeutral]}>
                        {DATA_TYPES.find(t => t.value === f.dataType)?.label ?? f.dataType}
                      </Text>
                    </View>
                    {f.isRequired && (
                      <View style={[styles.badge, styles.badgeNeutral]}>
                        <Text style={[styles.badgeText, styles.badgeTextNeutral]}>Required</Text>
                      </View>
                    )}
                    {f.valueCount > 0 && <Text style={styles.counts}>{f.valueCount} in use</Text>}
                  </View>

                  {f.options.length > 0 && (
                    <Text style={styles.options} numberOfLines={2}>
                      {f.options.join(', ')}
                    </Text>
                  )}

                  <View style={styles.actions}>
                    <Pressable
                      style={[styles.iconBtn, i === 0 && styles.disabled]}
                      disabled={busy || i === 0}
                      onPress={() => move(i, -1)}
                    >
                      <Ionicons name="arrow-up" size={15} color="#374151" />
                    </Pressable>
                    <Pressable
                      style={[styles.iconBtn, i === fields.length - 1 && styles.disabled]}
                      disabled={busy || i === fields.length - 1}
                      onPress={() => move(i, 1)}
                    >
                      <Ionicons name="arrow-down" size={15} color="#374151" />
                    </Pressable>

                    <Pressable style={styles.smallBtn} onPress={() => openEdit(f)}>
                      <Text style={styles.smallBtnText}>Edit</Text>
                    </Pressable>

                    {f.isActive ? (
                      <Pressable style={[styles.smallBtn, styles.dangerBtn]} disabled={busy} onPress={() => confirmRetire(f)}>
                        <Text style={styles.dangerText}>Retire</Text>
                      </Pressable>
                    ) : (
                      <Pressable style={styles.smallBtn} disabled={busy} onPress={() => void setActive(f, true)}>
                        <Text style={styles.smallBtnText}>Restore</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
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
  loadingWrap: { flex: 1, backgroundColor: '#ffffff', padding: 16, gap: 12 },

  summary: { marginBottom: 14 },
  summaryTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  summaryMeta: { fontSize: 12.5, color: '#6b7280', marginTop: 3 },

  noticeWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    padding: 28,
    gap: 10,
  },
  noticeTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', textAlign: 'center' },
  noticeBody: { fontSize: 13.5, color: '#6b7280', textAlign: 'center', lineHeight: 19 },

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
  inputDisabled: { backgroundColor: '#f3f4f6', color: '#6b7280' },
  textarea: { minHeight: 96 },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  hint: { fontSize: 12, color: '#6b7280' },

  chips: { gap: 8, paddingBottom: 2 },
  flagRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
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
  cardSkeleton: { height: 110, borderRadius: 12 },
  card: { borderWidth: 1, borderColor: '#ececed', borderRadius: 12, padding: 14, backgroundColor: '#ffffff' },
  cardRetired: { opacity: 0.6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitleWrap: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  slug: { fontSize: 12, color: '#9ca3af', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  options: { fontSize: 12.5, color: '#6b7280', marginTop: 8 },

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

  empty: { alignItems: 'center', gap: 8, paddingVertical: 48, paddingHorizontal: 24 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 20 },
  error: { fontSize: 14, fontWeight: '600', color: '#b91c1c', marginTop: 12 },
});
