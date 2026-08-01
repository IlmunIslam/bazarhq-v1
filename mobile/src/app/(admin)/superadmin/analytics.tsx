import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import RevenueChart from '@/components/RevenueChart';
import Skeleton from '@/components/Skeleton';
import {
  fetchAdminOverview,
  formatDateTime,
  formatMoney,
  type AdminOverview,
} from '@/lib/admin-api';

// Platform analytics — mirrors /superadmin/analytics. Reuses the merchant
// dashboard's RevenueChart (react-native-svg, Expo Go safe) since the admin
// overview's ordersByDay has the same {date, revenue} shape.

export default function AdminAnalyticsScreen() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await fetchAdminOverview();
    if (res.success) setData(res.data);
    else setError(res.error.message);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.kpiGrid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} style={styles.kpiSkeleton} />
          ))}
        </View>
        <Skeleton style={styles.chartSkeleton} />
        <Skeleton style={styles.blockSkeleton} />
      </ScrollView>
    );
  }

  if (error !== '') {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{error}</Text>
        <Pressable style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const chartData = (data?.ordersByDay ?? []).map(d => ({
    date: d.date,
    revenue: Number(d.revenue),
  }));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.kpiGrid}>
        <Kpi label="Total merchants" value={String(data?.totalMerchants ?? 0)} />
        <Kpi label="Active merchants" value={String(data?.activeMerchants ?? 0)} />
        <Kpi label="Published shops" value={String(data?.publishedShops ?? 0)} />
        <Kpi label="Total orders" value={String(data?.totalOrders ?? 0)} />
        <Kpi label="Gross merchandise value" value={formatMoney(data?.totalRevenue ?? '0')} wide />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Revenue · last 30 days</Text>
        <RevenueChart data={chartData} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent orders</Text>
        {(data?.recentOrders ?? []).length === 0 ? (
          <Text style={styles.emptyText}>No orders yet.</Text>
        ) : (
          data?.recentOrders.map((o, i) => (
            <View key={o.id} style={[styles.orderRow, i > 0 && styles.orderRowBorder]}>
              <View style={styles.orderText}>
                <Text style={styles.orderNumber}>#{o.orderNumber}</Text>
                <Text style={styles.orderShop} numberOfLines={1}>
                  {o.shop.name} · {formatDateTime(o.createdAt)}
                </Text>
              </View>
              <View style={styles.orderRight}>
                <Text style={styles.orderTotal}>{formatMoney(o.total)}</Text>
                <Text style={styles.orderStatus}>{o.status}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
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
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#ffffff' },
  muted: { fontSize: 14, color: '#6b7280' },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: { flexGrow: 1, flexBasis: '47%', borderWidth: 1, borderColor: '#ececed', borderRadius: 12, padding: 14, backgroundColor: '#fafafa' },
  kpiCardWide: { flexBasis: '100%' },
  kpiLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  kpiValue: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginTop: 4 },
  kpiSkeleton: { flexGrow: 1, flexBasis: '47%', height: 74, borderRadius: 12 },

  card: { borderWidth: 1, borderColor: '#ececed', borderRadius: 12, padding: 16, marginTop: 14, backgroundColor: '#ffffff' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  chartSkeleton: { height: 214, borderRadius: 12, marginTop: 14 },
  blockSkeleton: { height: 160, borderRadius: 12, marginTop: 14 },
  emptyText: { fontSize: 14, color: '#9ca3af' },

  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  orderRowBorder: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  orderText: { flex: 1 },
  orderNumber: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  orderShop: { fontSize: 12.5, color: '#6b7280', marginTop: 2 },
  orderRight: { alignItems: 'flex-end' },
  orderTotal: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  orderStatus: { fontSize: 12, color: '#6b7280', marginTop: 2, textTransform: 'capitalize' },

  retryBtn: { backgroundColor: '#0f172a', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  retryText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
});
