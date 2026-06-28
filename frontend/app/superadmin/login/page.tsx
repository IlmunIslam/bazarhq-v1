'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useAdminAuth } from '@/lib/admin-auth-context';

type Step = 'credentials' | 'totp';

export default function AdminLoginPage() {
  const router = useRouter();
  const { refresh } = useAdminAuth();
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await api.post<{
      requiresTotp?: boolean;
      tempToken?: string;
      admin?: { id: string };
    }>('/admin/auth/login', { email, password });

    setLoading(false);

    if (!res.success) {
      setError(res.error?.message ?? 'Login failed');
      return;
    }

    if (res.data.requiresTotp && res.data.tempToken) {
      setTempToken(res.data.tempToken);
      setStep('totp');
      return;
    }

    // Load the now-authenticated admin into context before navigating; the
    // AdminAuthProvider lives in the shared superadmin layout and won't remount
    // on this soft navigation, so without this the dashboard sees a stale
    // `admin = null` and bounces straight back here.
    await refresh();
    router.replace('/superadmin');
  };

  const handleTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await api.post('/admin/auth/verify-totp', {
      tempToken,
      code: totpCode.replace(/\s/g, ''),
    });

    setLoading(false);

    if (!res.success) {
      setError(res.error?.message ?? 'Invalid code');
      return;
    }

    await refresh();
    router.replace('/superadmin');
  };

  return (
    <div className="admin-login-container">
      <div className="auth-card admin-login-card">
        <div className="admin-login-badge" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        {step === 'credentials' ? (
          <>
            <h1>Admin Login</h1>
            <p className="subtitle">BazarHQ Super Admin Panel</p>

            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleCredentials}>
              <div className="field">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="username"
                />
              </div>
              <div className="field">
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1>Two-Factor Auth</h1>
            <p className="subtitle">Enter the 6-digit code from your authenticator app.</p>

            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleTotp}>
              <div className="field">
                <label>Authentication Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9 ]*"
                  maxLength={7}
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value)}
                  placeholder="000000"
                  required
                  autoFocus
                  style={{ letterSpacing: '0.2em', fontSize: '1.25rem', textAlign: 'center' }}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Verifying…' : 'Verify'}
              </button>
              <button
                type="button"
                className="btn-link"
                style={{ display: 'block', textAlign: 'center', marginTop: '0.75rem', width: '100%' }}
                onClick={() => { setStep('credentials'); setError(''); setTotpCode(''); }}
              >
                Back to login
              </button>
            </form>
          </>
        )}

        <div className="admin-login-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <span>Authorized personnel only · access is logged.</span>
        </div>
      </div>
    </div>
  );
}
