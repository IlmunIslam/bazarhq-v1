'use client';

import { AdminAuthProvider } from '@/lib/admin-auth-context';

export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      {children}
    </AdminAuthProvider>
  );
}
