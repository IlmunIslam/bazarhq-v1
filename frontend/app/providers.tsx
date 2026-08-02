'use client';

import { AuthProvider } from '@/lib/auth-context';
import { CompareProvider } from '@/lib/compare-context';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {/* Comparison selection is cross-shop, so it lives above the route tree.
          The tray that consumes it only renders inside the marketplace layout. */}
      <CompareProvider>{children}</CompareProvider>
    </AuthProvider>
  );
}
