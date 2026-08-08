/**
 * Server-enforced rules the UI should explain *before* the user hits them.
 * Values match gridgo-api (observed + server source); money is always PHP minor units.
 */

/** COD order total (product + delivery) must be ≤ ₱1,500. */
export const COD_MAX_MINOR = 150_000;

/** Order state in which a client may report a material issue. */
export const ISSUE_REPORT_STATE = "issue_window_open" as const;

/** Claim statuses that block `completed` → `payout_released`. */
export const ACTIVE_PAYOUT_HOLD_STATUSES = ["open", "payout_held"] as const;

export type PlatformConstraintId =
  | "cod_limit"
  | "cod_one_active"
  | "payout_held"
  | "issue_window_closed"
  | "one_active_order";

/**
 * Guidance copy for known constraints. Pages may use these strings (or adapt)
 * so recovery language stays consistent without string-matching API messages.
 */
export const PLATFORM_CONSTRAINT_COPY: Record<
  PlatformConstraintId,
  { title: string; guidance: string }
> = {
  cod_limit: {
    title: "Cash on Delivery limit",
    guidance:
      "Cash on Delivery is available only when product + delivery is ₱1,500 or less. Choose Pilot Credits, or reduce the order total.",
  },
  cod_one_active: {
    title: "One active Cash on Delivery order",
    guidance:
      "A client may have only one open Cash on Delivery order at a time. Finish or settle the open COD order before authorising another.",
  },
  payout_held: {
    title: "Payout on hold",
    guidance:
      "An open claim holds supplier payout. Resolve or release the claim before marking payout released.",
  },
  issue_window_closed: {
    title: "Issue window closed",
    guidance:
      "Material issues can only be reported while the order is in the 24-hour issue window after delivery.",
  },
  one_active_order: {
    title: "One active order rule",
    guidance:
      "Some client flows allow only one active order. Complete or cancel the open order before starting another.",
  },
};

/** True when product + delivery is within the COD cap (same rule as order create / COD authorize). */
export function isWithinCodLimit(
  totalMinor: number,
  deliveryFeeMinor: number,
): boolean {
  return totalMinor + deliveryFeeMinor <= COD_MAX_MINOR;
}

/** True when the order currently reports an active payout hold. */
export function orderHasPayoutHold(order: {
  payoutHold?: boolean;
}): boolean {
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
