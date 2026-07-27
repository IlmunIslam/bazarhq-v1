import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import RevenueChart from '@/components/RevenueChart';
import Skeleton from '@/components/Skeleton';
import {
  fetchOverview,
  fetchTopProducts,
  fetchVisitors,
  formatNum,
  type OverviewData,
  type Period,
  type TopProduct,
  type VisitorData,
} from '@/lib/analytics-api';
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/orders-api';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: '7 days' },
  { value: 'month', label: '30 days' },
];

export default function AnalyticsScreen() {
  const [period, setPeriod] = useState<Period>('month');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [visitors, setVisitors] = useState<VisitorData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchOverview(period), fetchTopProducts(period), fetchVisitors(period)]).then(
      ([ov, tp, vis]) => {
        if (!active) return;
        setOverview(ov.success ? ov.data : null);
        setTopProducts(tp.success ? tp.data.topProducts : []);
        setVisitors(vis.success ? vis.data : null);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [period]);

  const statusBreakdown = overview?.statusBreakdown ?? {};
  const totalOrders = Object.values(statusBreakdown).reduce((a, b) => a + b, 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.periodRow}>
        {PERIODS.map(p => {
          const active = period === p.value;
          return (
            <Pressable
              key={p.value}
              style={[styles.periodBtn, active && styles.periodActive]}
              onPress={() => setPeriod(p.value)}
            >
              <Text style={[styles.periodText, active && styles.periodTextActive]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <>
          <View style={styles.kpiGrid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} style={styles.kpiSkeleton} />
            ))}
          </View>
          <Skeleton style={styles.chartSkeleton} />
          <Skeleton style={styles.blockSkeleton} />
        </>
      ) : (
        <>
          {/* KPIs */}
          <View style={styles.kpiGrid}>
            <Kpi label="Revenue" value={`৳${formatNum(overview?.revenue ?? 0)}`} />
            <Kpi label="Orders" value={formatNum(overview?.orderCount ?? 0)} />
            <Kpi label="Unique visitors" value={formatNum(visitors?.uniqueVisitors ?? 0)} />
            <Kpi label="Page views" value={formatNum(visitors?.totalViews ?? 0)} />
            <Kpi label="Conversion" value={`${visitors?.conversionRate ?? 0}%`} />
          </View>

          {/* Revenue chart */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Revenue · last 30 days</Text>
            <RevenueChart data={overview?.dailyRevenue ?? []} />
          </View>

          {/* Top products */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Top products</Text>
            {topProducts.length === 0 ? (
              <Text style={styles.emptyText}>No orders yet for this period.</Text>
            ) : (
              topProducts.map((p, i) => (
                <View key={p.productId} style={[styles.topRow, i > 0 && styles.topRowBorder]}>
                  <Text style={styles.topName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.topQty}>{p.quantity} sold</Text>
                  <Text style={styles.topRevenue}>৳{formatNum(p.revenue)}</Text>
                </View>
              ))
            )}
          </View>

          {/* Orders by status */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Orders by status</Text>
            {totalOrders === 0 ? (
              <Text style={styles.emptyText}>No orders yet.</Text>
            ) : (
              Object.entries(statusBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => {
                  const pct = Math.round((count / totalOrders) * 100);
                  const color = STATUS_COLORS[status] ?? '#6b7280';
                  return (
                    <View key={status} style={styles.statusRow}>
                      <View style={styles.statusLabelRow}>
                        <Text style={styles.statusLabel}>{STATUS_LABELS[status] ?? status}</Text>
                        <Text style={styles.statusCount}>{count} ({pct}%)</Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
                      </View>
                    </View>
                  );
                })
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 16, paddingBottom: 40 },

  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  periodBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#ffffff' },
  periodActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  periodText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  periodTextActive: { color: '#ffffff' },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  kpiCard: { flexGrow: 1, flexBasis: '47%', borderWidth: 1, borderColor: '#ececed', borderRadius: 12, padding: 14, backgroundColor: '#fafafa' },
  kpiLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  kpiValue: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginTop: 4 },
  kpiSkeleton: { flexGrow: 1, flexBasis: '47%', height: 74, borderRadius: 12 },

  card: { borderWidth: 1, borderColor: '#ececed', borderRadius: 12, padding: 16, marginTop: 14, backgroundColor: '#ffffff' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  chartSkeleton: { height: 214, borderRadius: 12, marginTop: 14 },
  blockSkeleton: { height: 160, borderRadius: 12, marginTop: 14 },
  emptyText: { fontSize: 14, color: '#9ca3af' },

  topRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  topRowBorder: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  topName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0f172a' },
  topQty: { fontSize: 13, color: '#6b7280' },
  topRevenue: { fontSize: 14, fontWeight: '700', color: '#0f172a', minWidth: 70, textAlign: 'right' },

  statusRow: { marginBottom: 12 },
  statusLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  statusLabel: { fontSize: 13, color: '#374151', fontWeight: '600' },
  statusCount: { fontSize: 13, color: '#9ca3af' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: '#f3f4f6', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
});
