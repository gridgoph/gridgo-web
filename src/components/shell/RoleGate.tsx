"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/shell/AppShell";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { Role } from "@/lib/api/types";
import { homeForRole } from "@/lib/routes";

type Props = {
  allow: Role;
  children: ReactNode;
};

/**
 * Single role check point for a route group.
 * Middleware already blocks foreign paths; this re-validates the live session.
 */
export function RoleGate({ allow, children }: Props) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== allow) {
      router.replace(homeForRole(user.role));
    }
  }, [user, loading, allow, router]);

  if (loading || !user) {
    return (
      <div className="min-h-dvh bg-canvas p-4">
        <LoadingBlock label="Checking session…" />
      </div>
    );
  }

  if (user.role !== allow) {
    return (
      <div className="min-h-dvh bg-canvas p-4">
        <LoadingBlock label="Redirecting to your workspace…" />
      </div>
    );
  }

  return <AppShell role={user.role}>{children}</AppShell>;
}
