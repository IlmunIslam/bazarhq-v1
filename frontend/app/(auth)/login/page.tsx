'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const [serverError, setServerError] = useState('');
  const router = useRouter();
  const { refresh } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError('');
    const res = await api.post<{ user: { id: string; email: string; fullName: string } }>(
      '/auth/login',
      data
    );

    if (res.success) {
      // Load the now-authenticated user into context before navigating; the
      // AuthProvider doesn't remount on this soft navigation, so without this the
      // dashboard guard sees a stale `user = null` and bounces back to login.
      await refresh();
      router.replace('/dashboard');
    } else {
      setServerError(res.error.message);
    }
  };

  return (
    <div className="auth-card">
      <h1>Welcome back</h1>
      <p className="subtitle">Log in to your merchant account.</p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="field">
          <label>Email</label>
          <input
            {...register('email')}
            type="email"
            placeholder="you@example.com"
            className={errors.email ? 'error' : ''}
          />
          {errors.email && <span className="field-error">{errors.email.message}</span>}
        </div>

        <div className="field">
          <label>Password</label>
          <input
            {...register('password')}
            type="password"
            className={errors.password ? 'error' : ''}
          />
          {errors.password && <span className="field-error">{errors.password.message}</span>}
        </div>

        <p style={{ textAlign: 'right', fontSize: '0.8rem', marginBottom: '1rem' }}>
          <Link href="/forgot-password" style={{ color: 'var(--color-muted)', textDecoration: 'none' }}>
            Forgot password?
          </Link>
        </p>

        {serverError && <div className="alert alert-error">{serverError}</div>}

        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Logging in…' : 'Log In'}
        </button>
      </form>

      <p className="auth-footer">
        Don&apos;t have an account? <Link href="/register">Create one</Link>
      </p>
    </div>
  );
}
