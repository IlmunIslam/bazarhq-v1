import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import Skeleton from '@/components/Skeleton';
import {
  changePassword,
  fetchAccount,
  fetchSessions,
  revokeOtherSessions,
  revokeSession,
  updateProfile,
  type AccountUser,
  type Session,
} from '@/lib/settings-api';

type Tab = 'profile' | 'security';

export default function AccountScreen() {
  const [tab, setTab] = useState<Tab>('profile');

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {(['profile', 'security'] as Tab[]).map(t => {
          const active = tab === t;
          return (
            <Pressable key={t} style={[styles.tab, active && styles.tabActive]} onPress={() => setTab(t)}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t === 'profile' ? 'Profile' : 'Security'}</Text>
            </Pressable>
          );
        })}
      </View>
      {tab === 'profile' ? <ProfileTab /> : <SecurityTab />}
    </View>
  );
}

// ── Profile ──────────────────────────────────────────────────────────────────

function ProfileTab() {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetchAccount().then(res => {
      if (res.success) {
        setUser(res.data.user);
        setFullName(res.data.user.fullName);
        setPhone(res.data.user.phone ?? '');
      }
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const res = await updateProfile({ fullName: fullName.trim(), phone: phone.trim() === '' ? null : phone.trim() });
    if (res.success) {
      setUser(res.data.user);
      setMsg({ ok: true, text: 'Profile updated' });
    } else {
      setMsg({ ok: false, text: res.error.message });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Skeleton style={styles.blockSkeleton} />
        <Skeleton style={styles.blockSkeleton} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.avatarRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{(fullName[0] ?? user?.email[0] ?? '?').toUpperCase()}</Text>
        </View>
        <View style={styles.avatarNote}>
          <Ionicons name="image-outline" size={16} color="#6b7280" />
          <Text style={styles.avatarNoteText}>Photo upload is coming soon.</Text>
        </View>
      </View>

      <Field label="Full name">
        <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Your name" placeholderTextColor="#9ca3af" />
      </Field>
      <Field label="Email (cannot be changed)">
        <TextInput style={[styles.input, styles.inputDisabled]} value={user?.email ?? ''} editable={false} />
      </Field>
      <Field label="Phone (optional)">
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="01XXXXXXXXX"
          placeholderTextColor="#9ca3af"
          keyboardType="phone-pad"
        />
      </Field>

      {msg && <Text style={[styles.msg, msg.ok ? styles.msgOk : styles.msgBad]}>{msg.text}</Text>}

      <Pressable style={[styles.button, saving && styles.disabled]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Save changes</Text>}
      </Pressable>
    </ScrollView>
  );
}

// ── Security ─────────────────────────────────────────────────────────────────

function SecurityTab() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions().then(res => {
      if (res.success) setSessions(res.data.sessions);
      setSessionsLoading(false);
    });
  }, []);

  const submitPassword = async () => {
    setPwMsg(null);
    if (next.length < 8) return setPwMsg({ ok: false, text: 'New password must be at least 8 characters.' });
    if (next !== confirm) return setPwMsg({ ok: false, text: 'New passwords do not match.' });
    setPwSaving(true);
    const res = await changePassword(current, next);
    if (res.success) {
      setCurrent(''); setNext(''); setConfirm('');
      setPwMsg({ ok: true, text: res.data.message });
    } else {
      setPwMsg({ ok: false, text: res.error.message });
    }
    setPwSaving(false);
  };

  const doRevoke = async (id: string) => {
    setRevoking(id);
    const res = await revokeSession(id);
    if (res.success) setSessions(prev => prev.filter(s => s.id !== id));
    setRevoking(null);
  };

  const doRevokeAll = async () => {
    setRevoking('all');
    const res = await revokeOtherSessions();
    if (res.success) setSessions(prev => prev.filter(s => s.isCurrent));
    setRevoking(null);
  };

  const deviceName = (ua: string | null) => {
    if (!ua) return 'Unknown device';
    if (/mobile|expo|okhttp|dalvik|iphone|android/i.test(ua)) return 'Mobile app';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    return 'Browser';
  };

  const otherCount = sessions.filter(s => !s.isCurrent).length;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionTitle}>Change password</Text>
      <Field label="Current password">
        <TextInput style={styles.input} value={current} onChangeText={setCurrent} secureTextEntry placeholder="••••••••" placeholderTextColor="#9ca3af" />
      </Field>
      <Field label="New password">
        <TextInput style={styles.input} value={next} onChangeText={setNext} secureTextEntry placeholder="Min 8 characters" placeholderTextColor="#9ca3af" />
      </Field>
      <Field label="Confirm new password">
        <TextInput style={styles.input} value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Re-enter password" placeholderTextColor="#9ca3af" />
      </Field>
      {pwMsg && <Text style={[styles.msg, pwMsg.ok ? styles.msgOk : styles.msgBad]}>{pwMsg.text}</Text>}
      <Pressable style={[styles.button, pwSaving && styles.disabled]} onPress={submitPassword} disabled={pwSaving}>
        {pwSaving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Update password</Text>}
      </Pressable>

      <View style={styles.sessionsHead}>
        <Text style={styles.sectionTitle}>Active sessions</Text>
        {otherCount > 0 && (
          <Pressable onPress={doRevokeAll} disabled={revoking === 'all'}>
            <Text style={styles.revokeAll}>{revoking === 'all' ? 'Signing out…' : 'Sign out others'}</Text>
          </Pressable>
        )}
      </View>

      {sessionsLoading ? (
        <Skeleton style={styles.blockSkeleton} />
      ) : (
        sessions.map(s => (
          <View key={s.id} style={[styles.sessionCard, s.isCurrent && styles.sessionCurrent]}>
            <View style={styles.sessionInfo}>
              <Text style={styles.sessionDevice}>
                {deviceName(s.userAgent)}
                {s.isCurrent ? <Text style={styles.sessionThis}>  · this session</Text> : null}
              </Text>
              <Text style={styles.sessionMeta}>
                {s.ipAddress ?? 'Unknown IP'} · {new Date(s.createdAt).toLocaleDateString('en-BD')}
              </Text>
            </View>
            {!s.isCurrent && (
              <Pressable onPress={() => doRevoke(s.id)} disabled={revoking === s.id}>
                <Text style={styles.revoke}>{revoking === s.id ? '…' : 'Revoke'}</Text>
              </Pressable>
            )}
          </View>
        ))
      )}

      <View style={styles.twoFa}>
        <View style={styles.twoFaText}>
          <Text style={styles.twoFaTitle}>Two-factor authentication</Text>
          <Text style={styles.twoFaSub}>Add an extra layer of security.</Text>
        </View>
        <Text style={styles.comingSoon}>Coming soon</Text>
      </View>
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 20, paddingBottom: 40 },

  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#ececed' },
  tab: { paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#0f172a' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#9ca3af' },
  tabTextActive: { color: '#0f172a' },

  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  avatar: { width: 64, height: 64, borderRadius: 999, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 26, fontWeight: '800', color: '#9ca3af' },
  avatarNote: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  avatarNoteText: { fontSize: 13, color: '#6b7280' },

  field: { gap: 6, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#0f172a', backgroundColor: '#fafafa' },
  inputDisabled: { color: '#9ca3af', backgroundColor: '#f3f4f6' },

  msg: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  msgOk: { color: '#047857' },
  msgBad: { color: '#b91c1c' },

  button: { backgroundColor: '#0f172a', borderRadius: 10, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  sessionsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, marginBottom: 4 },
  revokeAll: { fontSize: 13, fontWeight: '700', color: '#0f172a' },

  sessionCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#ececed', borderRadius: 10, padding: 12, marginTop: 8, backgroundColor: '#ffffff' },
  sessionCurrent: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  sessionInfo: { flex: 1 },
  sessionDevice: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  sessionThis: { fontSize: 12, fontWeight: '400', color: '#047857' },
  sessionMeta: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  revoke: { fontSize: 13, fontWeight: '700', color: '#b91c1c' },

  twoFa: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 24, padding: 14, borderRadius: 10, backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#ececed' },
  twoFaText: { flex: 1 },
  twoFaTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  twoFaSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  comingSoon: { fontSize: 12, color: '#6b7280', backgroundColor: '#e5e7eb', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },

  blockSkeleton: { height: 120, borderRadius: 12, marginBottom: 12 },
});
