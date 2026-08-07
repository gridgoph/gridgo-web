"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  login as apiLogin,
  logout as apiLogout,
  me,
  setTokenProvider,
} from "@/lib/api/client";
import type { User } from "@/lib/api/types";
import {
  clearSession,
  getStoredToken,
  getStoredUser,
  persistSession,
} from "@/lib/auth/session";
import { homeForRole } from "@/lib/routes";

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  refresh: () => Promise<User | null>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setTokenProvider(() => getStoredToken());
  }, []);

  const refresh = useCallback(async (): Promise<User | null> => {
    const stored = getStoredToken();
    if (!stored) {
      setUser(null);
      setToken(null);
      return null;
    }
    try {
      setTokenProvider(() => stored);
      const next = await me();
      persistSession(stored, next);
      setUser(next);
      setToken(stored);
      return next;
    } catch {
      clearSession();
      setUser(null);
      setToken(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = getStoredUser();
      const storedToken = getStoredToken();
      if (cached && storedToken) {
        setUser(cached);
        setToken(storedToken);
        setTokenProvider(() => storedToken);
      }
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<User> => {
      const result = await apiLogin(email, password);
      persistSession(result.token, result.user);
      setTokenProvider(() => result.token);
      setToken(result.token);
      setUser(result.user);
      // replace so back does not return to a post-login intermediate
      router.replace(homeForRole(result.user.role));
      return result.user;
    },
    [router],
  );

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      clearSession();
      setTokenProvider(() => null);
      setUser(null);
      setToken(null);
      // replace — critical: back button must not re-enter the shell
      router.replace("/login");
    }
  }, [router]);

  // If we land on a protected tree without a session after load, bounce to login.
  useEffect(() => {
    if (loading) return;
    if (!user && pathname !== "/login" && pathname !== "/") {
      router.replace("/login");
    }
  }, [loading, user, pathname, router]);

  const value = useMemo(
    () => ({ user, token, loading, signIn, signOut, refresh }),
    [user, token, loading, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
