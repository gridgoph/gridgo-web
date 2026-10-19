/**
 * Prohibited items at the file check (tracker item 276, option B; contract
 * "Prohibited-item decisions at file check" in gridgo-api
 * `docs/ORDER_MATCH_API.md`).
 *
 * From the file check Operations can hold an order for a prohibited item,
 * release the hold back to the file check, or cancel it through the existing
 * cancellation refund (full refund, nothing to the shop or rider). No new
 * order state: a hold is `client_correction` with `fileCheck.reasonCode:
 * "prohibited_item"` and `status: "failed"`. Every reason is client-visible.
 *
 * A review-data (test) order never moves money: it is cancelled by the
 * ordinary `cancelled` transition with the reason code instead.
 *
 * Pure: no React, no fetch.
 */

import type { Order } from "@/lib/api/types";
import type { StatePresentation } from "@/lib/order-state";
import { isTestOrder } from "@/lib/review-data";

export const PROHIBITED_ITEM = "prohibited_item" as const;

type Source = Partial<Pick<Order, "fileCheck" | "state" | "reviewData">>;

function prohibited(order: Source): boolean {
  return order.fileCheck?.reasonCode === PROHIBITED_ITEM;
}

/** On hold for a prohibited item: nothing moves until Operations releases or cancels it. */
export function prohibitedItemHold(order: Source): boolean {
  return (
    prohibited(order) &&
    order.fileCheck?.status === "failed" &&
    order.state !== "cancelled"
  );
}

/** Cancelled for a prohibited item (settled refund, or a test order's plain cancel). */
export function prohibitedItemCancelled(order: Source): boolean {
  return (
    prohibited(order) &&
    (order.fileCheck?.status === "cancelled" || order.state === "cancelled")
  );
}

/** The refund request the cancellation opened, if any. */
export function prohibitedItemRefundId(order: Source): string | null {
  return prohibited(order) ? (order.fileCheck?.refundRequestId ?? null) : null;
}

/** How a cancellation goes: the full refund request, or a test order's plain cancel. */
export function prohibitedItemCancelPath(order: Source): "refund" | "test_cancel" {
  return isTestOrder(order) ? "test_cancel" : "refund";
}

export const PROHIBITED_HOLD_STATE: StatePresentation = {
  label: "On hold: prohibited item",
  tone: "error",
  icon: "ban",
};

export const PROHIBITED_CANCELLED_STATE: StatePresentation = {
  label: "Cancelled: prohibited item",
  tone: "neutral",
  icon: "ban",
};

/** Hold, release and cancellation reasons: nonblank, at most 2,000 characters. */
export const PROHIBITED_REASON_MAX = 2000;

export type ProhibitedItemAction = "hold" | "cancel" | "release";

export function prohibitedReasonProblem(
  action: ProhibitedItemAction,
  reason: string,
): string | null {
  const text = reason.trim();
  if (!text) {
    return action === "release"
      ? "Say why the hold is lifted. The client reads it."
      : "Say why the order cannot be printed. The client reads it.";
  }
  if (text.length > PROHIBITED_REASON_MAX) {
    return `Keep it under ${PROHIBITED_REASON_MAX.toLocaleString("en-PH")} characters.`;
  }
  return null;
}
