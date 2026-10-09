"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { needsDecisionCount } from "@/app/admin/_lib/tracker";
import { waitingOnOperationsCount } from "@/app/ops/_lib/pipeline";
import { isAwaitingSignupReview } from "@/components/approvals/signup-queue";
import {
  getTracker,
  getWorkspaceRole,
  listApprovalCases,
  listCatalogReviews,
  listClaims,
  listEscalations,
  listIssueReports,
  listJobs,
  listOrders,
  listProductTypeRequests,
  listRefunds,
  listRescheduleRequests,
  listShopFailures,
  listUsers,
  listPrivacyRequests,
  isApiError,
} from "@/lib/api/client";
import { claimBlocksPayout } from "@/lib/api/constraints";
import { normalizeProductTypeRequests, normalizeReviewPage } from "@/lib/listing-review";
import { listSupportChatThreads } from "@/lib/api/support-chat";
import type { InvalidateResource } from "@/lib/api/types";
import { useLegalInboxReload } from "@/lib/live/useLegalInboxReload";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import type { NavCountKey } from "@/lib/nav";
import type { NavCounts } from "@/lib/nav-counts";
import { refundNeedsStaff } from "@/lib/refunds";
import { buildNeedsOperations } from "@/lib/shop-changes";
import { needsSupplierAction } from "@/lib/supplier-actions";

type CountSource = {
  /** Live-stream resources that make this count stale. */
  resources: readonly InvalidateResource[];
  /**
   * No stream resource covers this list, so it is re-read when the person
   * moves between pages (reading a chat thread, say, and walking away).
   */
  refreshOnNavigate?: boolean;
  /** Re-read when a staff inbox notice of this kind arrives. */
  inboxPrefix?: "privacy.";
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
    resources: ["chat"],
    // Opening a thread marks it read in this tab without a ping, so the badge
    // also refreshes when the person leaves the page.
    refreshOnNavigate: true,
    load: async () =>
      (await listSupportChatThreads()).reduce(
        (total, thread) => total + Math.max(0, thread.unreadCount ?? 0),
        0,
      ),
  },
  "issue-reports-new": {
    resources: ["issue-reports"],
    refreshOnNavigate: true,
    load: async () => (await listIssueReports("new")).counts.new ?? 0,
  },
  // The Dropouts & delays page's "Needs Operations" list, from the same two
  // reads. An API without deadline requests answers 404: count recoveries only.
  "shop-changes-needs-ops": {
    resources: ["orders", "jobs"],
    load: async () => {
      const [events, requests] = await Promise.all([
        listShopFailures(),
        listRescheduleRequests().then(
          (queue) => queue.requests,
          (err) => {
            if (isApiError(err) && err.status === 404) return [];
            throw err;
          },
        ),
      ]);
      return buildNeedsOperations(events, requests).length;
    },
  },
  "jobs-need-action": {
    resources: ["jobs"],
    load: async () => (await listJobs()).filter((job) => needsSupplierAction(job)).length,
  },
  // Refund events invalidate orders, payouts and claims; any of them may move
  // a request. A late case counts only on Super Admin's rail, who decides it.
  "refunds-waiting": {
    resources: ["orders", "payouts", "claims"],
    load: async () => {
      const role = getWorkspaceRole() ?? "ops_admin";
      return (await listRefunds()).filter((refund) => refundNeedsStaff(refund, role))
        .length;
    },
  },
  // The Listing reviews desk's Waiting tab: listings plus product-type
  // requests, one page of each: past 50 the badge is a floor and the desk
  // has the exact figure.
  "listing-reviews-waiting": {
    resources: ["catalog"],
    load: async () => {
      const [listings, requests] = await Promise.all([
        listCatalogReviews("pending").then(normalizeReviewPage),
        listProductTypeRequests("pending").then(normalizeProductTypeRequests),
      ]);
      return listings.entries.length + requests.requests.length;
    },
  },
  // New and in-progress privacy requests, one page of each (100): past that
  // the badge is a floor and the queue has the rest. The API's live stream
  // carries no privacy resource, so it is re-read on each page move and when
  // a privacy inbox notice arrives.
  "privacy-requests-open": {
    resources: [],
    refreshOnNavigate: true,
    inboxPrefix: "privacy.",
    load: async () => {
      const [waiting, working] = await Promise.all([
        listPrivacyRequests("pending"),
        listPrivacyRequests("in_progress"),
      ]);
      return waiting.requests.length + working.requests.length;
    },
  },
  // GitHub is the source, so no stream covers it. The API caches its GitHub
  // read for 60 s, so re-reading on each page move stays cheap.
  "tracker-needs-decision": {
    resources: [],
    refreshOnNavigate: true,
    load: async () => needsDecisionCount((await getTracker()).items),
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
  const { resources, refreshOnNavigate, inboxPrefix, load: read } = NAV_COUNT_SOURCES[source];
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
  useLegalInboxReload(inboxPrefix ?? null, load);

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
