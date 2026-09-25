/**
 * Server-enforced rules the UI should explain *before* the user hits them.
 * Values match gridgo-api (observed + server source); money is always PHP minor units.
 *
 * Cash on delivery is gone from the platform. Every installment is digital only —
 * do not reintroduce a cash path, a cash ceiling, or a Pilot Credits payment route.
 *
 * New orders are paid in full up front; orders placed on 75/25 keep a balance.
 * The split an order was placed under is read through `downpaymentPercentOf`
 * and `balanceNotRequired` in `@/lib/payments` — never a literal 75 or 25.
 */

import type {
  Order,
  PaymentInstallment,
  PaymentRecord,
  PayoutMilestone,
} from "@/lib/api/types";
import { balanceNotRequired, listedInstallments, paymentOf } from "@/lib/payments";
import {
  isLegacyStage,
  releaseRequirementOf,
  stageNeedsProof,
  type PlanOrder,
} from "@/lib/payout-plan";

/**
 * The two checkout splits the API accepts for `PlatformSettings.downpaymentPercent`,
 * in the order Operational settings offers them. 100 is the default.
 */
export const DOWNPAYMENT_PERCENT_CHOICES = [100, 75] as const;
export type DownpaymentPercentChoice = (typeof DOWNPAYMENT_PERCENT_CHOICES)[number];

/**
 * GRIDGO's service fee is not a constant. Operations sets the rate in
 * Operational settings (`PlatformSettings.serviceFeeRateBps`) and every order
 * records the rate it was priced at. The API accepts 0–10,000 basis points.
 */
export const SERVICE_FEE_MAX_BPS = 10_000;

/** Order state in which a client may report a material issue. */
export const ISSUE_REPORT_STATE = "issue_window_open" as const;

/** Claim statuses that block payout release. */
export const ACTIVE_PAYOUT_HOLD_STATUSES = ["open", "payout_held"] as const;

/** Bounds the API accepts for the one global issue-window setting. */
export const ISSUE_WINDOW_MIN_HOURS = 1;
export const ISSUE_WINDOW_MAX_HOURS = 720;

/** Bounds for `productionNudge` on Operational settings. Each unit has its own ceiling. */
export const PRODUCTION_NUDGE_MIN_SECONDS = 1;
export const PRODUCTION_NUDGE_MAX_SECONDS = 3600;
export const PRODUCTION_NUDGE_MIN_MINUTES = 1;
export const PRODUCTION_NUDGE_MAX_MINUTES = 1440;
export const PRODUCTION_NUDGE_MIN_HOURS = 1;
export const PRODUCTION_NUDGE_MAX_HOURS = 720;
export const PRODUCTION_NUDGE_MIN_DAYS = 1;
export const PRODUCTION_NUDGE_MAX_DAYS = 30;
export const PRODUCTION_NUDGE_MIN_COUNT = 1;
export const PRODUCTION_NUDGE_MAX_COUNT = 10;

export function productionNudgeValueBounds(
  unit: "seconds" | "minutes" | "hours" | "days",
): { min: number; max: number } {
  if (unit === "seconds") return { min: PRODUCTION_NUDGE_MIN_SECONDS, max: PRODUCTION_NUDGE_MAX_SECONDS };
  if (unit === "minutes") return { min: PRODUCTION_NUDGE_MIN_MINUTES, max: PRODUCTION_NUDGE_MAX_MINUTES };
  if (unit === "days") return { min: PRODUCTION_NUDGE_MIN_DAYS, max: PRODUCTION_NUDGE_MAX_DAYS };
  return { min: PRODUCTION_NUDGE_MIN_HOURS, max: PRODUCTION_NUDGE_MAX_HOURS };
}

/** Order states in which an installment can be waiting for Operations. */
export const PAYMENT_REVIEW_STATE = "downpayment_review" as const;

/*
 Payout stages are not listed here. Which stages an order has, in what order,
 and what each waits on come from the order itself (`payoutPlanVersion`, and
 each milestone's `releaseRequires`), read through `@/lib/payout-plan`.
*/

export type PlatformConstraintId =
  | "payment_not_pending"
  | "balance_not_required"
  | "assignment_notification_required"
  | "payout_held"
  | "pof_required"
  | "milestone_not_reached"
  | "issue_window_closed"
  | "pickup_escalation_open"
  | "verification_not_approved";

/**
 * Guidance copy for known constraints. Pages may use these strings (or adapt)
 * so recovery language stays consistent without string-matching API messages.
 */
export const PLATFORM_CONSTRAINT_COPY: Record<
  PlatformConstraintId,
  { title: string; guidance: string }
> = {
  payment_not_pending: {
    title: "Nothing waiting on this installment",
    guidance:
      "This installment has no payment waiting for a decision — someone may have already confirmed it. Refresh the order to see where it stands.",
  },
  balance_not_required: {
    title: "Paid in full up front",
    guidance:
      "This order was paid in full at checkout, so it has no balance to send, confirm or reject.",
  },
  assignment_notification_required: {
    title: "Client has not been told the final price",
    guidance:
      "The client is told the final price when the supplier accepts. Payment cannot be asked for or confirmed before that notification exists.",
  },
  payout_held: {
    title: "Payout on hold",
    guidance:
      "An open claim holds this supplier's payout. Release the claim before releasing any milestone.",
  },
  pof_required: {
    title: "Proof of Fulfilment missing",
    guidance:
      "Each milestone releases only against evidence. Ask the supplier (printing, packaging) or the rider (delivered) to upload the proof, then release.",
  },
  milestone_not_reached: {
    title: "Production has not reached this milestone",
    guidance:
      "Milestones release in order as the job progresses. Release the earlier share first, or wait for production to reach this stage.",
  },
  issue_window_closed: {
    title: "Issue window closed",
    guidance:
      "A client can only report a material issue while the issue window is open. Its length is set once, platform-wide, in Operational settings.",
  },
  pickup_escalation_open: {
    title: "Pickup blocked by a failed check",
    guidance:
      "The rider failed a pickup check and must not transport this order. Give an instruction on the escalation; the rider then repeats all six checks.",
  },
  verification_not_approved: {
    title: "Account not approved yet",
    guidance:
      "Suppliers and riders sign themselves up and wait for a decision. Approve the account before it can be matched or dispatched.",
  },
};

/** True when the order currently reports an active payout hold. */
export function orderHasPayoutHold(order: Pick<Order, "payoutHold">): boolean {
  return Boolean(order.payoutHold);
}

/** True when a client may report an issue on this order state. */
export function canReportIssue(state: string): boolean {
  return state === ISSUE_REPORT_STATE;
}

/** True when claim status blocks payout release. */
export function claimBlocksPayout(status: string): boolean {
  return (ACTIVE_PAYOUT_HOLD_STATUSES as readonly string[]).includes(status);
}

/** True when Operations has a payment decision to make on this installment. */
export function paymentAwaitsConfirmation(
  payment: Pick<PaymentRecord, "status"> | undefined | null,
): boolean {
  return payment?.status === "pending_confirmation";
}

/**
 * True once nothing more is owed on this installment: the money is in, however
 * it was recorded, or it is the ₱0 `not_required` balance of an order paid in
 * full up front. Mirrors the API, where every gate on the balance lets
 * `not_required` through.
 */
export function paymentIsSettled(
  payment: Pick<PaymentRecord, "status"> | undefined | null,
): boolean {
  return (
    payment?.status === "confirmed" ||
    payment?.status === "legacy_confirmed" ||
    payment?.status === "not_required"
  );
}

/** The installments on an order that Operations still has to decide on. */
export function installmentsAwaitingConfirmation(
  order: Pick<Order, "payments">,
): PaymentInstallment[] {
  if (!order.payments) return [];
  return listedInstallments(order).filter((code) =>
    paymentAwaitsConfirmation(paymentOf(order, code)),
  );
}

/**
 * The balance cannot be submitted until the downpayment is settled, so a
 * pending balance always implies a settled downpayment. Stated for the UI so
 * it can explain the order of events before the client is asked for anything.
 * An order paid in full up front has no balance to submit at all.
 */
export function canSubmitBalance(
  order: Pick<Order, "payments"> & Partial<Pick<Order, "balanceMinor" | "downpaymentPercent">>,
): boolean {
  if (balanceNotRequired(order)) return false;
  return paymentIsSettled(paymentOf(order, "downpayment"));
}

/** True when the client has been told the final price and may be asked to pay. */
export function clientWasNotifiedOfPrice(
  order: Pick<Order, "assignmentNotificationId">,
): boolean {
  return Boolean(order.assignmentNotificationId);
}

/** A milestone can only be released against a Proof of Fulfilment. */
export function milestoneHasProof(
  milestone: Pick<PayoutMilestone, "pofFileIds" | "status">,
): boolean {
  return (
    milestone.pofFileIds.length > 0 ||
    milestone.status === "pof_attached" ||
    milestone.status === "released"
  );
}

export function milestoneIsReleased(milestone: Pick<PayoutMilestone, "status">): boolean {
  return milestone.status === "released";
}

/*
 The steps each stage names, mirrored from the platform's own gates.

 A screen that lets Operations press a button the server will refuse teaches
 them to distrust the screen, so the blockers are stated before the click.
*/
const PRINTING_STATES = new Set([
  "production",
  "supplier_self_qc",
  "ready_for_dispatch",
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
  "awaiting_collection",
  "delivered",
  "issue_window_open",
  "completed",
  "payout_released",
]);
const PACKING_STATES = new Set([
  "supplier_self_qc",
  "ready_for_dispatch",
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
  "awaiting_collection",
  "delivered",
  "issue_window_open",
  "completed",
  "payout_released",
]);
const DELIVERED_STATES = new Set([
  "delivered",
  "issue_window_open",
  "completed",
  "payout_released",
]);

const WINDOW_CLOSED_STATES = new Set(["completed", "payout_released"]);

/**
 * Why this milestone cannot be released right now, in plain language, or null
 * when Operations can go ahead. Mirrors the server's 409 codes so the screen
 * explains the block before the click rather than after it.
 *
 * What a stage waits on comes from the stage (`releaseRequires`), not from a
 * list of codes. A legacy four-stage order keeps its old gates and words.
 */
export function milestoneReleaseBlocker(
  order: Pick<Order, "payoutHold" | "payments" | "state" | "deliveryEvidence"> &
    PlanOrder,
  milestone: Pick<PayoutMilestone, "code" | "status" | "pofFileIds"> &
    Partial<Pick<PayoutMilestone, "releaseRequires" | "label" | "sharePercent">>,
): string | null {
  if (milestoneIsReleased(milestone)) return null;
  if (orderHasPayoutHold(order)) {
    return PLATFORM_CONSTRAINT_COPY.payout_held.guidance;
  }
  if (isLegacyStage(order, milestone)) return legacyMilestoneBlocker(order, milestone);

  const requirement = releaseRequirementOf(milestone);
  if (stageNeedsProof(order, milestone) && !milestoneHasProof(milestone)) {
    if (requirement === "delivery_proof") {
      return "The delivered share releases once the rider has recorded the delivery photo or signature. It becomes this share's proof on its own.";
    }
    if (requirement === "shop_proof") {
      return milestone.code === "production_started"
        ? "The shop has not filed its start-of-production photo yet. This share releases once it does."
        : "The shop has not filed its proof for this stage yet. This share releases once it does.";
    }
    return PLATFORM_CONSTRAINT_COPY.pof_required.guidance;
  }
  if (requirement === "shop_proof" && !PRINTING_STATES.has(order.state)) {
    return "This share releases once the shop has started production.";
  }
  if (requirement === "delivery_proof") {
    const blocker = deliveredBlocker(order);
    if (blocker) return blocker;
  }
  if (requirement === "issue_window_closed" && !WINDOW_CLOSED_STATES.has(order.state)) {
    return order.state === "issue_window_open"
      ? "The client can still report a problem. The last share releases once the complaint window closes with no claim open, or the client confirms the job is fine."
      : "The last share releases once the job is delivered and the complaint window has closed with no claim open.";
  }
  return null;
}

/** The four legacy stages, gated and worded exactly as before the escrow plan. */
function legacyMilestoneBlocker(
  order: Pick<Order, "payments" | "state" | "deliveryEvidence">,
  milestone: Pick<PayoutMilestone, "code" | "status" | "pofFileIds">,
): string | null {
  if (!milestoneHasProof(milestone)) {
    return PLATFORM_CONSTRAINT_COPY.pof_required.guidance;
  }
  // The two the shop itself has to reach. The server refuses either on the
  // step rather than on the proof, so the screen has to say which.
  if (milestone.code === "printing" && !PRINTING_STATES.has(order.state)) {
    return "Printing releases once the shop has started this job.";
  }
  if (milestone.code === "packaging_qc" && !PACKING_STATES.has(order.state)) {
    return "Packing releases once the job is packed and ready for a rider.";
  }
  if (milestone.code === "delivered") {
    const blocker = deliveredBlocker(order);
    if (blocker) return blocker;
  }
  if (milestone.code === "retention" && order.state !== "completed") {
    return "Retention releases when the issue window has expired and the order has completed.";
  }
  return null;
}

/** The client has the job, the rider's evidence is on file, and the money is in. */
function deliveredBlocker(
  order: Pick<Order, "payments" | "state" | "deliveryEvidence">,
): string | null {
  if (!DELIVERED_STATES.has(order.state)) {
    return "The delivered share releases once the client has the job, at their door or off the counter.";
  }
  if (!order.deliveryEvidence) {
    return "The delivered share releases once the rider has filed delivery evidence.";
  }
  const balance = paymentOf(order, "balance");
  if (balance && !paymentIsSettled(balance)) {
    return "The delivered share releases once the client's balance is confirmed.";
  }
  return null;
}

/** Every milestone released — the only way `completed` may become released. */
export function allMilestonesReleased(
  milestones: readonly Pick<PayoutMilestone, "status">[] | undefined,
): boolean {
  if (!milestones?.length) return false;
  return milestones.every(milestoneIsReleased);
}
