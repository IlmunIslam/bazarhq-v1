import { Suspense } from 'react';
import ResetPasswordContent from './content';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="auth-card"><p className="subtitle">Loading…</p></div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
