/**
 * The payment confirmation queue.
 *
 * A client's 75% downpayment does not move the order on its own — Operations
 * looks at the QR transfer reference against the exact amount owed and decides
 * whether the money arrived. Until that happens the order sits still, so this
 * queue is ordered by how long someone has been waiting.
 *
 * Pure functions — no React, no fetch.
 */

import type { Order, PaymentInstallment, PaymentRecord } from "@/lib/api/types";
import { paymentIsSettled } from "@/lib/api/constraints";

export type PaymentReviewRow = {
  order: Order;
  installment: PaymentInstallment;
  payment: PaymentRecord;
  /** What the client says they sent, against what the order says is owed. */
  expectedMinor: number;
  submittedAt: string | null;
  /** Whole minutes the client has been waiting on a decision. */
  waitingMinutes: number;
};

/** Every installment across the book that is waiting on an Operations decision. */
export function paymentsAwaitingReview(
  orders: Order[],
  nowMs: number = Date.now(),
): PaymentReviewRow[] {
  const rows: PaymentReviewRow[] = [];

  for (const order of orders) {
    if (!order.payments) continue;
    for (const installment of ["downpayment", "balance"] as const) {
      const payment = order.payments[installment];
      if (payment.status !== "pending_confirmation") continue;
      const submittedMs = payment.submittedAt
        ? Date.parse(payment.submittedAt)
        : NaN;
      rows.push({
        order,
        installment,
        payment,
        expectedMinor: payment.amountMinor,
        submittedAt: payment.submittedAt,
        waitingMinutes: Number.isNaN(submittedMs)
          ? 0
          : Math.max(0, Math.floor((nowMs - submittedMs) / 60_000)),
      });
    }
  }

  // Longest wait first — the downpayment blocks everything behind it, so when
  // two have waited the same time it goes ahead of a balance.
  return rows.sort((a, b) => {
    if (a.waitingMinutes !== b.waitingMinutes) {
      return b.waitingMinutes - a.waitingMinutes;
    }
    if (a.installment !== b.installment) {
      return a.installment === "downpayment" ? -1 : 1;
    }
    return a.order.id.localeCompare(b.order.id);
  });
}

/**
 * Orders stalled at payment with nothing submitted yet. These are not for
 * Operations to action, but they explain a quiet queue: the client has been
 * told the price and has not paid.
 */
export function ordersAwaitingClientPayment(orders: Order[]): Order[] {
  return orders
    .filter((order) => {
      if (!order.payments) return false;
      const { downpayment, balance } = order.payments;
      if (order.state === "awaiting_downpayment") {
        return downpayment.status === "not_submitted";
      }
      return (
        paymentIsSettled(downpayment) &&
        balance.status === "not_submitted" &&
        !["draft", "submitted", "needs_qa"].includes(order.state)
      );
    })
    .sort((a, b) => (a.updatedAt || "").localeCompare(b.updatedAt || ""));
}

/** "3 hours" / "12 minutes" — how long the client has been waiting. */
export function formatWait(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Reasons Operations picks from when the money did not arrive. Each one is
 * written to be read by the client, because it is what they are told.
 */
export const PAYMENT_REJECTION_REASONS: readonly {
  id: string;
  label: string;
  clientMessage: string;
}[] = [
  {
    id: "not_received",
    label: "No transfer found",
    clientMessage:
      "We could not find this transfer in the GRIDGO wallet. Check that it went through, then submit the reference again.",
  },
  {
    id: "reference_mismatch",
    label: "Reference does not match",
    clientMessage:
      "The reference you sent does not match any transfer we received. Copy it again from your e-wallet receipt and resubmit.",
  },
  {
    id: "amount_short",
    label: "Amount is short",
    clientMessage:
      "The transfer we received is less than the amount due on this order. Send the difference, then submit the new reference.",
  },
  {
    id: "duplicate_reference",
    label: "Reference already used",
    clientMessage:
      "This reference was already used on another order. Send a fresh transfer for this one and submit its reference.",
  },
];
