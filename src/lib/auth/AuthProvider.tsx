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
import { useRouter } from "next/navigation";

import { getAuthMe, isApiError, setTokenProvider } from "@/lib/api/client";
import type { RoleMembership, User } from "@/lib/api/types";

export type PortalIdentityStatus =
  "checking" | "mapped" | "unmapped" | "unavailable" | "signed_out";

type AuthState = {
  user: User | null;
  memberships: RoleMembership[];
  status: PortalIdentityStatus;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export type ClerkSessionAdapter = {
  getToken: () => Promise<string | null>;
  isLoaded: boolean;
  isSignedIn: boolean;
  signOut: () => Promise<unknown>;
};

/**
 * Clerk owns authentication and token refresh. `/auth/me` supplies display
 * identity plus every Postgres membership; route authorization is deliberately
 * left to each fixed `/auth/me/*` projection in `RoleGate`.
 */
export function AuthProvider({
  children,
  clerkSession,
}: {
  children: ReactNode;
  clerkSession: ClerkSessionAdapter;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<RoleMembership[]>([]);
  const [status, setStatus] = useState<PortalIdentityStatus>("checking");
  const router = useRouter();

  useEffect(() => {
    setTokenProvider(clerkSession.getToken);
  }, [clerkSession.getToken]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!clerkSession.isLoaded) {
      setStatus("checking");
      return;
    }
    if (!clerkSession.isSignedIn) {
      setUser(null);
      setMemberships([]);
      setStatus("signed_out");
      return;
    }

    setStatus("checking");
    try {
      const token = await clerkSession.getToken();
      if (!token) {
        setUser(null);
        setMemberships([]);
        setStatus("signed_out");
        return;
      }
      setTokenProvider(clerkSession.getToken);
      const next = await getAuthMe();
      setUser(next.user);
      setMemberships(next.memberships);
      setStatus("mapped");
    } catch (error) {
      setUser(null);
      setMemberships([]);
      setStatus(
        isApiError(error) && error.kind === "unauthorized" ? "unmapped" : "unavailable",
      );
    }
  }, [clerkSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await clerkSession.signOut();
    } finally {
      setTokenProvider(() => null);
      setUser(null);
      setMemberships([]);
      setStatus("signed_out");
      router.replace("/login");
    }
  }, [clerkSession, router]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      memberships,
      status,
      loading: status === "checking",
      signOut,
      refresh,
    }),
    [user, memberships, status, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
