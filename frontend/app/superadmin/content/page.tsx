'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/lib/admin-auth-context';
import { api } from '@/lib/api-client';
import AdminShell from '../_components/AdminShell';

interface Announcement {
  id: string;
  title: string;
  body: string;
  targetRole: string;
  isActive: boolean;
  createdAt: string;
  expiresAt: string | null;
}

const TARGET_LABELS: Record<string, string> = {
  merchant: 'Merchants',
  customer: 'Customers',
  all: 'Everyone',
};

export default function AnnouncementsPage() {
  const { admin, loading } = useAdminAuth();
  const router = useRouter();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [fetching, setFetching] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', targetRole: 'merchant', isActive: true });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !admin) router.replace('/superadmin/login');
  }, [admin, loading, router]);

  useEffect(() => {
    if (!admin) return;
    api.get<{ announcements: Announcement[] }>('/admin/announcements').then(res => {
      if (res.success) setAnnouncements(res.data.announcements);
      setFetching(false);
    });
  }, [admin]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    const res = await api.post<{ announcement: Announcement }>('/admin/announcements', form);
    setSaving(false);
    if (res.success) {
      setAnnouncements(prev => [res.data.announcement, ...prev]);
      setForm({ title: '', body: '', targetRole: 'merchant', isActive: true });
      setShowForm(false);
    } else {
      setFormError((res as any).error?.message ?? 'Failed to create');
    }
  };

  const handleDeactivate = async (id: string) => {
    setDeactivatingId(id);
    const res = await api.delete(`/admin/announcements/${id}`);
    setDeactivatingId(null);
    if (res.success) {
      setAnnouncements(prev =>
        prev.map(a => a.id === id ? { ...a, isActive: false } : a)
      );
    }
  };

  if (loading || !admin) return <div className="dashboard-loading">Loading…</div>;

  return (
    <AdminShell>
      <div className="sa-page">
        <div className="sa-page-header">
          <h1 className="sa-page-title">Announcements</h1>
          <button className="btn btn-sm btn-primary" onClick={() => setShowForm(v => !v)}>
            {showForm ? 'Cancel' : '+ New Announcement'}
          </button>
        </div>

        {showForm && (
          <div className="sa-card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '1rem' }}>New Announcement</h2>
            {formError && <div className="alert alert-error">{formError}</div>}
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  required
                  maxLength={200}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Body</label>
                <textarea
                  className="textarea"
                  rows={3}
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
                  <label>Target Audience</label>
                  <select
                    className="select"
                    value={form.targetRole}
                    onChange={e => setForm(f => ({ ...f, targetRole: e.target.value }))}
                  >
                    <option value="merchant">Merchants</option>
                    <option value="customer">Customers</option>
                    <option value="all">Everyone</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="submit" className="btn btn-sm btn-primary" disabled={saving}>
                  {saving ? 'Creating…' : 'Create Announcement'}
                </button>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {fetching ? (
          <div className="sa-loading">Loading announcements…</div>
        ) : announcements.length === 0 ? (
          <div className="sa-empty">No announcements yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {announcements.map(a => (
              <div key={a.id} className="sa-card" style={{ padding: '1rem 1.25rem', opacity: a.isActive ? 1 : 0.55 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{a.title}</span>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '0.15rem 0.4rem',
                        borderRadius: 999,
                        background: a.isActive ? 'var(--color-success-bg)' : '#f3f4f6',
                        color: a.isActive ? 'var(--color-success)' : 'var(--color-muted)',
                      }}>
                        {a.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                        → {TARGET_LABELS[a.targetRole] ?? a.targetRole}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', whiteSpace: 'pre-line' }}>{a.body}</p>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '0.5rem' }}>
                      Created {new Date(a.createdAt).toLocaleString('en-GB')}
                      {a.expiresAt && ` · Expires ${new Date(a.expiresAt).toLocaleDateString('en-GB')}`}
                    </div>
                  </div>
                  {a.isActive && (
                    <button
                      className="btn btn-sm btn-secondary"
                      style={{ fontSize: '0.8125rem', flexShrink: 0 }}
                      onClick={() => handleDeactivate(a.id)}
                      disabled={deactivatingId === a.id}
                    >
                      {deactivatingId === a.id ? '…' : 'Deactivate'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
