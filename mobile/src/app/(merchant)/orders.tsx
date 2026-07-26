import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import Skeleton from '@/components/Skeleton';
import {
  fetchOrders,
  formatTk,
  PAYMENT_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  type OrderListItem,
} from '@/lib/orders-api';

// Merchant orders list (Sprint C). Status filter + debounced search, newest
// first, cursor pagination. Tap an order → its detail. Reloads on focus so a
// status change made in the detail screen reflects on return. Merchant stack.

const STATUS_TABS = ['', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

export default function OrdersListScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchOrders({ status: statusFilter || undefined, search: search || undefined });
    if (res.success) {
      setOrders(res.data.orders);
      setNextCursor(res.data.nextCursor);
    }
    setLoading(false);
  }, [statusFilter, search]);

  // Reload on focus (covers filter/search changes and returning from detail).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || loading) return;
    setLoadingMore(true);
    const res = await fetchOrders({ status: statusFilter || undefined, search: search || undefined, cursor: nextCursor });
    if (res.success) {
      setOrders(prev => [...prev, ...res.data.orders]);
      setNextCursor(res.data.nextCursor);
    }
    setLoadingMore(false);
  }, [nextCursor, loadingMore, loading, statusFilter, search]);

  const header = (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
        {STATUS_TABS.map(s => {
          const active = statusFilter === s;
          return (
            <Pressable
              key={s || 'all'}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setStatusFilter(s)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{s ? STATUS_LABELS[s] : 'All'}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <TextInput
        style={styles.search}
        placeholder="Search by order #, name, phone…"
        placeholderTextColor="#9ca3af"
        value={searchInput}
        onChangeText={setSearchInput}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.listContent}>
          {header}
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.card}>
              <Skeleton style={styles.skLineWide} />
              <Skeleton style={styles.skLineNarrow} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={orders}
      keyExtractor={o => o.id}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <OrderRow item={item} onPress={() => router.push({ pathname: '/orders/[id]', params: { id: item.id } })} />
      )}
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      keyboardShouldPersistTaps="handled"
      ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} /> : <View style={styles.footer} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {search || statusFilter ? 'No orders match your filters' : 'No orders yet'}
          </Text>
          <Text style={styles.emptySub}>
            {search || statusFilter ? 'Try a different filter or search.' : 'Orders will appear here once customers buy.'}
          </Text>
        </View>
      }
    />
  );
}

function OrderRow({ item, onPress }: { item: OrderListItem; onPress: () => void }) {
  const color = STATUS_COLORS[item.status] ?? '#6b7280';
  const date = new Date(item.createdAt).toLocaleDateString('en-BD', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTop}>
        <Text style={styles.orderNumber}>#{item.orderNumber}</Text>
        <Text style={[styles.statusBadge, { color, backgroundColor: color + '20' }]}>
          {STATUS_LABELS[item.status] ?? item.status}
        </Text>
      </View>
      <Text style={styles.customer} numberOfLines={1}>
        {item.customerName} · {item.customerPhone}
      </Text>
      <View style={styles.cardBottom}>
        <Text style={styles.meta}>
          {item._count.items} item{item._count.items !== 1 ? 's' : ''} · {PAYMENT_LABELS[item.paymentMethod] ?? item.paymentMethod}
        </Text>
        <Text style={styles.total}>{formatTk(item.total)}</Text>
      </View>
      <Text style={styles.date}>{date}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  listContent: { padding: 16, paddingBottom: 32 },
  footer: { paddingVertical: 20 },

  tabsRow: { gap: 8, paddingBottom: 12 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  tabActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  tabTextActive: { color: '#ffffff' },

  search: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fafafa',
    marginBottom: 16,
  },

  card: {
    borderWidth: 1,
    borderColor: '#ececed',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#ffffff',
    gap: 6,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderNumber: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  statusBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  customer: { fontSize: 14, color: '#374151' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meta: { fontSize: 13, color: '#6b7280' },
  total: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  date: { fontSize: 12, color: '#9ca3af' },

  skLineWide: { height: 14, width: '60%', borderRadius: 6 },
  skLineNarrow: { height: 12, width: '35%', borderRadius: 6, marginTop: 8 },

  empty: { paddingVertical: 56, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },
  emptySub: { fontSize: 14, color: '#9ca3af', marginTop: 6, textAlign: 'center', paddingHorizontal: 24 },
});
