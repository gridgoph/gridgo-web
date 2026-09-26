"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AccountStandingNotice } from "@/components/auth/AccountStandingNotice";
import { AccountStatusNotice } from "@/components/auth/AccountStatusNotice";
import {
  PortalAccessDenied,
  PortalAccessUnavailable,
} from "@/components/auth/PortalAccessState";
import { AppShell } from "@/components/shell/AppShell";
import { accountHold } from "@/lib/accountHold";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { getPortalRoleProjection, isApiError, onForbidden } from "@/lib/api/client";
import type { PortalRole } from "@/lib/api/types";
import { withdrawnStanding, type WithdrawnStanding } from "@/lib/auth/account-standing";
import { useAuth } from "@/lib/auth/AuthProvider";
import { roleLabel } from "@/lib/routes";

type Props = {
  allow: PortalRole;
  children: ReactNode;
};

type ProjectionStatus =
  "idle" | "checking" | "allowed" | "withdrawn" | "denied" | "unavailable";

const MAX_UNAUTHORIZED_REFRESHES = 1;
/** A burst of refused reads (the page and the rail together) costs one re-check. */
const FORBIDDEN_RECHECK_GAP_MS = 5_000;

/**
 * Each role tree authorizes from its fixed Postgres-backed API projection.
 * Clerk claims, legacy `user.role`, and the membership list used for landing
 * never make this decision.
 *
 * The projection is re-checked on every in-tree navigation so suspension or
 * demotion takes effect without a reload, but after the first allowed result
 * the current tree keeps rendering while that revalidation is in flight;
 * access is removed only on a settled denial. A 401 gets one fresh-token
 * retry, and effect cleanup prevents an older overlapping check from changing
 * the latest authorization state.
 *
 * A suspended or rejected shop still holds its supplier membership, so the
 * projection allows it, but every supplier endpoint answers 403. Its approval
 * case therefore closes the workspace here: the notice replaces `AppShell`,
 * which unmounts the live stream, the rail counts and every page read
 * (gridgoph/gridgo-web#77). A 403 from any supplier endpoint re-checks the
 * projection, so a suspension that lands mid-session closes it too.
 */
export function RoleGate({ allow, children }: Props) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [projectionStatus, setProjectionStatus] = useState<ProjectionStatus>("idle");
  const [standing, setStanding] = useState<WithdrawnStanding | null>(null);
  const [attempt, setAttempt] = useState(0);
  const lastForbiddenRecheck = useRef(0);

  useEffect(() => {
    if (auth.status === "signed_out") {
      router.replace("/login");
      return;
    }
    if (auth.status !== "mapped") return;

    let active = true;

    const checkProjection = async () => {
      let unauthorizedRefreshes = 0;
      let refreshToken = false;
      setProjectionStatus((current) => (current === "allowed" ? current : "checking"));

      while (active) {
        try {
          const projection = refreshToken
            ? await getPortalRoleProjection(allow, { refreshToken: true })
            : await getPortalRoleProjection(allow);
          if (!active) return;
          const withdrawn = withdrawnStanding(projection);
          setStanding(withdrawn);
          setProjectionStatus(withdrawn ? "withdrawn" : "allowed");
          return;
        } catch (error) {
          if (!active) return;
          if (isApiError(error) && error.kind === "forbidden") {
            setProjectionStatus("denied");
            return;
          }
          if (isApiError(error) && error.kind === "unauthorized") {
            if (unauthorizedRefreshes < MAX_UNAUTHORIZED_REFRESHES) {
              unauthorizedRefreshes += 1;
              refreshToken = true;
              continue;
            }
            setProjectionStatus((current) =>
              current === "allowed" ? current : "unavailable",
            );
            return;
          }
          setProjectionStatus((current) =>
            current === "allowed" ? current : "unavailable",
          );
          return;
        }
      }
    };

    void checkProjection();
    return () => {
      active = false;
    };
  }, [allow, attempt, auth.status, auth.revision, pathname, router]);

  useEffect(() => {
    if (allow !== "supplier" || projectionStatus !== "allowed") return;
    return onForbidden(() => {
      const now = Date.now();
      if (now - lastForbiddenRecheck.current < FORBIDDEN_RECHECK_GAP_MS) return;
      lastForbiddenRecheck.current = now;
      setAttempt((current) => current + 1);
    });
  }, [allow, projectionStatus]);

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

  const sessionHold = accountHold(auth.user);
  if (auth.status === "mapped" && sessionHold) {
    return (
      <AccountStatusNotice
        title={sessionHold.title}
        reason={sessionHold.reason}
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

  if (projectionStatus === "withdrawn" && standing) {
    return (
      <AccountStandingNotice
        status={standing.status}
        reason={standing.reason}
        accountName={standing.accountName}
        email={auth.user?.email}
        onSignOut={() => void auth.signOut()}
        onCheckAgain={() => {
          setAttempt((current) => current + 1);
        }}
      />
    );
  }

  if (projectionStatus === "unavailable") {
    return (
      <PortalAccessUnavailable
        onRetry={() => {
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
