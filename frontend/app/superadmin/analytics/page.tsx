'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAdminAuth } from '@/lib/admin-auth-context';
import { api } from '@/lib/api-client';
import AdminShell from '../_components/AdminShell';

interface DayPoint { date: string; count: number; revenue: string; }

interface RecentOrder {
  id: string;
  orderNumber: string;
  total: string;
  status: string;
  createdAt: string;
  shop: { name: string; subdomain: string };
}

interface AnalyticsData {
  totalMerchants: number;
  activeMerchants: number;
  publishedShops: number;
  totalOrders: number;
  totalRevenue: string;
  ordersByDay: DayPoint[];
  recentOrders: RecentOrder[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  processing: '#8b5cf6',
  shipped: '#0ea5e9',
  delivered: '#10b981',
  cancelled: '#ef4444',
};

export default function AdminAnalyticsPage() {
  const { admin, loading } = useAdminAuth();
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !admin) router.replace('/superadmin/login');
  }, [admin, loading, router]);

  useEffect(() => {
    if (!admin) return;
    api.get<AnalyticsData>('/admin/analytics/overview').then(res => {
      if (res.success) setData(res.data);
      setFetching(false);
    });
  }, [admin]);

  if (loading || !admin) return <div className="dashboard-loading">Loading…</div>;

  return (
    <AdminShell>
      <div className="sa-page">
        <div className="sa-page-header">
          <h1 className="sa-page-title">Platform Analytics</h1>
        </div>

        {fetching ? (
          <div className="sa-loading">Loading analytics…</div>
        ) : !data ? (
          <p className="sa-muted">Failed to load data.</p>
        ) : (
          <>
            {/* KPI cards */}
            <div className="sa-stat-grid" style={{ marginBottom: '1.5rem' }}>
              <StatCard label="Total Merchants" value={data.totalMerchants} />
              <StatCard label="Active Merchants" value={data.activeMerchants} />
              <StatCard label="Published Shops" value={data.publishedShops} />
              <StatCard label="Total Orders" value={data.totalOrders} />
              <StatCard label="Platform Revenue" value={`৳${Number(data.totalRevenue).toLocaleString()}`} wide />
            </div>

            {/* 30-day chart */}
            {data.ordersByDay.length > 0 && (
              <div className="sa-card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '1rem' }}>
                  Orders — Last 30 Days
                </h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.ordersByDay} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={d => d.slice(5)}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(59,130,246,0.08)' }}
                      contentStyle={{ border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }}
                      formatter={(v) => [v ?? 0, 'Orders']}
                      labelFormatter={l => `Date: ${l}`}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Recent orders */}
            {data.recentOrders.length > 0 && (
              <div className="sa-card">
                <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: '0.9375rem' }}>
                  Recent Orders (Platform-wide)
                </div>
                <table className="sa-table">
                  <thead>
                    <tr>
                      <th>Order #</th>
                      <th>Shop</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentOrders.map(o => (
                      <tr key={o.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{o.orderNumber}</td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{o.shop.name}</div>
                          <div className="sa-muted" style={{ fontSize: '0.75rem' }}>{o.shop.subdomain}.bazarhq.com</div>
                        </td>
                        <td style={{ fontWeight: 600 }}>৳{Number(o.total).toLocaleString()}</td>
                        <td>
                          <span style={{
                            display: 'inline-block',
                            padding: '0.15rem 0.5rem',
                            borderRadius: 999,
                            background: `${STATUS_COLORS[o.status] ?? '#6b7280'}22`,
                            color: STATUS_COLORS[o.status] ?? '#6b7280',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          }}>
                            {o.status}
                          </span>
                        </td>
                        <td className="sa-muted" style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                          {new Date(o.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}

function StatCard({ label, value, wide }: { label: string; value: string | number; wide?: boolean }) {
  return (
    <div className={`sa-stat-card${wide ? ' sa-stat-card-wide' : ''}`}>
      <div className="sa-stat-value">{value}</div>
      <div className="sa-stat-label">{label}</div>
    </div>
  );
}
