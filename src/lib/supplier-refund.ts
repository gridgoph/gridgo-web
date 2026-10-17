import type { Order, PayoutMilestone, RefundDisposition, SupplierSettlementPayout } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

/**
 * A client refund, as far as it is this shop's business.
 *
 * The client's receiving details never reach the shop. Work stops while
 * Operations reviews a request, and a settlement closes the job. Money already
 * released stays with the shop. Amounts here are the shop's own price only.
 */

export type RefundStanding = "none" | "paused" | "settled";

export function refundStanding(
  order: Partial<Pick<Order, "refundHold" | "refundDisposition">>,
): RefundStanding {
  if (order.refundDisposition) return "settled";
  if (order.refundHold === true) return "paused";
  return "none";
}

export type RefundNotice = {
  chipLabel: string;
  title: string;
  body: string;
  tone: StatusTone;
  icon: StatusIconName;
};

export type KeptAmounts = {
  releasedMinor: number;
  settlementMinor: number;
};

type KeptOrder = Partial<
  Pick<Order, "payoutMilestones" | "supplierSettlementPayouts" | "supplierSubtotalMinor">
>;

/** Shop earnings that survive a settlement: released stages plus the agreed payout, once each. */
export function keptShopEarnings(order: KeptOrder): KeptAmounts {
  const releasedMinor = (order.payoutMilestones ?? [])
    .filter((milestone): milestone is PayoutMilestone => milestone.status === "released")
    .reduce((sum, milestone) => sum + (milestone.amountMinor ?? 0), 0);
  const settlementMinor = (order.supplierSettlementPayouts ?? [])
    .filter(
      (payout): payout is SupplierSettlementPayout => payout.status !== "superseded",
    )
    .reduce((sum, payout) => sum + payout.amountMinor, 0);
  return { releasedMinor, settlementMinor };
}

function keptSentence({ releasedMinor, settlementMinor }: KeptAmounts): string {
  const kept = releasedMinor + settlementMinor;
  if (releasedMinor > 0 && settlementMinor > 0) {
    return `You keep ${formatPhp(kept)} in total: ${formatPhp(releasedMinor)} already released to you, and a ${formatPhp(settlementMinor)} settlement payout from Operations.`;
  }
  if (settlementMinor > 0) {
    return `You keep ${formatPhp(settlementMinor)}, paid as one settlement payout from Operations.`;
  }
  if (releasedMinor > 0) {
    return `You keep the ${formatPhp(releasedMinor)} already released to you. Nothing more is due on this job.`;
  }
  return "No payout is due to your shop on this job.";
}

export function refundNotice(
  order: Partial<Pick<Order, "refundHold" | "refundDisposition">>,
  kept: KeptAmounts,
): RefundNotice | null {
  const standing = refundStanding(order);
  if (standing === "paused") {
    return {
      chipLabel: "Refund requested",
      title: "Work is paused for a refund review",
      body: "The client asked GRIDGO for a refund, so this job is stopped. Do not print, pack or hand anything over until Operations settles it. They will agree with you what you keep for work already done, and money already released to you stays yours.",
      tone: "warning",
      icon: "clock",
    };
  }
  if (standing === "settled") {
    const fulfilled = order.refundDisposition === "fulfilled_with_refund";
    return {
      chipLabel: "Refund settled",
      title: fulfilled ? "Settled after delivery" : "Settled and closed",
      body: `${fulfilled ? "Operations settled a refund with the client after delivery." : "Operations settled the client's refund, and this job is closed. There is nothing more to make."} ${keptSentence(kept)}`,
      tone: "neutral",
      icon: "circle-check",
    };
  }
  return null;
}

/** The job's chip while a refund is open or once it is settled. */
export function refundStatus(order: {
  refundHold?: boolean;
  refundDisposition?: RefundDisposition | null;
}): { label: string; tone: StatusTone; icon: StatusIconName } | null {
  const standing = refundStanding(order);
  if (standing === "paused") return { label: "Paused for refund", tone: "warning", icon: "clock" };
  if (standing === "settled") {
    return order.refundDisposition === "fulfilled_with_refund"
      ? { label: "Settled", tone: "neutral", icon: "circle-check" }
      : { label: "Cancelled and settled", tone: "neutral", icon: "circle-x" };
  }
  return null;
}
