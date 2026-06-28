'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/lib/admin-auth-context';
import { api } from '@/lib/api-client';
import AdminShell from '../_components/AdminShell';

interface Shop {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  publishedAt: string | null;
  createdAt: string;
}

interface Merchant {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: 'active' | 'suspended';
  emailVerified: boolean;
  createdAt: string;
  shop: Shop | null;
}

type StatusFilter = 'all' | 'active' | 'suspended';

const STATUS_COLORS: Record<string, string> = {
  active: 'var(--color-success)',
  suspended: 'var(--color-error)',
  published: 'var(--color-success)',
  draft: 'var(--color-muted)',
};

export default function MerchantsPage() {
  const { admin, loading } = useAdminAuth();
  const router = useRouter();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [fetching, setFetching] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!loading && !admin) router.replace('/superadmin/login');
  }, [admin, loading, router]);

  useEffect(() => {
    if (!admin) return;
    setFetching(true);
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (query) params.set('search', query);
    api.get<{ merchants: Merchant[] }>(`/admin/merchants?${params}`).then(res => {
      if (res.success) setMerchants(res.data.merchants);
      setFetching(false);
    });
  }, [admin, statusFilter, query]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(search);
  };

  const toggleMerchantStatus = async (merchant: Merchant) => {
    const newStatus = merchant.status === 'active' ? 'suspended' : 'active';
    setActionId(merchant.id);
    const res = await api.patch(`/admin/merchants/${merchant.id}`, { status: newStatus });
    setActionId(null);
    if (res.success) {
      setMerchants(prev =>
        prev.map(m => m.id === merchant.id ? { ...m, status: newStatus } : m)
      );
      setMsg({ id: merchant.id, type: 'success', text: newStatus === 'suspended' ? 'Suspended' : 'Activated' });
    } else {
      setMsg({ id: merchant.id, type: 'error', text: (res as any).error?.message ?? 'Failed' });
    }
    setTimeout(() => setMsg(null), 3000);
  };

  const verifyEmail = async (merchant: Merchant) => {
    setActionId(`verify-${merchant.id}`);
    const res = await api.post(`/admin/merchants/${merchant.id}/verify-email`, {});
    setActionId(null);
    if (res.success) {
      setMerchants(prev =>
        prev.map(m => m.id === merchant.id ? { ...m, emailVerified: true } : m)
      );
      setMsg({ id: merchant.id, type: 'success', text: 'Email verified' });
    } else {
      setMsg({ id: merchant.id, type: 'error', text: (res as any).error?.message ?? 'Failed' });
    }
    setTimeout(() => setMsg(null), 3000);
  };

  const toggleShopStatus = async (merchant: Merchant, shop: Shop) => {
    const newStatus = shop.status === 'suspended' ? 'published' : 'suspended';
    setActionId(`shop-${shop.id}`);
    const res = await api.patch(`/admin/shops/${shop.id}`, { status: newStatus });
    setActionId(null);
    if (res.success) {
      setMerchants(prev =>
        prev.map(m =>
          m.id === merchant.id && m.shop
            ? { ...m, shop: { ...m.shop, status: newStatus } }
            : m
        )
      );
    }
  };

  if (loading || !admin) return <div className="dashboard-loading">Loading…</div>;

  return (
    <AdminShell>
      <div className="sa-page">
        <div className="sa-page-header">
          <h1 className="sa-page-title">Merchants</h1>
          <span className="sa-muted">{merchants.length} result{merchants.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Toolbar */}
        <div className="sa-toolbar">
          <div className="sa-status-tabs">
            {(['all', 'active', 'suspended'] as StatusFilter[]).map(s => (
              <button
                key={s}
                className={`sa-status-tab${statusFilter === s ? ' active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              className="sa-search"
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button type="submit" className="btn btn-sm btn-secondary">Search</button>
            {query && (
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => { setSearch(''); setQuery(''); }}
              >
                Clear
              </button>
            )}
          </form>
        </div>

        {/* Table */}
        <div className="sa-table-wrap">
          {fetching ? (
            <div className="sa-loading">Loading…</div>
          ) : merchants.length === 0 ? (
            <div className="sa-empty">No merchants found.</div>
          ) : (
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Status</th>
                  <th>Shop</th>
                  <th>Shop Status</th>
                  <th>Joined</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {merchants.map(m => {
                  const feedback = msg?.id === m.id ? msg : null;
                  const shopFeedback = msg?.id === `shop-${m.shop?.id}` ? msg : null;
                  return (
                    <tr key={m.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{m.fullName}</div>
                        <div className="sa-muted" style={{ fontSize: '0.8125rem' }}>{m.email}</div>
                        {m.phone && <div className="sa-muted" style={{ fontSize: '0.8125rem' }}>{m.phone}</div>}
                      </td>
                      <td>
                        <span className="sa-status-dot" style={{ color: STATUS_COLORS[m.status] ?? 'inherit' }}>
                          ● {m.status}
                        </span>
                        {feedback && (
                          <div style={{ fontSize: '0.75rem', color: feedback.type === 'success' ? 'var(--color-success)' : 'var(--color-error)', marginTop: 2 }}>
                            {feedback.text}
                          </div>
                        )}
                      </td>
                      <td>
                        {m.shop ? (
                          <>
                            <div style={{ fontWeight: 500 }}>{m.shop.name}</div>
                            <div className="sa-muted" style={{ fontSize: '0.8125rem' }}>{m.shop.subdomain}.bazarhq.com</div>
                          </>
                        ) : (
                          <span className="sa-muted">—</span>
                        )}
                      </td>
                      <td>
                        {m.shop ? (
                          <span style={{ color: STATUS_COLORS[m.shop.status] ?? 'inherit', fontSize: '0.875rem' }}>
                            ● {m.shop.status}
                          </span>
                        ) : '—'}
                        {shopFeedback && (
                          <div style={{ fontSize: '0.75rem', color: shopFeedback.type === 'success' ? 'var(--color-success)' : 'var(--color-error)', marginTop: 2 }}>
                            {shopFeedback.text}
                          </div>
                        )}
                      </td>
                      <td className="sa-muted" style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                        {new Date(m.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {!m.emailVerified && (
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => verifyEmail(m)}
                              disabled={actionId === `verify-${m.id}`}
                              style={{ fontSize: '0.8125rem' }}
                            >
                              {actionId === `verify-${m.id}` ? '…' : 'Verify email'}
                            </button>
                          )}
                          <button
                            className={`btn btn-sm ${m.status === 'active' ? 'btn-danger-outline' : 'btn-secondary'}`}
                            onClick={() => toggleMerchantStatus(m)}
                            disabled={actionId === m.id}
                            style={{ fontSize: '0.8125rem' }}
                          >
                            {actionId === m.id ? '…' : m.status === 'active' ? 'Suspend' : 'Activate'}
                          </button>
                          {m.shop && (
                            <button
                              className={`btn btn-sm ${m.shop.status === 'suspended' ? 'btn-secondary' : 'btn-secondary'}`}
                              onClick={() => toggleShopStatus(m, m.shop!)}
                              disabled={actionId === `shop-${m.shop.id}`}
                              style={{ fontSize: '0.8125rem' }}
                            >
                              {actionId === `shop-${m.shop.id}` ? '…' : m.shop.status === 'suspended' ? 'Unsuspend Shop' : 'Suspend Shop'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
