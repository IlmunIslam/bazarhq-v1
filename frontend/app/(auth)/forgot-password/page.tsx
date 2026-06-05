'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { api } from '@/lib/api-client';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError('');
    const res = await api.post<{ message: string }>('/auth/forgot-password', data);

    if (res.success) {
      setSent(true);
    } else {
      setServerError(res.error.message);
    }
  };

  if (sent) {
    return (
      <div className="auth-card">
        <h1>Check your email</h1>
        <div className="alert alert-success">
          If an account with that email exists, we sent a password reset link. Check your inbox.
        </div>
        <p className="auth-footer">
          <Link href="/login">Back to login</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h1>Forgot password?</h1>
      <p className="subtitle">Enter your email and we&apos;ll send you a reset link.</p>

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

        {serverError && <div className="alert alert-error">{serverError}</div>}

        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Sending…' : 'Send Reset Link'}
        </button>
      </form>

      <p className="auth-footer">
        <Link href="/login">Back to login</Link>
      </p>
    </div>
  );
}
