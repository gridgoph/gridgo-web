"use client";

import { useAuth as useClerkAuth } from "@clerk/nextjs";
import { useMemo, type ReactNode } from "react";

import { AuthProvider, type ClerkSessionAdapter } from "@/lib/auth/AuthProvider";

export function ClerkSessionAuthProvider({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn, sessionId, signOut, userId } = useClerkAuth();
  const clerkSession = useMemo<ClerkSessionAdapter>(
    () => ({
      getToken,
      isLoaded,
      isSignedIn: isSignedIn === true,
      sessionId: sessionId ?? null,
      signOut,
      userId: userId ?? null,
    }),
    [getToken, isLoaded, isSignedIn, sessionId, signOut, userId],
  );

  return <AuthProvider clerkSession={clerkSession}>{children}</AuthProvider>;
}
