'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';

type State = 'loading' | 'success' | 'error';

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const token = params.get('token');

  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('No verification token found. Please check your email link.');
      return;
    }

    api.post<{ message: string }>('/auth/verify-email', { token }).then((res) => {
      if (res.success) {
        setState('success');
        setMessage(res.data.message);
      } else {
        setState('error');
        setMessage(res.error.message);
      }
    });
  }, [token]);

  return (
    <div className="auth-card">
      <h1>Email Verification</h1>

      {state === 'loading' && <p className="subtitle">Verifying your email…</p>}

      {state === 'success' && (
        <>
          <div className="alert alert-success">{message}</div>
          <Link href="/login" className="btn btn-primary" style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }}>
            Log In
          </Link>
        </>
      )}

      {state === 'error' && (
        <>
          <div className="alert alert-error">{message}</div>
          <p className="auth-footer">
            <Link href="/register">Register again</Link> or <Link href="/login">Log in</Link>
          </p>
        </>
      )}
    </div>
  );
}
