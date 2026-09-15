/**
 * What Operations needs to know about a supplier's payout before opening it.
 *
 * A shop is paid in four shares and each releases against a Proof of
 * Fulfilment. These helpers answer, per order and per share, the three
 * questions the payout desk asks: how much has gone out, which share is next,
 * and what is stopping it. Pure functions — no React, no fetch.
 */

import type { Claim, Order, PayoutMilestone, TimelineEntry } from "@/lib/api/types";
import {
  claimBlocksPayout,
  milestoneHasProof,
  milestoneIsReleased,
  milestoneReleaseBlocker,
  orderHasPayoutHold,
} from "@/lib/api/constraints";
import type { EvidenceItem } from "@/lib/evidence";
import { formatPhp } from "@/lib/format";
import {
  presentMilestone,
  presentTimelineActor,
  type StatePresentation,
} from "@/lib/order-state";

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export type PayoutProgress = {
  count: number;
  releasedCount: number;
  /** Null when this caller is not shown amounts. */
  releasedMinor: number | null;
  totalMinor: number | null;
  outstandingMinor: number | null;
};

export function payoutProgress(
  order: Pick<Order, "payoutMilestones" | "supplierPriceMinor" | "supplierSettlement">,
): PayoutProgress {
  const milestones = order.payoutMilestones ?? [];
  const released = milestones.filter(milestoneIsReleased);
  const amountsKnown =
    milestones.length > 0 && milestones.every((m) => m.amountMinor !== undefined);
  const totalMinor = amountsKnown
    ? milestones.reduce((sum, m) => sum + (m.amountMinor ?? 0), 0)
    : (order.supplierSettlement?.totalSupplierEarningsMinor ??
      order.supplierPriceMinor ??
      null);
  const releasedMinor = amountsKnown
    ? released.reduce((sum, m) => sum + (m.amountMinor ?? 0), 0)
    : (order.supplierSettlement?.supplierReleasedMinor ?? null);
  return {
    count: milestones.length,
    releasedCount: released.length,
    releasedMinor,
    totalMinor,
    outstandingMinor:
      releasedMinor !== null && totalMinor !== null
        ? Math.max(0, totalMinor - releasedMinor)
        : null,
  };
}

// ---------------------------------------------------------------------------
// Per-share readiness
// ---------------------------------------------------------------------------

export type MilestoneReadiness =
  "released" | "ready" | "waiting_proof" | "held" | "not_reached";

/** Claim holds on this order that stop money moving. */
export function activeHolds(order: Pick<Order, "id">, claims: readonly Claim[]): Claim[] {
  return claims.filter(
    (claim) => claim.orderId === order.id && claimBlocksPayout(claim.status),
  );
}

export function milestoneReadiness(
  order: Pick<Order, "payoutHold" | "payments" | "state" | "deliveryEvidence">,
  milestone: Pick<PayoutMilestone, "code" | "status" | "pofFileIds">,
  holds: readonly Claim[] = [],
): MilestoneReadiness {
  if (milestoneIsReleased(milestone)) return "released";
  if (orderHasPayoutHold(order) || holds.length > 0) return "held";
  if (!milestoneHasProof(milestone)) return "waiting_proof";
  if (milestoneReleaseBlocker(order, milestone) !== null) return "not_reached";
  return "ready";
}

export function presentReadiness(readiness: MilestoneReadiness): StatePresentation {
  switch (readiness) {
    case "released":
      return { label: "Released", tone: "success", icon: "circle-check" };
    case "ready":
      return { label: "Ready to release", tone: "info", icon: "circle-check" };
    case "waiting_proof":
      return { label: "Proof needed", tone: "warning", icon: "clock" };
    case "held":
      return { label: "Held", tone: "error", icon: "triangle-alert" };
    default:
      return { label: "Not reached yet", tone: "neutral", icon: "clock" };
  }
}

/** The first share still to be released, in release order. */
export function nextMilestone(
  order: Pick<Order, "payoutMilestones">,
): PayoutMilestone | null {
  return (order.payoutMilestones ?? []).find((m) => !milestoneIsReleased(m)) ?? null;
}

/** Shares Operations could release right now. */
export function releasableMilestones(
  order: Pick<
    Order,
    "payoutHold" | "payments" | "state" | "deliveryEvidence" | "payoutMilestones"
  >,
  holds: readonly Claim[] = [],
): PayoutMilestone[] {
  return (order.payoutMilestones ?? []).filter(
    (m) => milestoneReadiness(order, m, holds) === "ready",
  );
}

// ---------------------------------------------------------------------------
// Proof of Fulfilment, with who filed it and when
// ---------------------------------------------------------------------------

export type MilestoneProof = EvidenceItem & {
  attachedAt: string | null;
  attachedBy: string | null;
  /** Retention carries the delivered photo rather than its own upload. */
  inherited: boolean;
};

function attachRow(
  timeline: readonly TimelineEntry[] | undefined,
  fileId: string,
  milestoneCode: string,
): TimelineEntry | undefined {
  return (timeline ?? []).find(
    (entry) => entry.fileId === fileId && entry.milestoneCode === milestoneCode,
  );
}

/**
 * Every proof behind one share. The attach row the API writes to the timeline
 * is the only record of when a proof arrived and from whom, so it is joined
 * here rather than guessed from the file.
 */
export function milestoneProofs(
  order: Pick<Order, "timeline">,
  milestone: Pick<PayoutMilestone, "code" | "pofFileIds">,
): MilestoneProof[] {
  const seen = new Set<string>();
  const ids = (milestone.pofFileIds ?? []).filter((id) => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return ids.map((fileId, index) => {
    const own = attachRow(order.timeline, fileId, milestone.code);
    const carried =
      !own && milestone.code === "retention"
        ? attachRow(order.timeline, fileId, "delivered")
        : undefined;
    const row = own ?? carried;
    return {
      fileId,
      kind: "pof",
      label:
        ids.length > 1 ? `Proof ${index + 1} of ${ids.length}` : "Proof of fulfilment",
      attachedAt: row?.at ?? null,
      attachedBy: row ? presentTimelineActor(row.by) : null,
      inherited: Boolean(carried),
    };
  });
}

/** "Filed Sep 15, 7:48 PM by Supplier", or where the file came from instead. */
export function describeProof(
  proof: Pick<MilestoneProof, "attachedAt" | "attachedBy" | "inherited">,
  formatWhen: (iso: string) => string,
): string {
  if (proof.inherited) {
    return proof.attachedAt
      ? `The rider's delivery photo, filed ${formatWhen(proof.attachedAt)}`
      : "The rider's delivery photo";
  }
  if (proof.attachedAt && proof.attachedBy) {
    return `Filed ${formatWhen(proof.attachedAt)} by ${proof.attachedBy}`;
  }
  if (proof.attachedAt) return `Filed ${formatWhen(proof.attachedAt)}`;
  return "On file";
}

/** Who released this share, when, and the note they left. */
export function releaseRecord(
  order: Pick<Order, "timeline">,
  milestone: Pick<PayoutMilestone, "code" | "releasedAt" | "releasedBy">,
): { at: string | null; by: string | null } {
  const row = (order.timeline ?? []).find(
    (entry) =>
      entry.milestoneCode === milestone.code &&
      !entry.fileId &&
      /released/i.test(entry.note ?? ""),
  );
  const by = milestone.releasedBy ?? row?.by ?? null;
  return {
    at: milestone.releasedAt ?? row?.at ?? null,
    by: by ? presentTimelineActor(by) : null,
  };
}

// ---------------------------------------------------------------------------
// The payout queue
// ---------------------------------------------------------------------------

export type PayoutQueueGroup = "ready" | "held" | "waiting" | "settled";

export const PAYOUT_QUEUE_GROUPS: readonly {
  id: PayoutQueueGroup;
  label: string;
  hint: string;
}[] = [
  {
    id: "ready",
    label: "Ready to release",
    hint: "Proof is on file and production has reached the stage. Your call.",
  },
  {
    id: "held",
    label: "Held by a claim",
    hint: "Nothing releases until the claim is lifted on Claims and holds.",
  },
  {
    id: "waiting",
    label: "Waiting on the shop or the rider",
    hint: "A proof has not been filed yet, or production has not reached the next share.",
  },
  {
    id: "settled",
    label: "Fully paid",
    hint: "Every share has gone out. Kept here for the record.",
  },
];

export function payoutQueueGroup(
  order: Pick<
    Order,
    "payoutHold" | "payments" | "state" | "deliveryEvidence" | "payoutMilestones"
  >,
  holds: readonly Claim[] = [],
): PayoutQueueGroup {
  const milestones = order.payoutMilestones ?? [];
  if (milestones.length > 0 && milestones.every(milestoneIsReleased)) return "settled";
  if (orderHasPayoutHold(order) || holds.length > 0) return "held";
  if (releasableMilestones(order, holds).length > 0) return "ready";
  return "waiting";
}

/**
 * One line that says where a payout stands without opening it. Written for
 * the queue row and the workspace section header alike.
 */
export function payoutSummary(
  order: Pick<
    Order,
    | "payoutHold"
    | "payments"
    | "state"
    | "deliveryEvidence"
    | "payoutMilestones"
    | "supplierPriceMinor"
    | "supplierSettlement"
  >,
  holds: readonly Claim[] = [],
): string {
  const milestones = order.payoutMilestones ?? [];
  if (milestones.length === 0) {
    return "Shares are set up when the shop accepts and names its price.";
  }
  const progress = payoutProgress(order);
  const money = (minor: number | null) => (minor === null ? null : formatPhp(minor));
  const group = payoutQueueGroup(order, holds);

  if (group === "settled") {
    const paid = money(progress.releasedMinor);
    return paid
      ? `All ${progress.count} shares released, ${paid} paid.`
      : "Every share released.";
  }
  if (group === "held") {
    const left = money(progress.outstandingMinor);
    return left ? `Held by a claim, ${left} still to release.` : "Held by a claim.";
  }
  if (group === "ready") {
    const ready = releasableMilestones(order, holds);
    const sum = ready.every((m) => m.amountMinor !== undefined)
      ? formatPhp(ready.reduce((total, m) => total + (m.amountMinor ?? 0), 0))
      : null;
    if (ready.length === 1) {
      const name = presentMilestone(ready[0].code, ready[0].sharePercent);
      return sum ? `${name} ready to release, ${sum}.` : `${name} ready to release.`;
    }
    return sum
      ? `${ready.length} shares ready to release, ${sum} together.`
      : `${ready.length} shares ready to release.`;
  }
  const next = nextMilestone(order);
  if (!next) return "Nothing to release yet.";
  const name = presentMilestone(next.code, next.sharePercent);
  if (!milestoneHasProof(next)) {
    return next.code === "delivered" || next.code === "retention"
      ? `Waiting on the rider's delivery photo for ${name.toLowerCase()}.`
      : `Waiting on the shop's proof for ${name.toLowerCase()}.`;
  }
  const blocker = milestoneReleaseBlocker(order, next);
  return blocker ?? `${name} is next.`;
}
