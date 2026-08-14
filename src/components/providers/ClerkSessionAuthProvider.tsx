"use client";

import { useAuth as useClerkAuth } from "@clerk/nextjs";
import { useMemo, type ReactNode } from "react";

import {
  AuthProvider,
  type ClerkSessionAdapter,
} from "@/lib/auth/AuthProvider";

export function ClerkSessionAuthProvider({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn, signOut } = useClerkAuth();
  const clerkSession = useMemo<ClerkSessionAdapter>(
    () => ({
      getToken,
      isLoaded,
      isSignedIn: isSignedIn === true,
      signOut,
    }),
    [getToken, isLoaded, isSignedIn, signOut],
  );

  return <AuthProvider clerkSession={clerkSession}>{children}</AuthProvider>;
}
