import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';

// Merchant tab (Sprint A): auth gate → login or a real dashboard. The dashboard
// shows the store overview + counts (GET /shops/me) and publishes a draft store
// (POST /shops/me/publish). No unpublish endpoint exists, so publish is one-way
// here (mirrors the web dashboard). "View my store" opens a read-only preview
// INSIDE the Merchant stack (store-preview/[subdomain]) — never the Customer
// tab's route, which can't be navigated to cross-tab. Store creation is a later
// sprint; a "no store yet" state stands in.

export default function MerchantScreen() {
  const { status } = useAuth();

  if (status === 'restoring') {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return status === 'authenticated' ? <Dashboard /> : <LoginForm />;
}

// ── Login ────────────────────────────────────────────────────────────────────

function LoginForm() {
  const { login, notice, prefillEmail } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState(prefillEmail ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [unverified, setUnverified] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    setUnverified(false);
    const res = await login(email.trim(), password);
    if (!res.ok) {
      // The verification gate gets its own clear state, not a generic error.
      if (res.code === 'EMAIL_NOT_VERIFIED') setUnverified(true);
      else setError(res.message ?? 'Login failed. Please try again.');
      setSubmitting(false);
    }
    // On success the provider flips status → the dashboard replaces this view.
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <Text style={styles.kicker}>Merchant</Text>
        <Text style={styles.title}>Log in</Text>
        <Text style={styles.subtitle}>Use your BazarHQ merchant account.</Text>

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
            placeholder="you@example.com"
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
            onSubmitEditing={onSubmit}
            returnKeyType="go"
          />
        </View>

        {unverified && (
          <View style={styles.unverifiedBanner}>
            <Text style={styles.unverifiedText}>
              Your email isn&apos;t verified yet. Please verify your account, then sign in.
            </Text>
          </View>
        )}
        {error !== '' && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Log In</Text>
          )}
        </Pressable>

        <Pressable style={styles.registerRow} onPress={() => router.push('/register')} disabled={submitting}>
          <Text style={styles.registerText}>New to BazarHQ? </Text>
          <Text style={styles.registerLink}>Create an account</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────

interface ShopOverview {
  id: string;
  subdomain: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  status: string;
  publishedAt: string | null;
  _count: { products: number; orders: number };
}

type LoadState = 'loading' | 'ready' | 'nostore' | 'error';

function Dashboard() {
  const { merchant, logout } = useAuth();
  const router = useRouter();

  const [shop, setShop] = useState<ShopOverview | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');

  const [loggingOut, setLoggingOut] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    setPublishError('');
    const res = await api.get<{ shop: ShopOverview }>('/shops/me');
    if (res.success) {
      setShop(res.data.shop);
      setState('ready');
    } else if (res.error.code === 'SHOP_NOT_FOUND') {
      setState('nostore');
    } else {
      setErrorMsg(res.error.message);
      setState('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handlePublish = async () => {
    setPublishing(true);
    setPublishError('');
    const res = await api.post<{ shop: ShopOverview }>('/shops/me/publish', {});
    if (res.success) {
      setShop(res.data.shop);
    } else {
      setPublishError(res.error.message);
    }
    setPublishing(false);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
  };

  const firstName = merchant?.fullName?.split(' ')[0] ?? '';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>Merchant</Text>
        <Text style={styles.title}>Dashboard{firstName ? ` · ${firstName}` : ''}</Text>

        {state === 'loading' && <DashboardSkeleton />}

        {state === 'error' && (
          <View style={styles.card}>
            <Text style={styles.muted}>{errorMsg || 'Could not load your store.'}</Text>
            <Pressable style={[styles.button, styles.retryBtn]} onPress={load}>
              <Text style={styles.buttonText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {state === 'nostore' && (
          <View style={styles.card}>
            <Ionicons name="storefront-outline" size={32} color="#9ca3af" style={styles.noStoreIcon} />
            <Text style={styles.cardValue}>No store yet</Text>
            <Text style={styles.muted}>
              Create your store to start adding products and taking orders. It only takes a minute.
            </Text>
            <Pressable style={[styles.button, styles.createStoreBtn]} onPress={() => router.push('/create-store')}>
              <Text style={styles.buttonText}>Create your store</Text>
            </Pressable>
          </View>
        )}

        {state === 'ready' && shop && (
          <StoreOverview
            shop={shop}
            publishing={publishing}
            publishError={publishError}
            onPublish={handlePublish}
            onViewStore={() =>
              router.push({ pathname: '/store-preview/[subdomain]', params: { subdomain: shop.subdomain } })
            }
            onManageProducts={() => router.push('/products')}
            onManageOrders={() => router.push('/orders')}
            onAnalytics={() => router.push('/analytics')}
            onSettings={() => router.push('/settings')}
            onAccount={() => router.push('/account')}
          />
        )}

        <Pressable
          style={[styles.button, styles.logoutButton, loggingOut && styles.buttonDisabled]}
          onPress={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? (
            <ActivityIndicator color="#b91c1c" />
          ) : (
            <Text style={styles.logoutText}>Log Out</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function StoreOverview({
  shop,
  publishing,
  publishError,
  onPublish,
  onViewStore,
  onManageProducts,
  onManageOrders,
  onAnalytics,
  onSettings,
  onAccount,
}: {
  shop: ShopOverview;
  publishing: boolean;
  publishError: string;
  onPublish: () => void;
  onViewStore: () => void;
  onManageProducts: () => void;
  onManageOrders: () => void;
  onAnalytics: () => void;
  onSettings: () => void;
  onAccount: () => void;
}) {
  const isPublished = shop.status === 'published';

  return (
    <View style={styles.overview}>
      {/* Store card */}
      <View style={styles.card}>
        <View style={styles.storeHeader}>
          <View style={styles.flexShrink}>
            <Text style={styles.storeName}>{shop.name}</Text>
            <Text style={styles.storeSub}>{shop.subdomain}.bazarhq.com</Text>
          </View>
          <Text style={[styles.statusBadge, isPublished ? styles.statusPublished : styles.statusDraft]}>
            {isPublished ? 'Published' : 'Draft'}
          </Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{shop._count.products.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Active products</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{shop._count.orders.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Total orders</Text>
        </View>
      </View>

      {/* Manage products */}
      <Pressable style={[styles.button, styles.viewStoreBtn]} onPress={onManageProducts}>
        <Ionicons name="pricetags-outline" size={18} color="#0f172a" />
        <Text style={styles.viewStoreText}>Manage products</Text>
      </Pressable>

      {/* Manage orders */}
      <Pressable style={[styles.button, styles.viewStoreBtn]} onPress={onManageOrders}>
        <Ionicons name="receipt-outline" size={18} color="#0f172a" />
        <Text style={styles.viewStoreText}>Manage orders</Text>
      </Pressable>

      {/* Analytics */}
      <Pressable style={[styles.button, styles.viewStoreBtn]} onPress={onAnalytics}>
        <Ionicons name="bar-chart-outline" size={18} color="#0f172a" />
        <Text style={styles.viewStoreText}>Analytics</Text>
      </Pressable>

      {/* Settings */}
      <Pressable style={[styles.button, styles.viewStoreBtn]} onPress={onSettings}>
        <Ionicons name="settings-outline" size={18} color="#0f172a" />
        <Text style={styles.viewStoreText}>Settings</Text>
      </Pressable>

      {/* Account */}
      <Pressable style={[styles.button, styles.viewStoreBtn]} onPress={onAccount}>
        <Ionicons name="person-outline" size={18} color="#0f172a" />
        <Text style={styles.viewStoreText}>Account</Text>
      </Pressable>

      {/* Publish / live state */}
      {isPublished ? (
        <View style={styles.liveCard}>
          <Ionicons name="checkmark-circle" size={18} color="#047857" />
          <Text style={styles.liveText}>Your store is live.</Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardValue}>Ready to go live?</Text>
          <Text style={styles.muted}>
            Publishing makes your storefront public. You&apos;ll need at least one payment method enabled.
          </Text>
          {publishError !== '' && <Text style={styles.error}>{publishError}</Text>}
          <Pressable
            style={[styles.button, styles.publishBtn, publishing && styles.buttonDisabled]}
            onPress={onPublish}
            disabled={publishing}
          >
            {publishing ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Publish Store</Text>
            )}
          </Pressable>
        </View>
      )}

      {/* Read-only preview lives INSIDE the Merchant stack. Enabled only when
          published — the storefront endpoint requires a published shop. */}
      <Pressable
        style={[styles.button, styles.viewStoreBtn, !isPublished && styles.buttonDisabled]}
        onPress={onViewStore}
        disabled={!isPublished}
      >
        <Ionicons name="eye-outline" size={18} color="#0f172a" />
        <Text style={styles.viewStoreText}>
          {isPublished ? 'View my store' : 'Publish to preview your store'}
        </Text>
      </Pressable>
    </View>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.skeleton, { opacity }, style]} />;
}

function DashboardSkeleton() {
  return (
    <View style={styles.overview}>
      <Skeleton style={styles.skStoreCard} />
      <View style={styles.statsRow}>
        <Skeleton style={styles.skStatCard} />
        <Skeleton style={styles.skStatCard} />
      </View>
      <Skeleton style={styles.skWideCard} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 24, gap: 8, flexGrow: 1 },

  kicker: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  title: { fontSize: 28, fontWeight: '800', color: '#0f172a', marginBottom: 16 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 16 },

  // Login
  field: { gap: 6, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#fafafa',
  },
  error: { fontSize: 14, fontWeight: '600', color: '#b91c1c', marginTop: 4 },

  noticeBanner: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0', borderRadius: 10, padding: 12, marginBottom: 14 },
  noticeText: { fontSize: 14, color: '#047857', fontWeight: '600', lineHeight: 20 },
  unverifiedBanner: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 10, padding: 12, marginTop: 4, marginBottom: 4 },
  unverifiedText: { fontSize: 14, color: '#b45309', fontWeight: '600', lineHeight: 20 },
  registerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  registerText: { fontSize: 14, color: '#6b7280' },
  registerLink: { fontSize: 14, color: '#0f172a', fontWeight: '700' },
  createStoreBtn: { alignSelf: 'stretch', marginTop: 12 },

  button: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },

  // Cards / overview
  overview: { gap: 12 },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    backgroundColor: '#fafafa',
  },
  cardValue: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  muted: { fontSize: 14, color: '#6b7280', lineHeight: 20 },

  storeHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  flexShrink: { flexShrink: 1 },
  storeName: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  storeSub: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  statusBadge: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    textTransform: 'capitalize',
  },
  statusPublished: { color: '#047857', backgroundColor: '#ecfdf5' },
  statusDraft: { color: '#b45309', backgroundColor: '#fffbeb' },

  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#fafafa',
  },
  statValue: { fontSize: 26, fontWeight: '800', color: '#0f172a' },
  statLabel: { fontSize: 13, color: '#6b7280', marginTop: 2 },

  liveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#ecfdf5',
  },
  liveText: { fontSize: 15, fontWeight: '700', color: '#047857' },

  publishBtn: { marginTop: 4 },
  retryBtn: { marginTop: 4 },

  viewStoreBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  viewStoreText: { color: '#0f172a', fontSize: 16, fontWeight: '700' },

  noStoreIcon: { alignSelf: 'center', marginBottom: 4 },

  // Skeleton
  skeleton: { backgroundColor: '#e5e7eb', borderRadius: 12 },
  skStoreCard: { height: 88 },
  skStatCard: { flex: 1, height: 92 },
  skWideCard: { height: 120 },

  // Logout
  logoutButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fecaca',
    marginTop: 'auto',
  },
  logoutText: { color: '#b91c1c', fontSize: 16, fontWeight: '700' },
});
