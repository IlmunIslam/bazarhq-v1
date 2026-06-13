'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';

type Step = 'credentials' | 'totp';

export default function AdminLoginPage() {
  const router = useRouter();
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

    router.replace('/superadmin');
  };

  return (
    <div className="auth-container">
      <div className="auth-card" style={{ maxWidth: 380 }}>
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
      </div>
    </div>
  );
}
