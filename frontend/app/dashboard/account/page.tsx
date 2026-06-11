'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';

type Tab = 'profile' | 'security';

interface Session {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  isCurrent: boolean;
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user, refresh } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const selectedFile = useRef<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setMsg({ type: 'error', text: 'Image must be under 5 MB' });
      return;
    }
    selectedFile.current = file;
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);

    const form = new FormData();
    if (fullName !== user?.fullName) form.append('fullName', fullName);
    if (phone !== (user?.phone ?? '')) form.append('phone', phone);
    if (selectedFile.current) form.append('avatar', selectedFile.current);

    const res = await api.postForm<{ user: { fullName: string } }>('/account/profile', form);
    if (res.success) {
      await refresh();
      selectedFile.current = null;
      setMsg({ type: 'success', text: 'Profile updated' });
    } else {
      setMsg({ type: 'error', text: res.error?.message ?? 'Failed to save' });
    }
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 480 }}>
      {/* Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.5rem' }}>
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: '#e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.75rem',
            cursor: 'pointer',
            overflow: 'hidden',
            flexShrink: 0,
            border: '2px solid var(--color-border)',
          }}
        >
          {avatarPreview
            ? <img src={avatarPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : user?.fullName?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div>
          <button
            onClick={() => fileRef.current?.click()}
            className="btn btn-secondary btn-sm"
            type="button"
          >
            Change photo
          </button>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '0.25rem' }}>
            JPG or PNG, max 5 MB
          </p>
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
      </div>

      <div className="field">
        <label>Full name</label>
        <input
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          placeholder="Your name"
        />
      </div>

      <div className="field">
        <label>Email <span style={{ color: 'var(--color-muted)', fontWeight: 400 }}>(cannot be changed)</span></label>
        <input value={user?.email ?? ''} disabled style={{ background: '#f9fafb', cursor: 'not-allowed' }} />
      </div>

      <div className="field">
        <label>Phone <span style={{ color: 'var(--color-muted)', fontWeight: 400 }}>(optional)</span></label>
        <input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="01XXXXXXXXX"
        />
      </div>

      {msg && (
        <div className={`alert alert-${msg.type}`} style={{ marginBottom: '1rem' }}>
          {msg.text}
        </div>
      )}

      <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm">
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}

// ─── Security Tab ─────────────────────────────────────────────────────────────

function SecurityTab() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeAllLoading, setRevokeAllLoading] = useState(false);

  useEffect(() => {
    api.get<{ sessions: Session[] }>('/account/sessions').then(res => {
      if (res.success) setSessions(res.data.sessions);
      setSessionsLoading(false);
    });
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    setPwSaving(true);
    setPwMsg(null);
    const res = await api.post<{ message: string }>('/account/change-password', { currentPassword, newPassword });
    if (res.success) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwMsg({ type: 'success', text: res.data.message });
    } else {
      setPwMsg({ type: 'error', text: res.error?.message ?? 'Failed to change password' });
    }
    setPwSaving(false);
  };

  const revokeSession = async (id: string) => {
    setRevoking(id);
    await api.delete(`/account/sessions/${id}`);
    setSessions(prev => prev.filter(s => s.id !== id));
    setRevoking(null);
  };

  const revokeAll = async () => {
    setRevokeAllLoading(true);
    await api.delete('/account/sessions');
    setSessions(prev => prev.filter(s => s.isCurrent));
    setRevokeAllLoading(false);
  };

  const browserName = (ua: string | null): string => {
    if (!ua) return 'Unknown device';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Browser';
  };

  const otherSessions = sessions.filter(s => !s.isCurrent);

  return (
    <div style={{ maxWidth: 480 }}>
      {/* Change password */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Change password</h2>
        <form onSubmit={handleChangePassword}>
          <div className="field">
            <label>Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          {pwMsg && (
            <div className={`alert alert-${pwMsg.type}`} style={{ marginBottom: '1rem' }}>
              {pwMsg.text}
            </div>
          )}
          <button type="submit" disabled={pwSaving} className="btn btn-primary btn-sm">
            {pwSaving ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </section>

      {/* Active sessions */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Active sessions</h2>
          {otherSessions.length > 0 && (
            <button
              onClick={revokeAll}
              disabled={revokeAllLoading}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.8125rem' }}
            >
              {revokeAllLoading ? 'Signing out…' : 'Sign out all others'}
            </button>
          )}
        </div>

        {sessionsLoading ? (
          <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>No active sessions found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {sessions.map(s => (
              <div key={s.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                background: s.isCurrent ? '#f0fdf4' : 'var(--color-surface)',
                border: `1px solid ${s.isCurrent ? '#bbf7d0' : 'var(--color-border)'}`,
                borderRadius: 6,
                gap: '1rem',
              }}>
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                    {browserName(s.userAgent)}
                    {s.isCurrent && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-success)', marginLeft: '0.5rem' }}>
                        (this session)
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '0.15rem' }}>
                    {s.ipAddress ?? 'Unknown IP'} · {new Date(s.createdAt).toLocaleDateString()}
                  </div>
                </div>
                {!s.isCurrent && (
                  <button
                    onClick={() => revokeSession(s.id)}
                    disabled={revoking === s.id}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.8125rem', flexShrink: 0 }}
                  >
                    {revoking === s.id ? '…' : 'Revoke'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 2FA placeholder */}
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          background: '#f9fafb',
          border: '1px solid var(--color-border)',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>Two-factor authentication</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '0.15rem' }}>
              Add an extra layer of security to your account.
            </div>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', background: '#e5e7eb', padding: '0.25rem 0.625rem', borderRadius: 999 }}>
            Coming soon
          </span>
        </div>
      </section>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>('profile');

  if (loading) return <div className="dashboard-loading">Loading…</div>;
  if (!user) return null;

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 600 }}>Account</h1>
        <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          Manage your profile and security settings.
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: 0,
        borderBottom: '1px solid var(--color-border)',
        marginBottom: '1.5rem',
      }}>
        {(['profile', 'security'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none',
              border: 'none',
              padding: '0.625rem 1.25rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? 'var(--color-text)' : 'var(--color-muted)',
              borderBottom: tab === t ? '2px solid var(--color-text)' : '2px solid transparent',
              marginBottom: -1,
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'profile' ? <ProfileTab /> : <SecurityTab />}
    </div>
  );
}
