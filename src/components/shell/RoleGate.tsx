"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  PortalAccessDenied,
  PortalAccessUnavailable,
} from "@/components/auth/PortalAccessState";
import { AppShell } from "@/components/shell/AppShell";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { getPortalRoleProjection, isApiError } from "@/lib/api/client";
import type { PortalRole } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { roleLabel } from "@/lib/routes";

type Props = {
  allow: PortalRole;
  children: ReactNode;
};

type ProjectionStatus = "idle" | "checking" | "allowed" | "denied" | "unavailable";

const MAX_UNAUTHORIZED_REFRESHES = 1;

/**
 * Each role tree authorizes from its fixed Postgres-backed API projection.
 * Clerk claims, legacy `user.role`, and the membership list used for landing
 * never make this decision.
 *
 * The projection is re-checked on every in-tree navigation so suspension or
 * demotion takes effect without a reload, but after the first allowed result
 * the current tree keeps rendering while that revalidation is in flight;
 * access is removed only on a settled denial (or a persistently unauthorized
 * projection, which becomes the retryable unavailable state).
 */
export function RoleGate({ allow, children }: Props) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [projectionStatus, setProjectionStatus] = useState<ProjectionStatus>("idle");
  const [attempt, setAttempt] = useState(0);
  const unauthorizedRefreshes = useRef(0);
  const projectionRequestSeq = useRef(0);

  const checkProjection = useCallback(async () => {
    const seq = ++projectionRequestSeq.current;
    const isLatest = () => seq === projectionRequestSeq.current;
    setProjectionStatus((current) => (current === "allowed" ? current : "checking"));
    try {
      await getPortalRoleProjection(allow);
      if (!isLatest()) return;
      unauthorizedRefreshes.current = 0;
      setProjectionStatus("allowed");
    } catch (error) {
      if (!isLatest()) return;
      if (isApiError(error) && error.kind === "forbidden") {
        setProjectionStatus("denied");
        return;
      }
      if (isApiError(error) && error.kind === "unauthorized") {
        if (unauthorizedRefreshes.current < MAX_UNAUTHORIZED_REFRESHES) {
          unauthorizedRefreshes.current += 1;
          await auth.refresh();
          return;
        }
        setProjectionStatus("unavailable");
        return;
      }
      setProjectionStatus((current) => (current === "allowed" ? current : "unavailable"));
    }
  }, [allow, auth]);

  useEffect(() => {
    if (auth.status === "signed_out") {
      router.replace("/login");
      return;
    }
    if (auth.status === "mapped") void checkProjection();
  }, [auth.status, checkProjection, attempt, pathname, router]);

  if (auth.status === "unmapped") {
    return (
      <PortalAccessDenied
        body="This signed-in identity is not connected to a GRIDGO portal account. Ask GRIDGO Operations to assign access, or use another account."
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

  if (projectionStatus === "denied") {
    return (
      <PortalAccessDenied
        title={`This account cannot open ${roleLabel(allow)}`}
        body={`This signed-in identity does not have the ${roleLabel(allow)} membership required for this workspace. GRIDGO assigns portal access from its database membership records.`}
        onSignOut={() => void auth.signOut()}
      />
    );
  }

  if (projectionStatus === "unavailable") {
    return (
      <PortalAccessUnavailable
        onRetry={() => {
          unauthorizedRefreshes.current = 0;
          setAttempt((current) => current + 1);
        }}
        onSignOut={() => void auth.signOut()}
      />
    );
  }

  if (auth.status !== "mapped" || projectionStatus !== "allowed" || !auth.user) {
    return (
      <div className="min-h-dvh bg-canvas p-4">
        <LoadingBlock label="Checking portal access…" />
      </div>
    );
  }

  return <AppShell role={allow}>{children}</AppShell>;
}
