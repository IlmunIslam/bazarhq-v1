import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
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

import Skeleton from '@/components/Skeleton';
import {
  createAnnouncement,
  deactivateAnnouncement,
  fetchAnnouncements,
  formatDateTime,
  updateAnnouncement,
  type Announcement,
} from '@/lib/admin-api';

// Announcements — mirrors /superadmin/content. Same fields the web form posts
// (title, body, targetRole, isActive).
//
// "Delete" is a deactivation server-side (the endpoint sets isActive=false and
// keeps the row), so the button says Deactivate and the record stays visible.
// Reactivating goes through PATCH, which the web panel doesn't currently expose.

const ROLES = [
  { value: 'merchant', label: 'Merchants' },
  { value: 'customer', label: 'Customers' },
  { value: 'all', label: 'Everyone' },
] as const;

type TargetRole = (typeof ROLES)[number]['value'];

export default function AdminAnnouncementsScreen() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetRole, setTargetRole] = useState<TargetRole>('merchant');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await fetchAnnouncements();
    if (res.success) setItems(res.data.announcements);
    else setError(res.error.message);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setTitle('');
    setBody('');
    setTargetRole('merchant');
    setFormError('');
  };

  const submit = async () => {
    if (!title.trim()) return setFormError('Title is required.');
    if (!body.trim()) return setFormError('Body is required.');

    setSaving(true);
    setFormError('');
    const res = await createAnnouncement({
      title: title.trim(),
      body: body.trim(),
      targetRole,
      isActive: true,
    });
    setSaving(false);

    if (res.success) {
      setItems(prev => [res.data.announcement, ...prev]);
      resetForm();
      setShowForm(false);
    } else {
      setFormError(res.error.message);
    }
  };

  const toggleActive = async (a: Announcement) => {
    setBusyId(a.id);
    setError('');
    const res = a.isActive
      ? await deactivateAnnouncement(a.id)
      : await updateAnnouncement(a.id, { isActive: true });
    setBusyId(null);
    if (res.success) {
      setItems(prev => prev.map(x => (x.id === a.id ? { ...x, isActive: !a.isActive } : x)));
    } else {
      setError(res.error.message);
    }
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
        {showForm ? (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>New announcement</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Title *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Scheduled maintenance"
                placeholderTextColor="#9ca3af"
                editable={!saving}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Body *</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={body}
                onChangeText={setBody}
                placeholder="What do you want them to know?"
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                editable={!saving}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Audience</Text>
              <View style={styles.roleRow}>
                {ROLES.map(r => {
                  const active = targetRole === r.value;
                  return (
                    <Pressable
                      key={r.value}
                      style={[styles.roleChip, active && styles.roleChipActive]}
                      onPress={() => setTargetRole(r.value)}
                    >
                      <Text style={[styles.roleText, active && styles.roleTextActive]}>{r.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {formError !== '' && <Text style={styles.error}>{formError}</Text>}

            <View style={styles.formActions}>
              <Pressable
                style={[styles.btn, styles.cancelBtn]}
                onPress={() => {
                  resetForm();
                  setShowForm(false);
                }}
                disabled={saving}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.saveBtn, saving && styles.disabled]}
                onPress={submit}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveText}>Publish</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={styles.newBtn} onPress={() => setShowForm(true)}>
            <Ionicons name="add" size={18} color="#ffffff" />
            <Text style={styles.newBtnText}>New announcement</Text>
          </Pressable>
        )}

        {error !== '' && <Text style={styles.error}>{error}</Text>}

        {loading ? (
          <View style={styles.list}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} style={styles.cardSkeleton} />
            ))}
          </View>
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="megaphone-outline" size={28} color="#c4c7cc" />
            <Text style={styles.emptyText}>No announcements yet.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {items.map(a => (
              <View key={a.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>{a.title}</Text>
                  {busyId === a.id && <ActivityIndicator size="small" color="#6b7280" />}
                </View>
                <Text style={styles.cardBody}>{a.body}</Text>

                <View style={styles.metaRow}>
                  <View style={[styles.badge, a.isActive ? styles.badgeActive : styles.badgeInactive]}>
                    <Text style={[styles.badgeText, a.isActive ? styles.badgeTextActive : styles.badgeTextInactive]}>
                      {a.isActive ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                  <View style={[styles.badge, styles.badgeNeutral]}>
                    <Text style={[styles.badgeText, styles.badgeTextNeutral]}>
                      {ROLES.find(r => r.value === a.targetRole)?.label ?? a.targetRole}
                    </Text>
                  </View>
                  <Text style={styles.date}>{formatDateTime(a.createdAt)}</Text>
                </View>

                <Pressable
                  style={[styles.rowAction, a.isActive ? styles.rowActionDanger : styles.rowActionNeutral]}
                  onPress={() => toggleActive(a)}
                  disabled={busyId === a.id}
                >
                  <Text style={a.isActive ? styles.rowActionDangerText : styles.rowActionNeutralText}>
                    {a.isActive ? 'Deactivate' : 'Reactivate'}
                  </Text>
                </Pressable>
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
  textarea: { minHeight: 96 },

  roleRow: { flexDirection: 'row', gap: 8 },
  roleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  roleChipActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  roleText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  roleTextActive: { color: '#ffffff' },

  formActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' },
  cancelText: { color: '#374151', fontSize: 15, fontWeight: '700' },
  saveBtn: { backgroundColor: '#0f172a' },
  saveText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },

  list: { gap: 12, marginTop: 16 },
  cardSkeleton: { height: 130, borderRadius: 12 },
  card: { borderWidth: 1, borderColor: '#ececed', borderRadius: 12, padding: 14, backgroundColor: '#ffffff' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#0f172a' },
  cardBody: { fontSize: 13.5, color: '#374151', lineHeight: 19, marginTop: 6 },

  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeActive: { backgroundColor: '#dcfce7' },
  badgeTextActive: { color: '#166534' },
  badgeInactive: { backgroundColor: '#f3f4f6' },
  badgeTextInactive: { color: '#6b7280' },
  badgeNeutral: { backgroundColor: '#eef2ff' },
  badgeTextNeutral: { color: '#3730a3' },
  date: { fontSize: 12, color: '#9ca3af', marginLeft: 'auto' },

  rowAction: { marginTop: 12, borderRadius: 8, borderWidth: 1, paddingVertical: 9, alignItems: 'center' },
  rowActionDanger: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  rowActionDangerText: { fontSize: 13, fontWeight: '700', color: '#b91c1c' },
  rowActionNeutral: { backgroundColor: '#ffffff', borderColor: '#e5e7eb' },
  rowActionNeutralText: { fontSize: 13, fontWeight: '700', color: '#374151' },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 48 },
  emptyText: { fontSize: 14, color: '#9ca3af' },
  error: { fontSize: 14, fontWeight: '600', color: '#b91c1c', marginTop: 12 },
});
