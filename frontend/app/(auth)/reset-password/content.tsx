'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api-client';

const schema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

export default function ResetPasswordContent() {
  const params = useSearchParams();
  const token = params.get('token');

  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError('');
    if (!token) {
      setServerError('Missing reset token. Please use the link from your email.');
      return;
    }

    const res = await api.post<{ message: string }>('/auth/reset-password', {
      token,
      password: data.password,
    });

    if (res.success) {
      setDone(true);
    } else {
      setServerError(res.error.message);
    }
  };

  if (done) {
    return (
      <div className="auth-card">
        <h1>Password reset</h1>
        <div className="alert alert-success">
          Your password has been updated. You can now log in.
        </div>
        <Link href="/login" className="btn btn-primary" style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }}>
          Log In
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h1>Reset password</h1>
      <p className="subtitle">Choose a new password for your account.</p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="field">
          <label>New Password</label>
          <input
            {...register('password')}
            type="password"
            placeholder="Min 8 characters"
            className={errors.password ? 'error' : ''}
          />
          {errors.password && <span className="field-error">{errors.password.message}</span>}
        </div>

        <div className="field">
          <label>Confirm Password</label>
          <input
            {...register('confirmPassword')}
            type="password"
            className={errors.confirmPassword ? 'error' : ''}
          />
          {errors.confirmPassword && (
            <span className="field-error">{errors.confirmPassword.message}</span>
          )}
        </div>

        {serverError && <div className="alert alert-error">{serverError}</div>}

        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Resetting…' : 'Reset Password'}
        </button>
      </form>

      <p className="auth-footer">
        <Link href="/login">Back to login</Link>
      </p>
    </div>
  );
}
