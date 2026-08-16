import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import type { ReactNode } from "react";

import { ClerkSessionAuthProvider } from "./ClerkSessionAuthProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      appearance={{ theme: shadcn }}
      dynamic
      signInUrl="/login"
      signInFallbackRedirectUrl="/"
    >
      <ClerkSessionAuthProvider>{children}</ClerkSessionAuthProvider>
    </ClerkProvider>
  );
}
