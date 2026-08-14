"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { isClerkAuthEnabled } from "@/lib/auth/clerk-config";

export default function SsoCallbackPage() {
  if (!isClerkAuthEnabled()) return null;
  return (
    <main id="main-content" className="min-h-dvh bg-canvas p-4">
      <AuthenticateWithRedirectCallback />
      <LoadingBlock label="Completing sign-in…" />
    </main>
  );
}
