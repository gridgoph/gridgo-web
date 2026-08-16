"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

import { LoadingBlock } from "@/components/ui/LoadingBlock";

export default function SsoCallbackPage() {
  return (
    <main id="main-content" className="min-h-dvh bg-canvas p-4">
      <AuthenticateWithRedirectCallback />
      <LoadingBlock label="Completing sign-in…" />
    </main>
  );
}
