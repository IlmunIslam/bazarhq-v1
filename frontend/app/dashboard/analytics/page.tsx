'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api-client';

// Recharts must be loaded client-side only (no SSR)
const RevenueChart = dynamic(() => import('./_components/RevenueChart'), { ssr: false });

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
] as const;

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  processing: '#8b5cf6',
  shipped: '#06b6d4',
  delivered: '#10b981',
  cancelled: '#ef4444',
};

interface OverviewData {
  revenue: number;
  orderCount: number;
  statusBreakdown: Record<string, number>;
  dailyRevenue: { date: string; revenue: number }[];
}

interface TopProduct {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
}

interface VisitorData {
  totalViews: number;
  uniqueVisitors: number;
  conversionRate: number;
  orderCount: number;
}

function fmt(n: number) {
  return n.toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('month');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [visitors, setVisitors] = useState<VisitorData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get<OverviewData>(`/analytics/overview?period=${period}`),
      api.get<{ topProducts: TopProduct[] }>(`/analytics/top-products?period=${period}`),
      api.get<VisitorData>(`/analytics/visitors?period=${period}`),
    ]).then(([ov, tp, vis]) => {
      if (ov.success) setOverview(ov.data);
      if (tp.success) setTopProducts(tp.data.topProducts);
      if (vis.success) setVisitors(vis.data);
      setLoading(false);
    });
  }, [period]);

  const statusBreakdown = overview?.statusBreakdown ?? {};
  const totalOrders = Object.values(statusBreakdown).reduce((a, b) => a + b, 0);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 600 }}>Analytics</h1>
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              style={{
                padding: '0.375rem 0.875rem',
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                background: period === opt.value ? 'var(--color-primary)' : 'var(--color-surface)',
                color: period === opt.value ? '#fff' : 'var(--color-text)',
                fontWeight: period === opt.value ? 500 : 400,
                cursor: 'pointer',
                fontSize: '0.8125rem',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="dashboard-loading">Loading analytics…</div>
      ) : (
        <>
          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <StatCard label="Revenue (৳)" value={`৳${fmt(overview?.revenue ?? 0)}`} />
            <StatCard label="Orders" value={fmt(overview?.orderCount ?? 0)} />
            <StatCard label="Unique Visitors" value={fmt(visitors?.uniqueVisitors ?? 0)} />
            <StatCard label="Page Views" value={fmt(visitors?.totalViews ?? 0)} />
            <StatCard label="Conversion Rate" value={`${visitors?.conversionRate ?? 0}%`} />
          </div>

          {/* Revenue chart */}
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: '1.25rem',
            marginBottom: '1.5rem',
          }}>
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '1rem' }}>Revenue — Last 30 days</h2>
            <RevenueChart data={overview?.dailyRevenue ?? []} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'start' }}>
            {/* Top products */}
            <div style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: '1.25rem',
            }}>
              <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '1rem' }}>Top Products</h2>
              {topProducts.length === 0 ? (
                <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>No orders yet for this period.</p>
              ) : (
                <table style={{ width: '100%', fontSize: '0.8125rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                      <th style={{ paddingBottom: '0.5rem', fontWeight: 600 }}>Product</th>
                      <th style={{ paddingBottom: '0.5rem', fontWeight: 600, textAlign: 'right' }}>Qty</th>
                      <th style={{ paddingBottom: '0.5rem', fontWeight: 600, textAlign: 'right' }}>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p, i) => (
                      <tr key={p.productId} style={{ borderBottom: i < topProducts.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                        <td style={{ padding: '0.5rem 0', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                        <td style={{ padding: '0.5rem 0', textAlign: 'right', color: 'var(--color-muted)' }}>{p.quantity}</td>
                        <td style={{ padding: '0.5rem 0', textAlign: 'right', fontWeight: 500 }}>৳{fmt(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Order status breakdown */}
            <div style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: '1.25rem',
            }}>
              <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '1rem' }}>Orders by Status</h2>
              {totalOrders === 0 ? (
                <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>No orders yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {Object.entries(statusBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, count]) => {
                      const pct = Math.round((count / totalOrders) * 100);
                      return (
                        <div key={status}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                            <span style={{ textTransform: 'capitalize' }}>{status}</span>
                            <span style={{ color: 'var(--color-muted)' }}>{count} ({pct}%)</span>
                          </div>
                          <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${pct}%`,
                              background: STATUS_COLORS[status] ?? '#6b7280',
                              borderRadius: 3,
                            }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      padding: '1rem 1.25rem',
    }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontWeight: 500, marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{value}</div>
    </div>
  );
}
