"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { legalGateAllows } from "@/lib/supplier-legal";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AccountStandingNotice } from "@/components/auth/AccountStandingNotice";
import { AccountStatusNotice } from "@/components/auth/AccountStatusNotice";
import {
  PortalAccessDenied,
  PortalAccessUnavailable,
} from "@/components/auth/PortalAccessState";
import { AppShell } from "@/components/shell/AppShell";
import { accountHold, type AccountHold } from "@/lib/accountHold";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import {
  getPortalRoleProjection,
  isApiError,
  onForbidden,
  setTestOperationsSession,
} from "@/lib/api/client";
import type { PortalRole, ShopSummary } from "@/lib/api/types";
import {
  ShopPendingNotice,
  ShopRemovedNotice,
} from "@/components/shop-team/ShopAccessNotices";
import { ShopAccessProvider } from "@/lib/auth/shop-access";
import { portalRolesFromMemberships } from "@/lib/auth/portal-access";
import { homeForRole } from "@/lib/routes";
import { withdrawnStanding, type WithdrawnStanding } from "@/lib/auth/account-standing";
import { useAuth } from "@/lib/auth/AuthProvider";
import { roleLabel } from "@/lib/routes";

type Props = {
  allow: PortalRole;
  children: ReactNode;
};

type ProjectionStatus =
  | "idle"
  | "checking"
  | "allowed"
  | "held"
  | "withdrawn"
  | "denied"
  | "unavailable"
  // Shop teams (gridgo-api docs/SHOP_TEAM_API.md): joined but not approved,
  // or removed by an Owner or Operations.
  | "shop_pending"
  | "shop_removed";

/** Where a removed shop login lands once its session has ended. */
export const SHOP_REMOVED_LOGIN = "/login?left=shop";

/** API refusals that mean GRIDGO suspended or removed the whole account. */
const ACCOUNT_HOLD_CODES = new Set(["account_suspended", "account_removed"]);

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
 *
 * An account hold (Super Admin suspended or removed the person, separate from
 * accreditation) closes work in every role tree. A supplier keeps its own legal
 * and privacy pages, without the work shell, after its membership is verified. `/auth/me` carries it at load, and
 * each projection carries it again, so a hold that lands mid-session shows on
 * the next navigation, or at once when any endpoint answers
 * `403 account_suspended` / `account_removed`.
 *
 * A test operations login (`testOperations` on the Operations projection) gets
 * a fenced workspace: test data only, and only the pages a test order needs.
 */
export function RoleGate({ allow, children }: Props) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [projectionStatus, setProjectionStatus] = useState<ProjectionStatus>("idle");
  const [standing, setStanding] = useState<WithdrawnStanding | null>(null);
  const [projectionHold, setProjectionHold] = useState<AccountHold | null>(null);
  const [testOperations, setTestOperations] = useState(false);
  const [shop, setShop] = useState<ShopSummary | null>(null);
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
          // Set before the tree mounts, so its first reads already ask for
          // test data only.
          const testOps =
            allow === "ops_admin" &&
            (projection as { testOperations?: boolean }).testOperations === true;
          setTestOperationsSession(testOps);
          setTestOperations(testOps);
          const shopSummary =
            allow === "supplier"
              ? ((projection as { shop?: ShopSummary | null }).shop ?? null)
              : null;
          setShop(shopSummary);
          if (shopSummary?.status === "pending") {
            setProjectionStatus("shop_pending");
            return;
          }
          if (shopSummary?.status === "removed") {
            setProjectionStatus("shop_removed");
            return;
          }
          const held = accountHold(projection.user);
          setProjectionHold(held);
          if (held) {
            setStanding(null);
            setProjectionStatus("held");
            return;
          }
          const withdrawn = withdrawnStanding(projection);
          setStanding(withdrawn);
          setProjectionStatus(withdrawn ? "withdrawn" : "allowed");
          return;
        } catch (error) {
          if (!active) return;
          if (isApiError(error) && error.code === "shop_access_removed") {
            setProjectionStatus("shop_removed");
            return;
          }
          if (isApiError(error) && error.code === "shop_approval_pending") {
            setProjectionStatus("shop_pending");
            return;
          }
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

  // Leaving this tree ends its test operations scope.
  useEffect(() => () => setTestOperationsSession(false), []);

  useEffect(() => {
    if (projectionStatus !== "allowed") return;
    return onForbidden((error) => {
      // Any role re-checks on an account hold; only a shop re-checks on a
      // plain 403, because only its accreditation can withdraw it mid-session.
      if (allow !== "supplier" && !ACCOUNT_HOLD_CODES.has(error.code)) return;
      const now = Date.now();
      if (now - lastForbiddenRecheck.current < FORBIDDEN_RECHECK_GAP_MS) return;
      lastForbiddenRecheck.current = now;
      setAttempt((current) => current + 1);
    });
  }, [allow, projectionStatus]);

  const recheck = useCallback(() => setAttempt((current) => current + 1), []);

  // A removed shop login ends its session (the API also closes its stream and
  // refuses every request). Someone with another GRIDGO workspace keeps that.
  const shopRemoved =
    allow === "supplier" &&
    (projectionStatus === "shop_removed" ||
      (auth.status === "unavailable" && auth.accessError === "shop_access_removed"));
  const otherRole = portalRolesFromMemberships(auth.memberships ?? []).find(
    (role) => role !== "supplier",
  );
  const endRemovedSession = shopRemoved && !otherRole;
  const { signOut } = auth;
  useEffect(() => {
    if (endRemovedSession) void signOut({ redirectUrl: SHOP_REMOVED_LOGIN });
  }, [endRemovedSession, signOut]);


  if (auth.status === "unmapped") {
    return (
      <PortalAccessDenied
        body="This signed-in identity is not connected to a GRIDGO portal account. Ask GRIDGO Operations to assign access, or use another account."
        onSignOut={() => void auth.signOut()}
      />
    );
  }

  if (shopRemoved) {
    return (
      <ShopRemovedNotice
        onSignOut={() => void auth.signOut({ redirectUrl: SHOP_REMOVED_LOGIN })}
        otherWorkspace={
          otherRole ? { href: homeForRole(otherRole), label: roleLabel(otherRole) } : null
        }
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

  const sessionHold =
    (projectionStatus === "held" ? projectionHold : null) ?? accountHold(auth.user);
  const selfService = allow === "supplier" && legalGateAllows(pathname);
  // Legal/privacy routes are permitted during a hold by LEGAL_API.md. Keep
  // the fixed membership proof, and never mount the work shell in this view.
  if (
    auth.status === "mapped" &&
    selfService &&
    ["allowed", "held", "withdrawn"].includes(projectionStatus) &&
    (sessionHold || standing)
  ) {
    return (
      <main id="main-content" className="min-h-dvh bg-canvas p-4 md:p-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <p className="text-body text-text-primary m-0">
            {sessionHold?.title ?? "Your shop's work access is unavailable."}
          </p>
          <nav aria-label="Account help" className="flex flex-wrap items-center gap-4">
            <Link
              href="/supplier/legal"
              className="text-body text-text-primary underline"
            >
              Legal documents
            </Link>
            <Link
              href="/supplier/privacy"
              className="text-body text-text-primary underline"
            >
              Your data
            </Link>
            <Button type="button" variant="outline" onClick={() => void auth.signOut()}>
              Sign out
            </Button>
          </nav>
          {children}
        </div>
      </main>
    );
  }
  if (auth.status === "mapped" && sessionHold && !selfService) {
    return (
      <AccountStatusNotice
        supplierSelfService={allow === "supplier"}
        title={sessionHold.title}
        reason={sessionHold.reason}
        onSignOut={() => void auth.signOut()}
      />
    );
  }

  if (projectionStatus === "shop_pending") {
    return (
      <ShopPendingNotice
        shopName={shop?.name}
        onCheckAgain={recheck}
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

  return (
    <ShopAccessProvider shop={allow === "supplier" ? shop : null}>
      <AppShell role={allow} testOperations={testOperations}>
        {children}
      </AppShell>
    </ShopAccessProvider>
  );
}
