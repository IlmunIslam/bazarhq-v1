import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import Skeleton from '@/components/Skeleton';
import {
  fetchMerchants,
  setMerchantStatus,
  setShopStatus,
  verifyMerchantEmail,
  type AdminMerchant,
} from '@/lib/admin-api';

// Merchant management — mirrors the web panel's /superadmin/merchants: search,
// status filter, suspend/activate, verify email, and shop publish/suspend.
//
// Suspending a merchant also revokes their sessions server-side, so it is
// confirmed before it fires.

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
] as const;

type Filter = (typeof FILTERS)[number]['value'];

export default function AdminMerchantsScreen() {
  const [merchants, setMerchants] = useState<AdminMerchant[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setError('');
      const res = await fetchMerchants({ status: filter, search: search.trim() || undefined });
      if (res.success) setMerchants(res.data.merchants);
      else setError(res.error.message);
      setLoading(false);
      setRefreshing(false);
    },
    [filter, search],
  );

  // Debounced so typing a search doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  // Applies a mutation, then patches the row in place so the list doesn't jump.
  const runAction = async (
    id: string,
    action: () => Promise<{ success: boolean; error?: { message: string } }>,
    patch: (m: AdminMerchant) => AdminMerchant,
  ) => {
    setBusyId(id);
    setError('');
    const res = await action();
    setBusyId(null);
    if (res.success) {
      setMerchants(prev => prev.map(m => (m.id === id ? patch(m) : m)));
    } else {
      setError(res.error?.message ?? 'Action failed.');
    }
  };

  const toggleMerchant = (m: AdminMerchant) => {
    const next = m.status === 'suspended' ? 'active' : 'suspended';
    const apply = () =>
      runAction(
        m.id,
        () => setMerchantStatus(m.id, next),
        prev => ({ ...prev, status: next }),
      );

    if (next === 'suspended') {
      Alert.alert(
        'Suspend merchant?',
        `${m.fullName} will be signed out of every device and blocked from signing in.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Suspend', style: 'destructive', onPress: () => void apply() },
        ],
      );
    } else {
      void apply();
    }
  };

  const verifyEmail = (m: AdminMerchant) =>
    void runAction(
      m.id,
      () => verifyMerchantEmail(m.id),
      prev => ({ ...prev, emailVerified: true }),
    );

  const toggleShop = (m: AdminMerchant) => {
    if (!m.shop) return;
    const shop = m.shop;
    const next = shop.status === 'suspended' ? 'published' : 'suspended';
    const apply = () =>
      runAction(
        m.id,
        () => setShopStatus(shop.id, next),
        prev => (prev.shop ? { ...prev, shop: { ...prev.shop, status: next } } : prev),
      );

    if (next === 'suspended') {
      Alert.alert('Suspend store?', `${shop.name} will stop being reachable by shoppers.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Suspend', style: 'destructive', onPress: () => void apply() },
      ]);
    } else {
      void apply();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search name or email"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search !== '' && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="#c4c7cc" />
            </Pressable>
          )}
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map(f => {
            const active = filter === f.value;
            return (
              <Pressable
                key={f.value}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(f.value)}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {error !== '' && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.loadingList}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} style={styles.rowSkeleton} />
          ))}
        </View>
      ) : (
        <FlatList
          data={merchants}
          keyExtractor={m => m.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load({ silent: true });
              }}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={28} color="#c4c7cc" />
              <Text style={styles.emptyText}>No merchants match this view.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <MerchantCard
              merchant={item}
              busy={busyId === item.id}
              onToggleMerchant={() => toggleMerchant(item)}
              onVerifyEmail={() => verifyEmail(item)}
              onToggleShop={() => toggleShop(item)}
            />
          )}
        />
      )}
    </View>
  );
}

function MerchantCard({
  merchant,
  busy,
  onToggleMerchant,
  onVerifyEmail,
  onToggleShop,
}: {
  merchant: AdminMerchant;
  busy: boolean;
  onToggleMerchant: () => void;
  onVerifyEmail: () => void;
  onToggleShop: () => void;
}) {
  const suspended = merchant.status === 'suspended';
  const shop = merchant.shop;

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardHeadText}>
          <Text style={styles.name}>{merchant.fullName}</Text>
          <Text style={styles.email}>{merchant.email}</Text>
        </View>
        {busy && <ActivityIndicator size="small" color="#6b7280" />}
      </View>

      <View style={styles.badgeRow}>
        <Badge
          label={suspended ? 'Suspended' : 'Active'}
          tone={suspended ? 'danger' : 'success'}
        />
        <Badge
          label={merchant.emailVerified ? 'Email verified' : 'Unverified'}
          tone={merchant.emailVerified ? 'neutral' : 'warning'}
        />
        {shop && <Badge label={`Store · ${shop.status}`} tone="neutral" />}
      </View>

      {shop ? (
        <Text style={styles.shopLine}>
          {shop.name} · {shop.subdomain}
        </Text>
      ) : (
        <Text style={styles.shopLineMuted}>No store yet</Text>
      )}

      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, suspended ? styles.actionPrimary : styles.actionDanger]}
          onPress={onToggleMerchant}
          disabled={busy}
        >
          <Text style={suspended ? styles.actionPrimaryText : styles.actionDangerText}>
            {suspended ? 'Activate' : 'Suspend'}
          </Text>
        </Pressable>

        {!merchant.emailVerified && (
          <Pressable style={[styles.actionBtn, styles.actionNeutral]} onPress={onVerifyEmail} disabled={busy}>
            <Text style={styles.actionNeutralText}>Verify email</Text>
          </Pressable>
        )}

        {shop && (
          <Pressable style={[styles.actionBtn, styles.actionNeutral]} onPress={onToggleShop} disabled={busy}>
            <Text style={styles.actionNeutralText}>
              {shop.status === 'suspended' ? 'Publish store' : 'Suspend store'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Badge({ label, tone }: { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }) {
  return (
    <View style={[styles.badge, styles[`badge_${tone}`]]}>
      <Text style={[styles.badgeText, styles[`badgeText_${tone}`]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },

  header: { padding: 16, paddingBottom: 8, gap: 12 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fafafa',
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: '#0f172a' },

  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  filterChipActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  filterText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  filterTextActive: { color: '#ffffff' },

  loadingList: { padding: 16, gap: 12 },
  rowSkeleton: { height: 132, borderRadius: 12 },
  listContent: { padding: 16, paddingTop: 8, paddingBottom: 40, gap: 12 },

  card: { borderWidth: 1, borderColor: '#ececed', borderRadius: 12, padding: 14, backgroundColor: '#ffffff' },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardHeadText: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  email: { fontSize: 13, color: '#6b7280', marginTop: 2 },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badge_success: { backgroundColor: '#dcfce7' },
  badgeText_success: { color: '#166534' },
  badge_danger: { backgroundColor: '#fee2e2' },
  badgeText_danger: { color: '#b91c1c' },
  badge_warning: { backgroundColor: '#fef3c7' },
  badgeText_warning: { color: '#92400e' },
  badge_neutral: { backgroundColor: '#f3f4f6' },
  badgeText_neutral: { color: '#374151' },

  shopLine: { fontSize: 13, color: '#374151', marginTop: 10 },
  shopLineMuted: { fontSize: 13, color: '#9ca3af', marginTop: 10 },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1 },
  actionPrimary: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  actionPrimaryText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  actionDanger: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  actionDangerText: { fontSize: 13, fontWeight: '700', color: '#b91c1c' },
  actionNeutral: { backgroundColor: '#ffffff', borderColor: '#e5e7eb' },
  actionNeutralText: { fontSize: 13, fontWeight: '700', color: '#374151' },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 48 },
  emptyText: { fontSize: 14, color: '#9ca3af' },
  error: { fontSize: 14, fontWeight: '600', color: '#b91c1c', paddingHorizontal: 16, paddingBottom: 8 },
});
