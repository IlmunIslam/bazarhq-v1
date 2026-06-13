'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api-client';

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: 'superadmin' | 'support';
  twoFaEnabled: boolean;
}

interface AdminAuthState {
  admin: AdminUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthState>({
  admin: null,
  loading: true,
  refresh: async () => {},
});

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await api.get<{ admin: AdminUser }>('/admin/auth/me');
    if (res.success) {
      setAdmin(res.data.admin);
    } else {
      setAdmin(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <AdminAuthContext.Provider value={{ admin, loading, refresh }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export const useAdminAuth = () => useContext(AdminAuthContext);
