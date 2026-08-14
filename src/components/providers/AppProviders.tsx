import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import type { ReactNode } from "react";

import { AuthProvider } from "@/lib/auth/AuthProvider";
import { isClerkAuthEnabled } from "@/lib/auth/clerk-config";

import { ClerkSessionAuthProvider } from "./ClerkSessionAuthProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!isClerkAuthEnabled() || !publishableKey) {
    return <AuthProvider>{children}</AuthProvider>;
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={{ theme: shadcn }}
      dynamic
    >
      <ClerkSessionAuthProvider>{children}</ClerkSessionAuthProvider>
    </ClerkProvider>
  );
}
