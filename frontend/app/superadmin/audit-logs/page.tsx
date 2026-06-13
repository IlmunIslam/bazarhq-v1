'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/lib/admin-auth-context';
import { api } from '@/lib/api-client';
import AdminShell from '../_components/AdminShell';

interface AuditLog {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  MERCHANT_SUSPENDED: '#ef4444',
  MERCHANT_ACTIVATED: '#10b981',
  SHOP_SUSPENDED: '#ef4444',
  SHOP_PUBLISHED: '#10b981',
  SHOP_DRAFT: '#f59e0b',
  TOTP_ENABLED: '#3b82f6',
  TOTP_DISABLED: '#f59e0b',
  ANNOUNCEMENT_CREATED: '#8b5cf6',
};

export default function AuditLogsPage() {
  const { admin, loading } = useAdminAuth();
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [fetching, setFetching] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionFilter, setActionFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!loading && !admin) router.replace('/superadmin/login');
  }, [admin, loading, router]);

  const fetchLogs = async (cursor?: string, action?: string) => {
    const params = new URLSearchParams({ limit: '50' });
    if (cursor) params.set('cursor', cursor);
    if (action) params.set('action', action);

    const res = await api.get<{ logs: AuditLog[]; nextCursor: string | null }>(
      `/admin/audit-logs?${params}`
    );
    if (res.success) {
      return { logs: res.data.logs, nextCursor: res.data.nextCursor };
    }
    return { logs: [], nextCursor: null };
  };

  useEffect(() => {
    if (!admin) return;
    setFetching(true);
    fetchLogs(undefined, searchQuery || undefined).then(({ logs, nextCursor }) => {
      setLogs(logs);
      setNextCursor(nextCursor);
      setFetching(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, searchQuery]);

  const handleLoadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    const { logs: more, nextCursor: nc } = await fetchLogs(nextCursor, searchQuery || undefined);
    setLogs(prev => [...prev, ...more]);
    setNextCursor(nc);
    setLoadingMore(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(actionFilter);
  };

  if (loading || !admin) return <div className="dashboard-loading">Loading…</div>;

  return (
    <AdminShell>
      <div className="sa-page">
        <div className="sa-page-header">
          <h1 className="sa-page-title">Audit Logs</h1>
          <span className="sa-muted">{logs.length} entries loaded</span>
        </div>

        <div className="sa-toolbar" style={{ marginBottom: '1rem' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              className="sa-search"
              placeholder="Filter by action (e.g. SUSPEND)"
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
            />
            <button type="submit" className="btn btn-sm btn-secondary">Filter</button>
            {searchQuery && (
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => { setActionFilter(''); setSearchQuery(''); }}
              >
                Clear
              </button>
            )}
          </form>
        </div>

        {fetching ? (
          <div className="sa-loading">Loading audit logs…</div>
        ) : logs.length === 0 ? (
          <div className="sa-empty">No audit log entries found.</div>
        ) : (
          <>
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Admin</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td className="sa-muted" style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                        {new Date(log.createdAt).toLocaleString('en-GB')}
                      </td>
                      <td style={{ fontSize: '0.875rem' }}>{log.actorEmail}</td>
                      <td>
                        <span style={{
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: ACTION_COLORS[log.action] ?? 'var(--color-text)',
                          background: `${ACTION_COLORS[log.action] ?? '#6b7280'}18`,
                          padding: '0.15rem 0.4rem',
                          borderRadius: 4,
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8125rem' }}>
                        {log.targetType && log.targetId ? (
                          <span className="sa-muted">{log.targetType} <code style={{ fontSize: '0.75rem', background: '#f3f4f6', padding: '1px 4px', borderRadius: 3 }}>{log.targetId.slice(0, 8)}…</code></span>
                        ) : '—'}
                      </td>
                      <td className="sa-muted" style={{ fontSize: '0.8125rem', fontFamily: 'monospace' }}>
                        {log.ipAddress ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {nextCursor && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
