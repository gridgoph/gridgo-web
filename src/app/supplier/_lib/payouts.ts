/**
 * What a supplier is owed, and where each part of it has got to.
 *
 * A supplier is paid in four milestones against its own asking price, each one
 * released by Operations only after a Proof of Fulfilment. The server shows a
 * supplier its own price and its own milestone amounts — never GRIDGO's
 * commission, which this module must never try to derive either.
 */

import type { Issue, Order, PayoutMilestone } from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

/** States where a milestone can already have been earned. */
export const PAYOUT_RELEVANT_STATES = [
  "production",
  "supplier_self_qc",
  "ready_for_dispatch",
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
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
 * Where this order's payout stands overall, from its milestones and any hold.
 * Never invents an amount the server did not send.
 */
export function presentSettlement(
  order: Pick<Order, "state" | "payoutHold" | "payoutMilestones">,
): SettlementPresentation {
  const milestones = order.payoutMilestones ?? [];
  const released = milestones.filter((m) => m.status === "released").length;
  const total = milestones.length;

  if (order.payoutHold) {
    return {
      label: "Payout on hold",
      tone: "warning",
      icon: "triangle-alert",
      detail:
        "A claim holds this order. Nothing further releases until Operations lifts it — the milestones you have already been paid are unaffected.",
    };
  }

  if (total && released === total) {
    return {
      label: "Paid in full",
      tone: "success",
      icon: "circle-check",
      detail: "All four milestones have been released to you.",
    };
  }

  if (released > 0) {
    return {
      label: `${released} of ${total} milestones paid`,
      tone: "info",
      icon: "clock",
      detail:
        "The rest release as the job reaches each stage and its proof is reviewed.",
    };
  }

  switch (order.state) {
    case "issue_window_open":
      return {
        label: "Waiting on the issue window",
        tone: "warning",
        icon: "clock",
        detail:
          "Delivered. The final 10% retention releases when the client's issue window closes with nothing raised.",
      };
    case "production":
    case "supplier_self_qc":
      return {
        label: "Nothing released yet",
        tone: "neutral",
        icon: "clock",
        detail:
          "Upload a Proof of Fulfilment for printing, and Operations can release the first 50%.",
      };
    default:
      return {
        label: "Nothing released yet",
        tone: "neutral",
        icon: "clock",
        detail: "Milestones begin releasing once production starts.",
      };
  }
}

export type PayoutRow = {
  order: Order;
  /** The supplier's own asking price, when the server sent it. */
  earnsMinor: number | null;
  /** Milestone amounts already released. */
  releasedMinor: number | null;
  /** Milestone amounts not yet released. */
  outstandingMinor: number | null;
  milestones: PayoutMilestone[];
  settlement: SettlementPresentation;
  holdReason: string | null;
};

function sumMilestones(
  milestones: PayoutMilestone[],
  keep: (m: PayoutMilestone) => boolean,
): number | null {
  const relevant = milestones.filter(keep);
  if (!relevant.length) return 0;
  // A milestone without an amount means the server withheld it; say so rather
  // than reporting a total that quietly leaves money out.
  if (relevant.some((m) => m.amountMinor === undefined)) return null;
  return relevant.reduce((total, m) => total + (m.amountMinor ?? 0), 0);
}

/**
 * Build payout rows from the supplier's own jobs, plus any issues visible to
 * them. The claims list is Operations-only, so a hold arrives as a flag.
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
        holdReason =
          openOrHoldIssue?.description ||
          openOrHoldIssue?.resolution ||
          "A claim hold is active on this order. Operations can tell you more.";
      }

      const milestones = order.payoutMilestones ?? [];

      return {
        order,
        earnsMinor: order.supplierPriceMinor ?? null,
        releasedMinor: sumMilestones(milestones, (m) => m.status === "released"),
        outstandingMinor: sumMilestones(
          milestones,
          (m) => m.status !== "released",
        ),
        milestones,
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

/** Display money, or say plainly that the figure is not available. */
export function formatMoneyOrUnavailable(
  minor: number | null | undefined,
  formatPhp: (n: number) => string,
): string {
  if (minor == null || !Number.isFinite(minor)) return "Unavailable";
  return formatPhp(minor);
}
