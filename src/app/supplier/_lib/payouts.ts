/**
 * Protected-payment (never "escrow") presentation for completed / near-complete jobs.
 * Demo ledger does not return commission or net — those stay unavailable.
 */

import type { Issue, Order } from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

/** States where protected payment / settlement is meaningful to the supplier. */
export const PAYOUT_RELEVANT_STATES = [
  "delivered",
  "issue_window_open",
  "completed",
  "payout_released",
] as const;

export function isPayoutRelevant(state: string): boolean {
  return (PAYOUT_RELEVANT_STATES as readonly string[]).includes(state);
}

export type SettlementPresentation = {
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
  detail: string;
};

/**
 * Settlement posture from order state + payment flags + hold.
 * Does not invent ledger amounts.
 */
export function presentSettlement(
  order: Pick<Order, "state" | "paymentStatus" | "payoutHold">,
): SettlementPresentation {
  if (order.payoutHold) {
    return {
      label: "Protected payment on hold",
      tone: "warning",
      icon: "triangle-alert",
      detail:
        "An open claim or issue holds release. Protected payment stays frozen until Operations releases the hold.",
    };
  }

  switch (order.state) {
    case "payout_released":
      return {
        label: "Released",
        tone: "success",
        icon: "circle-check",
        detail: "Protected payment has been released to you.",
      };
    case "completed":
      return {
        label: "Ready for release",
        tone: "info",
        icon: "clock",
        detail:
          "Order completed. Operations can release protected payment when no hold is active.",
      };
    case "issue_window_open":
      return {
        label: "Issue window open",
        tone: "warning",
        icon: "clock",
        detail:
          "Client may still report an issue. Protected payment stays held until the window closes and any claims clear.",
      };
    case "delivered":
      return {
        label: "Delivered — settling",
        tone: "info",
        icon: "clock",
        detail: "Delivery confirmed. Settlement continues through the issue window.",
      };
    default:
      return {
        label: "Not yet settling",
        tone: "neutral",
        icon: "clock",
        detail: "Protected payment tracking starts after delivery.",
      };
  }
}

export type PayoutRow = {
  order: Order;
  /** Product total in minor units (supplier gross before commission). */
  grossMinor: number;
  /**
   * GRIDGO commission — demo API does not expose a ledger figure.
   * Always null here; UI must label unavailable.
   */
  commissionMinor: number | null;
  /**
   * Net to supplier — unavailable without commission.
   */
  netMinor: number | null;
  settlement: SettlementPresentation;
  holdReason: string | null;
};

/**
 * Build payout rows from jobs + optional issues (claims list is ops-only for suppliers).
 * Gross uses product total only (delivery fee is not supplier production value).
 */
export function buildPayoutRows(
  jobs: Order[],
  issues: Issue[] = [],
): PayoutRow[] {
  const issueByOrder = new Map<string, Issue[]>();
  for (const issue of issues) {
    const list = issueByOrder.get(issue.orderId) ?? [];
    list.push(issue);
    issueByOrder.set(issue.orderId, list);
  }

  const rows = jobs
    .filter((j) => isPayoutRelevant(j.state) || j.payoutHold)
    .map((order) => {
      const orderIssues = issueByOrder.get(order.id) ?? [];
      const openOrHoldIssue = orderIssues.find(
        (i) =>
          i.status === "open" ||
          i.consequence === "payout_hold" ||
          i.claimId != null,
      );
      let holdReason: string | null = null;
      if (order.payoutHold) {
        if (openOrHoldIssue?.description) {
          holdReason = openOrHoldIssue.description;
        } else if (openOrHoldIssue?.resolution) {
          holdReason = openOrHoldIssue.resolution;
        } else {
          holdReason =
            "A claim hold is active on this order. Detail is limited on the supplier view.";
        }
      }

      return {
        order,
        grossMinor: order.totalMinor,
        commissionMinor: null as number | null,
        netMinor: null as number | null,
        settlement: presentSettlement(order),
        holdReason,
      };
    });

  return rows.sort((a, b) => {
    const da = a.order.updatedAt || a.order.createdAt || "";
    const db = b.order.updatedAt || b.order.createdAt || "";
    return db.localeCompare(da);
  });
}

/** Display money or honest unavailable. */
export function formatMoneyOrUnavailable(
  minor: number | null | undefined,
  formatPhp: (n: number) => string,
): string {
  if (minor == null || !Number.isFinite(minor)) return "Unavailable";
  return formatPhp(minor);
}
