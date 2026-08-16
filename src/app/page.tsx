"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  PortalAccessDenied,
  PortalAccessUnavailable,
} from "@/components/auth/PortalAccessState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { useAuth } from "@/lib/auth/AuthProvider";
import { preferredPortalRole } from "@/lib/auth/portal-access";
import { homeForRole } from "@/lib/routes";

export default function HomePage() {
  const auth = useAuth();
  const router = useRouter();
  const destinationRole = preferredPortalRole(auth.memberships);

  useEffect(() => {
    if (auth.status === "signed_out") router.replace("/login");
    if (auth.status === "mapped" && destinationRole) {
      router.replace(homeForRole(destinationRole));
    }
  }, [auth.status, destinationRole, router]);

  if (auth.status === "unmapped" || (auth.status === "mapped" && !destinationRole)) {
    return (
      <PortalAccessDenied
        body="This signed-in identity is not connected to a supplier, Operations, or Super Admin membership in GRIDGO. Ask GRIDGO Operations to assign portal access, or use another account."
        onSignOut={() => void auth.signOut()}
      />
    );
  }

  if (auth.status === "unavailable") {
    return (
      <PortalAccessUnavailable
        onRetry={() => void auth.refresh()}
        onSignOut={() => void auth.signOut()}
      />
    );
  }

  return (
    <main id="main-content" className="min-h-dvh bg-canvas p-4">
      <LoadingBlock label="Opening your GRIDGO workspace…" />
    </main>
  );
}
