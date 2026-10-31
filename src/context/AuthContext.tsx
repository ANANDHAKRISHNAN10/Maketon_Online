import React, { createContext, useContext, useEffect, useState } from 'react';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'STAFF' | 'GAMER';
  parentEmail?: string | null;
  parentalGateOn?: boolean;
  isFrozen?: boolean;
  tradeLockUntil?: string | null;
}

export interface DemoAccountSummary {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'STAFF' | 'GAMER';
  isFrozen: number;
  parentalGateOn: number;
  planName?: string;
  subStatus?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  demoAccounts: DemoAccountSummary[];
  loginWithToken: (token: string, user: AuthUser) => void;
  quickSwitchAccount: (userId: string) => Promise<AuthUser | null>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = 'brightloop_auth_token';
const USER_KEY = 'brightloop_auth_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY) || 'demo_user_usr_gamer_1');
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem(USER_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return {
      id: 'usr_gamer_1',
      name: 'Alex Rivera',
      email: 'alex@gamer.gg',
      role: 'GAMER',
      parentalGateOn: true,
    };
  });
  const [demoAccounts, setDemoAccounts] = useState<DemoAccountSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(url, { ...options, headers });
  };

  const loadDemoAccounts = async () => {
    try {
      const res = await fetch('/api/auth/demo-accounts');
      if (res.ok) {
        const data = await res.json();
        setDemoAccounts(data.accounts || []);
      }
    } catch {
      // Ignore network errors on initial boot
    }
  };

  const refreshUser = async () => {
    if (!token) return;
    try {
      const res = await authFetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    loadDemoAccounts();
    refreshUser();
  }, [token]);

  const loginWithToken = (newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
  };

  const quickSwitchAccount = async (userId: string): Promise<AuthUser | null> => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/quick-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        const data = await res.json();
        loginWithToken(data.token, data.user);
        await loadDemoAccounts();
        return data.user;
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        demoAccounts,
        loginWithToken,
        quickSwitchAccount,
        logout,
        refreshUser,
        authFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
