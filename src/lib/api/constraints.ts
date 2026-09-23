/**
 * Server-enforced rules the UI should explain *before* the user hits them.
 * Values match gridgo-api (observed + server source); money is always PHP minor units.
 *
 * Cash on delivery is gone from the platform. The 25% balance is digital only —
 * do not reintroduce a cash path, a cash ceiling, or a Pilot Credits payment route.
 */

import type {
  Order,
  PaymentInstallment,
  PaymentRecord,
  PayoutMilestone,
  PayoutMilestoneCode,
} from "@/lib/api/types";
import { listedInstallments, paymentOf } from "@/lib/payments";

/** Share of the client total taken as the downpayment. */
export const DOWNPAYMENT_PERCENT = 75;

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

/** Bounds for `productionNudge` on Operational settings. Days and hours differ. */
export const PRODUCTION_NUDGE_MIN_HOURS = 1;
export const PRODUCTION_NUDGE_MAX_HOURS = 720;
export const PRODUCTION_NUDGE_MIN_DAYS = 1;
export const PRODUCTION_NUDGE_MAX_DAYS = 30;
export const PRODUCTION_NUDGE_MIN_COUNT = 1;
export const PRODUCTION_NUDGE_MAX_COUNT = 10;

export function productionNudgeValueBounds(unit: "hours" | "days"): { min: number; max: number } {
  return unit === "days"
    ? { min: PRODUCTION_NUDGE_MIN_DAYS, max: PRODUCTION_NUDGE_MAX_DAYS }
    : { min: PRODUCTION_NUDGE_MIN_HOURS, max: PRODUCTION_NUDGE_MAX_HOURS };
}

/** Order states in which an installment can be waiting for Operations. */
export const PAYMENT_REVIEW_STATE = "downpayment_review" as const;

/**
 * Milestone shares of the *supplier's own* price, in release order.
 * These are not shares of what the client pays.
 */
export const MILESTONE_ORDER: readonly PayoutMilestoneCode[] = [
  "printing",
  "packaging_qc",
  "delivered",
  "retention",
] as const;

export type PlatformConstraintId =
  | "payment_not_pending"
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

/** True once the money is in, however it was recorded. */
export function paymentIsSettled(
  payment: Pick<PaymentRecord, "status"> | undefined | null,
): boolean {
  return payment?.status === "confirmed" || payment?.status === "legacy_confirmed";
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
 */
export function canSubmitBalance(order: Pick<Order, "payments">): boolean {
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

/**
 * Why this milestone cannot be released right now, in plain language, or null
 * when Operations can go ahead. Mirrors the server's 409 codes so the screen
 * explains the block before the click rather than after it.
 */
export function milestoneReleaseBlocker(
  order: Pick<Order, "payoutHold" | "payments" | "state" | "deliveryEvidence">,
  milestone: Pick<PayoutMilestone, "code" | "status" | "pofFileIds">,
): string | null {
  if (milestoneIsReleased(milestone)) return null;
  if (orderHasPayoutHold(order)) {
    return PLATFORM_CONSTRAINT_COPY.payout_held.guidance;
  }
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
    if (!DELIVERED_STATES.has(order.state)) {
      return "The delivered share releases once the client has the job, at their door or off the counter.";
    }
    if (!order.deliveryEvidence) {
      return "The delivered share releases once the rider has filed delivery evidence.";
    }
    const balance = paymentOf(order, "balance");
    if (balance && !paymentIsSettled(balance)) {
      return "The delivered share releases once the client's 25% balance is confirmed.";
    }
  }
  if (milestone.code === "retention" && order.state !== "completed") {
    return "Retention releases when the issue window has expired and the order has completed.";
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
