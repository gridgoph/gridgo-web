"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
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
const MAX_UNAUTHORIZED_REFRESHES = 1;

export type ClerkSessionAdapter = {
  getToken: () => Promise<string | null>;
  isLoaded: boolean;
  isSignedIn: boolean;
  sessionId: string | null;
  signOut: () => Promise<unknown>;
  userId: string | null;
};

type ClerkSessionSnapshot = Pick<
  ClerkSessionAdapter,
  "isLoaded" | "isSignedIn" | "sessionId" | "userId"
>;

function sameClerkSession(
  left: ClerkSessionSnapshot,
  right: ClerkSessionSnapshot,
): boolean {
  return (
    left.isLoaded === right.isLoaded &&
    left.isSignedIn === right.isSignedIn &&
    left.sessionId === right.sessionId &&
    left.userId === right.userId
  );
}

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
  const sessionBoundary = JSON.stringify([
    clerkSession.isSignedIn,
    clerkSession.sessionId,
    clerkSession.userId,
  ]);

  return (
    <SessionAuthProvider key={sessionBoundary} clerkSession={clerkSession}>
      {children}
    </SessionAuthProvider>
  );
}

function SessionAuthProvider({
  children,
  clerkSession,
}: {
  children: ReactNode;
  clerkSession: ClerkSessionAdapter;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<RoleMembership[]>([]);
  const [status, setStatus] = useState<PortalIdentityStatus>(() =>
    clerkSession.isLoaded && !clerkSession.isSignedIn ? "signed_out" : "checking",
  );
  const router = useRouter();
  const refreshGeneration = useRef(0);
  const activeRefresh = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const latestClerkSession = useRef<ClerkSessionSnapshot>({
    isLoaded: clerkSession.isLoaded,
    isSignedIn: clerkSession.isSignedIn,
    sessionId: clerkSession.sessionId,
    userId: clerkSession.userId,
  });

  const invalidateRefresh = useCallback(() => {
    refreshGeneration.current += 1;
    activeRefresh.current?.abort();
    activeRefresh.current = null;
  }, []);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      invalidateRefresh();
    };
  }, [invalidateRefresh]);

  useLayoutEffect(() => {
    latestClerkSession.current = {
      isLoaded: clerkSession.isLoaded,
      isSignedIn: clerkSession.isSignedIn,
      sessionId: clerkSession.sessionId,
      userId: clerkSession.userId,
    };
    invalidateRefresh();
  }, [
    clerkSession.isLoaded,
    clerkSession.isSignedIn,
    clerkSession.sessionId,
    clerkSession.userId,
    invalidateRefresh,
  ]);

  useLayoutEffect(() => {
    setTokenProvider(clerkSession.getToken);
    return () => setTokenProvider(() => null);
  }, [clerkSession.getToken]);

  const refresh = useCallback(async (): Promise<void> => {
    invalidateRefresh();
    const generation = refreshGeneration.current;
    const controller = new AbortController();
    activeRefresh.current = controller;
    const originatingSession: ClerkSessionSnapshot = {
      isLoaded: clerkSession.isLoaded,
      isSignedIn: clerkSession.isSignedIn,
      sessionId: clerkSession.sessionId,
      userId: clerkSession.userId,
    };
    const isCurrent = () =>
      mounted.current &&
      !controller.signal.aborted &&
      generation === refreshGeneration.current &&
      sameClerkSession(originatingSession, latestClerkSession.current);

    try {
      if (!clerkSession.isLoaded) {
        if (isCurrent()) setStatus("checking");
        return;
      }
      if (!clerkSession.isSignedIn) {
        if (!isCurrent()) return;
        setUser(null);
        setMemberships([]);
        setStatus("signed_out");
        return;
      }

      if (isCurrent()) setStatus("checking");
      const token = await clerkSession.getToken();
      if (!isCurrent()) return;
      if (!token) {
        setUser(null);
        setMemberships([]);
        setStatus("signed_out");
        return;
      }
      setTokenProvider(clerkSession.getToken);
      let unauthorizedRefreshes = 0;
      let refreshToken = false;
      let next: Awaited<ReturnType<typeof getAuthMe>>;
      while (true) {
        try {
          next = await getAuthMe({
            signal: controller.signal,
            ...(refreshToken ? { refreshToken: true } : {}),
          });
          break;
        } catch (error) {
          if (!isCurrent()) return;
          if (
            isApiError(error) &&
            error.kind === "unauthorized" &&
            unauthorizedRefreshes < MAX_UNAUTHORIZED_REFRESHES
          ) {
            unauthorizedRefreshes += 1;
            refreshToken = true;
            continue;
          }
          throw error;
        }
      }
      if (!isCurrent()) return;
      setUser(next.user);
      setMemberships(next.memberships);
      setStatus("mapped");
    } catch (error) {
      if (!isCurrent()) return;
      setUser(null);
      setMemberships([]);
      setStatus(
        isApiError(error) && error.kind === "unauthorized" ? "unmapped" : "unavailable",
      );
    } finally {
      if (activeRefresh.current === controller) activeRefresh.current = null;
    }
  }, [clerkSession, invalidateRefresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    invalidateRefresh();
    setTokenProvider(() => null);
    setUser(null);
    setMemberships([]);
    setStatus("signed_out");
    router.replace("/login");
    await clerkSession.signOut();
  }, [clerkSession, invalidateRefresh, router]);

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
