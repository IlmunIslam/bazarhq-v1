'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api-client';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
}

export interface AuthShop {
  id: string;
  subdomain: string;
  name: string;
  status: string;
}

interface AuthState {
  user: AuthUser | null;
  shop: AuthShop | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  shop: null,
  loading: true,
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [shop, setShop] = useState<AuthShop | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await api.get<{ user: AuthUser; shop: AuthShop | null }>('/auth/me');
    if (res.success) {
      setUser(res.data.user);
      setShop(res.data.shop);
    } else {
      setUser(null);
      setShop(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, shop, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
