"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { waitingOnOperationsCount } from "@/app/ops/_lib/pipeline";
import { isAwaitingSignupReview } from "@/components/approvals/signup-queue";
import {
  listApprovalCases,
  listClaims,
  listEscalations,
  listIssueReports,
  listJobs,
  listOrders,
  listUsers,
} from "@/lib/api/client";
import { claimBlocksPayout } from "@/lib/api/constraints";
import { listSupportChatThreads } from "@/lib/api/support-chat";
import type { InvalidateResource } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import type { NavCountKey } from "@/lib/nav";
import type { NavCounts } from "@/lib/nav-counts";
import { needsSupplierAction } from "@/lib/supplier-actions";

type CountSource = {
  /** Live-stream resources that make this count stale. */
  resources: readonly InvalidateResource[];
  /**
   * No stream resource covers this list, so it is re-read when the person
   * moves between pages (reading a chat thread, say, and walking away).
   */
  refreshOnNavigate?: boolean;
  load: () => Promise<number>;
};

/**
 * Every count is an existing list read the page itself already makes, reduced
 * the same way the page reduces it. No endpoint exists only for the rail.
 */
const NAV_COUNT_SOURCES: Record<NavCountKey, CountSource> = {
  "orders-waiting": {
    resources: ["orders"],
    load: async () => waitingOnOperationsCount(await listOrders()),
  },
  "signups-waiting": {
    resources: ["approvals"],
    load: async () => {
      const [suppliers, riders, business] = await Promise.all([
        listUsers("supplier"),
        listUsers("rider"),
        listApprovalCases({ kind: "business_client", status: "pending" }),
      ]);
      return (
        [...suppliers, ...riders].filter(isAwaitingSignupReview).length +
        business.approvalCases.length
      );
    },
  },
  "escalations-open": {
    resources: ["escalations"],
    load: async () => (await listEscalations({ status: "open" })).length,
  },
  // Open claims and live payout holds are the two states with a decision left
  // on the Claims page (hold / release); released claims are history.
  "claims-open": {
    resources: ["claims"],
    load: async () =>
      (await listClaims()).filter(
        (claim) => claim.status === "open" || claimBlocksPayout(claim.status),
      ).length,
  },
  "chat-unread": {
    resources: [],
    refreshOnNavigate: true,
    load: async () =>
      (await listSupportChatThreads()).reduce(
        (total, thread) => total + Math.max(0, thread.unreadCount ?? 0),
        0,
      ),
  },
  "issue-reports-new": {
    resources: [],
    refreshOnNavigate: true,
    load: async () => (await listIssueReports("new")).counts.new ?? 0,
  },
  "jobs-need-action": {
    resources: ["jobs"],
    load: async () => (await listJobs()).filter((job) => needsSupplierAction(job)).length,
  },
};

const NavCountsContext = createContext<NavCounts>({});

/** The rail's counts. Empty outside `NavCountsProvider`. */
export function useNavCounts(): NavCounts {
  return useContext(NavCountsContext);
}

/**
 * One reader per count. A failed read keeps the last good number: the badge
 * is a hint, and each page owns its own error copy.
 */
function NavCountSource({
  source,
  pathname,
  onCount,
}: {
  source: NavCountKey;
  pathname: string;
  onCount: (source: NavCountKey, count: number) => void;
}) {
  const { resources, refreshOnNavigate, load: read } = NAV_COUNT_SOURCES[source];
  const load = useSerializedLoad(
    useCallback(async () => {
      try {
        onCount(source, await read());
      } catch {
        /* Keep the last good count. */
      }
    }, [onCount, read, source]),
  );

  useLiveReload(resources, load);

  const navigateKey = refreshOnNavigate ? pathname : null;
  useEffect(() => {
    void load();
  }, [load, navigateKey]);

  return null;
}

/**
 * Reads each count once for the whole rail, and only the counts this rail
 * actually shows: a supplier rail never asks for the orders list, and a
 * folded group and its open rows never read the same list twice.
 */
export function NavCountsProvider({
  sources,
  pathname,
  children,
}: {
  sources: readonly NavCountKey[];
  pathname: string;
  children: ReactNode;
}) {
  const [counts, setCounts] = useState<NavCounts>({});
  const onCount = useCallback((source: NavCountKey, count: number) => {
    setCounts((prev) => (prev[source] === count ? prev : { ...prev, [source]: count }));
  }, []);

  return (
    <NavCountsContext.Provider value={counts}>
      {sources.map((source) => (
        <NavCountSource
          key={source}
          source={source}
          pathname={pathname}
          onCount={onCount}
        />
      ))}
      {children}
    </NavCountsContext.Provider>
  );
}
