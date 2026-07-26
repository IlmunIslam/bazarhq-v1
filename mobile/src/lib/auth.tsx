import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { api, MOBILE_CLIENT_HEADER, setUnauthorizedHandler } from './api-client';
import { clearMerchantToken, getMerchantToken, setMerchantToken } from './secure-store';

// Merchant slice only (Sprint 1). Customer/admin auth are intentionally not
// wired here.
export interface Merchant {
  id: string;
  email: string;
  fullName: string;
}

export interface Shop {
  id: string;
  subdomain: string;
  name: string;
  status: string;
}

type AuthStatus = 'restoring' | 'authenticated' | 'unauthenticated';

interface LoginResult {
  ok: boolean;
  message?: string;
  code?: string;
}

interface RegisterResult {
  ok: boolean;
  message?: string;
}

interface AuthContextValue {
  status: AuthStatus;
  merchant: Merchant | null;
  shop: Shop | null;
  // A one-off notice + pre-filled email shown on the login screen — used after
  // store creation, which rotates the session (see beginReauth).
  notice: string | null;
  prefillEmail: string | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  register: (fullName: string, email: string, phone: string, password: string) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  // Drop the current (now-revoked) token locally and return to the login screen
  // with a notice + pre-filled email. POST /shops rotates the JWT and only hands
  // the new one back via cookie, which native clients can't read, so the merchant
  // signs in again to pick up a fresh Bearer token.
  beginReauth: (email: string, notice: string) => Promise<void>;
}

// Shapes returned by the API (subset we read).
type LoginResponse = { user: Merchant; token?: string };
type MeResponse = { user: Merchant; shop: Shop | null };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [prefillEmail, setPrefillEmail] = useState<string | null>(null);

  const reset = useCallback(() => {
    setMerchant(null);
    setShop(null);
    setStatus('unauthenticated');
  }, []);

  // A token-bearing request came back 401 (expired / revoked). The api-client
  // has already cleared the stored token; here we just reset UI state.
  useEffect(() => {
    setUnauthorizedHandler(reset);
    return () => setUnauthorizedHandler(null);
  }, [reset]);

  // Session restore on launch: if a token is stored, validate it with /auth/me.
  useEffect(() => {
    let active = true;
    (async () => {
      const token = await getMerchantToken();
      if (!token) {
        if (active) reset();
        return;
      }
      const me = await api.get<MeResponse>('/auth/me');
      if (!active) return;
      if (me.success) {
        setMerchant(me.data.user);
        setShop(me.data.shop);
        setStatus('authenticated');
      } else {
        // Invalid token: the api-client 401 handler already cleared it. Make
        // sure it's gone even for non-401 failures, then show login.
        await clearMerchantToken();
        reset();
      }
    })();
    return () => {
      active = false;
    };
  }, [reset]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const res = await api.post<LoginResponse>(
      '/auth/login',
      { email, password },
      MOBILE_CLIENT_HEADER,
    );
    if (!res.success) return { ok: false, message: res.error.message, code: res.error.code };
    if (!res.data.token) {
      return { ok: false, message: 'Login succeeded but no token was returned.' };
    }

    await setMerchantToken(res.data.token);

    // Hydrate the full profile (including shop) from /auth/me.
    const me = await api.get<MeResponse>('/auth/me');
    if (me.success) {
      setMerchant(me.data.user);
      setShop(me.data.shop);
    } else {
      // Fall back to the login payload; a stale shop just won't show yet.
      setMerchant(res.data.user);
      setShop(null);
    }
    setNotice(null);
    setPrefillEmail(null);
    setStatus('authenticated');
    return { ok: true };
  }, []);

  const register = useCallback(
    async (fullName: string, email: string, phone: string, password: string): Promise<RegisterResult> => {
      const res = await api.post<{ message: string }>('/auth/register', {
        fullName,
        email,
        phone: phone.trim() || undefined,
        password,
      });
      if (!res.success) return { ok: false, message: res.error.message };
      return { ok: true, message: res.data.message };
    },
    [],
  );

  const beginReauth = useCallback(async (email: string, msg: string) => {
    // The session was already rotated server-side; just drop the dead token
    // locally (no /auth/logout call) and surface the login screen.
    await clearMerchantToken();
    setMerchant(null);
    setShop(null);
    setPrefillEmail(email);
    setNotice(msg);
    setStatus('unauthenticated');
  }, []);

  const logout = useCallback(async () => {
    // Revoke the session server-side (deletes the jti). Ignore network errors —
    // we clear locally regardless so the user is always signed out on-device.
    try {
      await api.post('/auth/logout');
    } catch {
      // no-op
    }
    await clearMerchantToken();
    reset();
  }, [reset]);

  return (
    <AuthContext.Provider
      value={{ status, merchant, shop, notice, prefillEmail, login, register, logout, beginReauth }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
