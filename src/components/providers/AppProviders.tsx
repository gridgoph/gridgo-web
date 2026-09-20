"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { useEffect, type ReactNode } from "react";

import { bounceToIsolatedDevWebHost, GRIDGO_DEV_WEB_HOST } from "@/lib/devWebHost";

import { ClerkSessionAuthProvider } from "./ClerkSessionAuthProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  // Middleware + the inline head script bounce loopback first. This is only a
  // post-hydration fallback so the server HTML and the first client render
  // stay the same (never skip ClerkProvider during render).
  useEffect(() => {
    bounceToIsolatedDevWebHost(GRIDGO_DEV_WEB_HOST);
  }, []);

  return (
    <ClerkProvider
      appearance={{ theme: shadcn }}
      dynamic
      signInUrl="/login"
      signInFallbackRedirectUrl="/"
      afterSignOutUrl="/login"
    >
      <ClerkSessionAuthProvider>{children}</ClerkSessionAuthProvider>
    </ClerkProvider>
  );
}
