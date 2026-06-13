'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/lib/admin-auth-context';
import { api } from '@/lib/api-client';
import AdminShell from './_components/AdminShell';

interface OverviewData {
  totalMerchants: number;
  activeMerchants: number;
  publishedShops: number;
  totalOrders: number;
  totalRevenue: string;
}

export default function SuperAdminPage() {
  const { admin, loading } = useAdminAuth();
  const router = useRouter();
  const [data, setData] = useState<OverviewData | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !admin) {
      router.replace('/superadmin/login');
    }
  }, [admin, loading, router]);

  useEffect(() => {
    if (!admin) return;
    api.get<OverviewData>('/admin/analytics/overview').then(res => {
      if (res.success) setData(res.data);
      setFetching(false);
    });
  }, [admin]);

  if (loading || !admin) return <div className="dashboard-loading">Loading…</div>;

  return (
    <AdminShell>
      <div className="sa-page">
        <div className="sa-page-header">
          <h1 className="sa-page-title">Platform Overview</h1>
        </div>

        {fetching ? (
          <div className="sa-loading">Loading stats…</div>
        ) : data ? (
          <div className="sa-stat-grid">
            <StatCard label="Total Merchants" value={data.totalMerchants} />
            <StatCard label="Active Merchants" value={data.activeMerchants} />
            <StatCard label="Published Shops" value={data.publishedShops} />
            <StatCard label="Total Orders" value={data.totalOrders} />
            <StatCard
              label="Platform Revenue"
              value={`৳${Number(data.totalRevenue).toLocaleString()}`}
              wide
            />
          </div>
        ) : (
          <p className="sa-muted">Failed to load overview data.</p>
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
