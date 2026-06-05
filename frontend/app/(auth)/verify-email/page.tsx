import { Suspense } from 'react';
import VerifyEmailContent from './content';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="auth-card"><p className="subtitle">Loading…</p></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
