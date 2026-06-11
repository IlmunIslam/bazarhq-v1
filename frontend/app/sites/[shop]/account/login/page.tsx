'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';

export default function CustomerLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await api.post<{ customer: { phone: string; name: string } }>(
      '/customer/auth/login',
      { phone }
    );

    if (res.success) {
      router.push('./orders');
    } else {
      setError(res.error?.message ?? 'Login failed');
    }
    setLoading(false);
  };

  return (
    <div className="sf-container" style={{ maxWidth: 400, margin: '3rem auto', padding: '0 1rem' }}>
      <div style={{
        background: '#fff',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        padding: '2rem',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.375rem' }}>
          View your orders
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
          Enter the phone number you used when placing your order.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Phone number</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
              required
              autoFocus
            />
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ background: 'var(--sf-primary)', borderColor: 'var(--sf-primary)' }}
          >
            {loading ? 'Checking…' : 'View my orders'}
          </button>
        </form>

        <p style={{ fontSize: '0.8125rem', color: '#9ca3af', marginTop: '1rem', textAlign: 'center' }}>
          You can also <a href="../track" style={{ color: 'var(--sf-primary)' }}>track a specific order</a> by order number.
        </p>
      </div>
    </div>
  );
}
