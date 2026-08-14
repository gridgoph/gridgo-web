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
  persistClerkSession,
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

export type ClerkSessionAdapter = {
  getToken: () => Promise<string | null>;
  isLoaded: boolean;
  isSignedIn: boolean;
  signOut: () => Promise<unknown>;
};

export function AuthProvider({
  children,
  clerkSession,
}: {
  children: ReactNode;
  clerkSession?: ClerkSessionAdapter;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setTokenProvider(clerkSession ? clerkSession.getToken : () => getStoredToken());
  }, [clerkSession]);

  const refresh = useCallback(async (): Promise<User | null> => {
    if (clerkSession) {
      if (!clerkSession.isLoaded) return null;
      if (!clerkSession.isSignedIn) {
        clearSession();
        setUser(null);
        setToken(null);
        return null;
      }

      try {
        setTokenProvider(clerkSession.getToken);
        const nextToken = await clerkSession.getToken();
        if (!nextToken) throw new Error("missing_clerk_session_token");
        const next = await me();
        persistClerkSession(next);
        setUser(next);
        setToken(nextToken);
        return next;
      } catch {
        clearSession();
        setUser(null);
        setToken(null);
        return null;
      }
    }

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
  }, [clerkSession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (clerkSession && !clerkSession.isLoaded) return;
      const cached = getStoredUser();
      const storedToken = clerkSession ? null : getStoredToken();
      if (cached && (clerkSession?.isSignedIn || storedToken)) {
        setUser(cached);
        if (storedToken) {
          setToken(storedToken);
          setTokenProvider(() => storedToken);
        }
      }
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clerkSession, refresh]);

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
      if (clerkSession) await clerkSession.signOut();
      clearSession();
      setTokenProvider(() => null);
      setUser(null);
      setToken(null);
      // replace — critical: back button must not re-enter the shell
      router.replace("/login");
    }
  }, [clerkSession, router]);

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
