import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import Skeleton from '@/components/Skeleton';
import { fetchAdminOverview, formatMoney, type AdminOverview } from '@/lib/admin-api';
import { useAdminAuth } from '@/lib/admin-auth';

// Admin tab root: auth gate → login (password, then TOTP when enabled) or the
// superadmin dashboard. Mirrors the web panel at /superadmin.

export default function AdminScreen() {
  const { status } = useAdminAuth();

  if (status === 'restoring') {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return status === 'authenticated' ? <Dashboard /> : <LoginFlow />;
}

// ── Login ────────────────────────────────────────────────────────────────────

function LoginFlow() {
  const { login, verifyTotp, cancelTotp, notice } = useAdminAuth();
  const [step, setStep] = useState<'credentials' | 'totp'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmitCreds = email.trim().length > 0 && password.length > 0 && !submitting;
  const canSubmitCode = code.replace(/\s/g, '').length >= 6 && !submitting;

  const onSubmitCreds = async () => {
    if (!canSubmitCreds) return;
    setSubmitting(true);
    setError('');
    const res = await login(email.trim(), password);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.message ?? 'Login failed. Please try again.');
      return;
    }
    if (res.requiresTotp) {
      setPassword('');
      setStep('totp');
    }
    // Otherwise the provider flips status → the dashboard replaces this view.
  };

  const onSubmitCode = async () => {
    if (!canSubmitCode) return;
    setSubmitting(true);
    setError('');
    const res = await verifyTotp(code);
    setSubmitting(false);
    if (!res.ok) setError(res.message ?? 'Invalid code.');
  };

  const backToCredentials = () => {
    cancelTotp();
    setStep('credentials');
    setCode('');
    setError('');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.loginBody}
      >
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed" size={22} color="#0f172a" />
        </View>

        {step === 'credentials' ? (
          <>
            <Text style={styles.kicker}>Super Admin</Text>
            <Text style={styles.title}>Admin login</Text>
            <Text style={styles.subtitle}>BazarHQ platform administration.</Text>

            {notice && (
              <View style={styles.noticeBanner}>
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="admin@bazarhq.com"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                editable={!submitting}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#9ca3af"
                secureTextEntry
                textContentType="password"
                editable={!submitting}
                onSubmitEditing={onSubmitCreds}
                returnKeyType="go"
              />
            </View>

            {error !== '' && <Text style={styles.error}>{error}</Text>}

            <Pressable
              style={[styles.button, !canSubmitCreds && styles.buttonDisabled]}
              onPress={onSubmitCreds}
              disabled={!canSubmitCreds}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Sign in</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.kicker}>Super Admin</Text>
            <Text style={styles.title}>Two-factor auth</Text>
            <Text style={styles.subtitle}>
              Enter the 6-digit code from your authenticator app.
            </Text>

            <View style={styles.field}>
              <Text style={styles.label}>Authentication code</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                placeholderTextColor="#cbd5e1"
                keyboardType="number-pad"
                maxLength={7}
                autoFocus
                editable={!submitting}
                onSubmitEditing={onSubmitCode}
                returnKeyType="go"
              />
            </View>

            {error !== '' && <Text style={styles.error}>{error}</Text>}

            <Pressable
              style={[styles.button, !canSubmitCode && styles.buttonDisabled]}
              onPress={onSubmitCode}
              disabled={!canSubmitCode}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </Pressable>

            <Pressable style={styles.backLink} onPress={backToCredentials} disabled={submitting}>
              <Text style={styles.backLinkText}>Back to login</Text>
            </Pressable>
          </>
        )}

        <View style={styles.footerNote}>
          <Ionicons name="shield-checkmark-outline" size={14} color="#6b7280" />
          <Text style={styles.footerNoteText}>Authorized personnel only · access is logged.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────

// Paths carry the `/superadmin` prefix so they can't collide with the Merchant
// tab's routes (both tabs have an "analytics" screen) — see (admin)/_layout.
const LINKS = [
  { href: '/superadmin/merchants', icon: 'people-outline', title: 'Merchants', sub: 'Suspend, activate, verify' },
  { href: '/superadmin/analytics', icon: 'bar-chart-outline', title: 'Platform analytics', sub: 'Revenue, orders, growth' },
  { href: '/superadmin/taxonomy', icon: 'pricetags-outline', title: 'Taxonomy', sub: 'Categories and spec templates' },
  { href: '/superadmin/announcements', icon: 'megaphone-outline', title: 'Announcements', sub: 'Create and manage notices' },
  { href: '/superadmin/audit-logs', icon: 'document-text-outline', title: 'Audit logs', sub: 'Every admin action, logged' },
] as const;

function Dashboard() {
  const { admin, logout } = useAdminAuth();
  const router = useRouter();

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await fetchAdminOverview();
    if (res.success) setOverview(res.data);
    else setError(res.error.message);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const firstName = admin?.fullName?.split(' ')[0] ?? '';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>Super Admin</Text>
        <Text style={styles.title}>Platform{firstName ? ` · ${firstName}` : ''}</Text>

        {loading ? (
          <View style={styles.kpiGrid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} style={styles.kpiSkeleton} />
            ))}
          </View>
        ) : error !== '' ? (
          <View style={styles.card}>
            <Text style={styles.muted}>{error}</Text>
            <Pressable style={[styles.button, styles.retryBtn]} onPress={load}>
              <Text style={styles.buttonText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.kpiGrid}>
            <Kpi label="Merchants" value={String(overview?.totalMerchants ?? 0)} />
            <Kpi label="Active" value={String(overview?.activeMerchants ?? 0)} />
            <Kpi label="Published shops" value={String(overview?.publishedShops ?? 0)} />
            <Kpi label="Orders" value={String(overview?.totalOrders ?? 0)} />
            <Kpi label="GMV" value={formatMoney(overview?.totalRevenue ?? '0')} wide />
          </View>
        )}

        {LINKS.map(link => (
          <Pressable key={link.href} style={styles.linkRow} onPress={() => router.push(link.href)}>
            <View style={styles.linkIcon}>
              <Ionicons name={link.icon} size={19} color="#0f172a" />
            </View>
            <View style={styles.linkText}>
              <Text style={styles.linkTitle}>{link.title}</Text>
              <Text style={styles.linkSub}>{link.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#c4c7cc" />
          </Pressable>
        ))}

        <View style={styles.accountCard}>
          <Text style={styles.accountEmail}>{admin?.email}</Text>
          <Text style={styles.accountMeta}>
            {admin?.role === 'superadmin' ? 'Super admin' : 'Support'}
            {admin?.twoFaEnabled ? ' · 2FA enabled' : ' · 2FA off'}
          </Text>
          <Text style={styles.accountHint}>
            Admin sessions end after 30 minutes of inactivity, matching the web panel.
          </Text>
        </View>

        <Pressable
          style={[styles.logoutBtn, loggingOut && styles.buttonDisabled]}
          onPress={() => {
            setLoggingOut(true);
            void logout();
          }}
          disabled={loggingOut}
        >
          {loggingOut ? (
            <ActivityIndicator color="#b91c1c" />
          ) : (
            <Text style={styles.logoutText}>Sign out</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Kpi({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={[styles.kpiCard, wide && styles.kpiCardWide]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 48 },
  loginBody: { flex: 1, padding: 24 },

  kicker: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, color: '#6b7280', textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 4, marginBottom: 20 },

  lockBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
    marginBottom: 16,
  },

  noticeBanner: {
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  noticeText: { fontSize: 13, color: '#92400e', lineHeight: 18 },

  field: { gap: 6, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fafafa',
  },
  codeInput: { fontSize: 22, letterSpacing: 6, textAlign: 'center', fontWeight: '700' },

  button: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  retryBtn: { marginTop: 14 },

  backLink: { alignItems: 'center', marginTop: 14 },
  backLinkText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },

  footerNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 'auto', paddingTop: 24 },
  footerNoteText: { fontSize: 12, color: '#6b7280' },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16, marginBottom: 8 },
  kpiCard: { flexGrow: 1, flexBasis: '47%', borderWidth: 1, borderColor: '#ececed', borderRadius: 12, padding: 14, backgroundColor: '#fafafa' },
  kpiCardWide: { flexBasis: '100%' },
  kpiLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  kpiValue: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginTop: 4 },
  kpiSkeleton: { flexGrow: 1, flexBasis: '47%', height: 74, borderRadius: 12 },

  card: { borderWidth: 1, borderColor: '#ececed', borderRadius: 12, padding: 16, marginTop: 16, backgroundColor: '#ffffff' },
  muted: { fontSize: 14, color: '#6b7280' },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#ececed',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    backgroundColor: '#ffffff',
  },
  linkIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  linkText: { flex: 1 },
  linkTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  linkSub: { fontSize: 12.5, color: '#6b7280', marginTop: 2 },

  accountCard: {
    borderWidth: 1,
    borderColor: '#ececed',
    borderRadius: 12,
    padding: 14,
    marginTop: 20,
    backgroundColor: '#fafafa',
  },
  accountEmail: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  accountMeta: { fontSize: 12.5, color: '#6b7280', marginTop: 2 },
  accountHint: { fontSize: 12.5, color: '#9ca3af', marginTop: 8, lineHeight: 17 },

  logoutBtn: {
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: '#b91c1c' },

  error: { fontSize: 14, fontWeight: '600', color: '#b91c1c', marginBottom: 12 },
});
