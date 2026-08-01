import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { adminApi, MOBILE_CLIENT_HEADER, setUnauthorizedHandler } from './api-client';
import { adminLogout, fetchAdminMe, type AdminUser } from './admin-api';
import { clearAdminToken, getAdminToken, setAdminToken } from './secure-store';

// Superadmin auth. Deliberately separate from the merchant AuthProvider in
// auth.tsx: different credential, different lifetime, different 401 semantics.
//
// Two things about the admin session that do not apply to merchants:
//
//  • It is short-lived by design — 8h absolute (JWT) and, more importantly, a
//    30-minute *inactivity* window enforced server-side via Redis. Any admin
//    request slides that window forward; 30 minutes without one and the API
//    revokes the session outright. That is the same rule the web panel runs
//    under and is intentionally NOT worked around here (no background
//    keep-alive) — a phone that sits in a pocket for half an hour will need a
//    fresh login, and the UI says so plainly instead of failing obscurely.
//  • Login may be two-step. When the account has 2FA enabled the API returns
//    `requiresTotp` + a 5-minute `tempToken` instead of a session, and the code
//    is exchanged at /admin/auth/verify-totp.

type AdminStatus = 'restoring' | 'authenticated' | 'unauthenticated';

interface LoginResult {
  ok: boolean;
  requiresTotp?: boolean;
  message?: string;
  code?: string;
}

interface AdminAuthContextValue {
  status: AdminStatus;
  admin: AdminUser | null;
  // One-off message shown on the login screen, e.g. after an inactivity logout.
  notice: string | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyTotp: (code: string) => Promise<LoginResult>;
  cancelTotp: () => void;
  logout: () => Promise<void>;
}

type LoginResponse = {
  admin?: AdminUser;
  token?: string;
  requiresTotp?: boolean;
  tempToken?: string;
};

const SESSION_ENDED_NOTICE =
  'Your admin session ended after 30 minutes of inactivity. Please sign in again.';

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminStatus>('restoring');
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Held only in memory between the two login steps. Short-lived (5 min
  // server-side) and useless on its own, so it is never persisted to the
  // keystore alongside the real token.
  const tempTokenRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setAdmin(null);
    setStatus('unauthenticated');
  }, []);

  // A token-bearing admin request came back 401 — the session expired or was
  // revoked. The api-client already cleared the stored token; explain why.
  useEffect(() => {
    const onUnauthorized = () => {
      setNotice(SESSION_ENDED_NOTICE);
      reset();
    };
    setUnauthorizedHandler(onUnauthorized, 'admin');
    return () => setUnauthorizedHandler(null, 'admin');
  }, [reset]);

  // Session restore on launch.
  useEffect(() => {
    let active = true;
    (async () => {
      const token = await getAdminToken();
      if (!token) {
        if (active) reset();
        return;
      }
      const me = await fetchAdminMe();
      if (!active) return;
      if (me.success) {
        setAdmin(me.data.admin);
        setStatus('authenticated');
      } else {
        // A 401 already cleared the token via the handler above; clear anyway so
        // non-401 failures can't leave a dead token behind.
        await clearAdminToken();
        reset();
      }
    })();
    return () => {
      active = false;
    };
  }, [reset]);

  // The inactivity window can lapse while the app is backgrounded, and nothing
  // tells us until the next request fails. Re-validate on foreground so the
  // admin lands on the login screen with an explanation rather than tapping
  // into a screen whose every call 401s.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && status === 'authenticated') {
        // A 401 here routes through the unauthorized handler above.
        void fetchAdminMe();
      }
    });
    return () => sub.remove();
  }, [status]);

  const completeLogin = useCallback(async (token: string, fallback?: AdminUser) => {
    await setAdminToken(token);
    const me = await fetchAdminMe();
    setAdmin(me.success ? me.data.admin : (fallback ?? null));
    setNotice(null);
    tempTokenRef.current = null;
    setStatus('authenticated');
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const res = await adminApi.post<LoginResponse>(
        '/admin/auth/login',
        { email, password },
        MOBILE_CLIENT_HEADER,
      );
      if (!res.success) return { ok: false, message: res.error.message, code: res.error.code };

      // 2FA enabled: hold the temp token and let the UI collect the code.
      if (res.data.requiresTotp && res.data.tempToken) {
        tempTokenRef.current = res.data.tempToken;
        return { ok: true, requiresTotp: true };
      }

      if (!res.data.token) {
        return {
          ok: false,
          message:
            'Login succeeded but no token was returned. The API needs the mobile token handshake enabled for admin login.',
        };
      }

      await completeLogin(res.data.token, res.data.admin);
      return { ok: true };
    },
    [completeLogin],
  );

  const verifyTotp = useCallback(
    async (code: string): Promise<LoginResult> => {
      const tempToken = tempTokenRef.current;
      if (!tempToken) {
        return { ok: false, message: 'Verification session expired. Please sign in again.' };
      }

      const res = await adminApi.post<LoginResponse>(
        '/admin/auth/verify-totp',
        { tempToken, code: code.replace(/\s/g, '') },
        MOBILE_CLIENT_HEADER,
      );
      if (!res.success) return { ok: false, message: res.error.message, code: res.error.code };

      if (!res.data.token) {
        return {
          ok: false,
          message:
            'Verification succeeded but no token was returned. The API needs the mobile token handshake enabled for admin login.',
        };
      }

      await completeLogin(res.data.token, res.data.admin);
      return { ok: true };
    },
    [completeLogin],
  );

  const cancelTotp = useCallback(() => {
    tempTokenRef.current = null;
  }, []);

  const logout = useCallback(async () => {
    // Revoke server-side so the jti can't be reused. Ignore network errors — the
    // local token is dropped regardless so the device is always signed out.
    try {
      await adminLogout();
    } catch {
      // no-op
    }
    await clearAdminToken();
    setNotice(null);
    tempTokenRef.current = null;
    reset();
  }, [reset]);

  return (
    <AdminAuthContext.Provider
      value={{ status, admin, notice, login, verifyTotp, cancelTotp, logout }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  return ctx;
}
