/**
 * Finance rollups composed from orders + claims.
 * Only sums figures the ledger actually exposes — never invents rows.
 *
 * Operations and Super Admin are the only roles the server gives supplier price
 * and the service fee to, which is what makes reconciliation possible here and
 * nowhere else.
 */

import type { Claim, Order, PaymentRecord } from "@/lib/api/types";
import { claimBlocksPayout, paymentIsSettled } from "@/lib/api/constraints";
import { listedInstallments, paymentOf } from "@/lib/payments";

export type MoneyFigure =
  { kind: "amount"; minor: number } | { kind: "unavailable"; reason: string };

export type FinanceRollup = {
  /** Client money actually confirmed as received, across both installments. */
  confirmedIn: MoneyFigure;
  /** Submitted by a client and waiting on an Operations decision. */
  awaitingConfirmation: MoneyFigure;
  /** Billed on live orders but not yet paid. */
  outstanding: MoneyFigure;
  /** GRIDGO's service fee across orders that have been priced. */
  commissionEarned: MoneyFigure;
  /** Milestone amounts already paid out to suppliers. */
  supplierReleased: MoneyFigure;
  /** Milestone amounts still owed to suppliers on live orders. */
  supplierOutstanding: MoneyFigure;
  /** Order totals where an active claim holds payout. */
  heldOnOrders: MoneyFigure;
  activeHoldClaims: number;
  orderCount: number;
  /** Orders whose money is still only an estimate — no supplier price yet. */
  unpricedOrderCount: number;
};

/** Orders that no longer represent money in flight. */
const DEAD_STATES = new Set(["draft"]);

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function rollupFinance(orders: Order[], claims: Claim[]): FinanceRollup {
  const live = orders.filter((o) => !DEAD_STATES.has(o.state));

  const installmentAmounts = (
    order: Order,
    match: (payment: PaymentRecord) => boolean,
  ): number[] =>
    listedInstallments(order).flatMap((code) => {
      const payment = paymentOf(order, code);
      return payment && match(payment) ? [payment.amountMinor] : [];
    });

  const confirmedIn = sum(
    live.flatMap((order) => installmentAmounts(order, paymentIsSettled)),
  );

  const awaiting = sum(
    live.flatMap((order) =>
      installmentAmounts(order, (payment) => payment.status === "pending_confirmation"),
    ),
  );

  const outstanding = sum(
    live.flatMap((order) =>
      installmentAmounts(order, (payment) => payment.status === "not_submitted"),
    ),
  );

  const priced = live.filter((o) => o.serviceFeeMinor !== undefined);
  const commission = sum(priced.map((o) => o.serviceFeeMinor ?? 0));

  const milestones = live.flatMap((o) => o.payoutMilestones ?? []);
  const released = sum(
    milestones.filter((m) => m.status === "released").map((m) => m.amountMinor ?? 0),
  );
  const stillOwed = sum(
    milestones.filter((m) => m.status !== "released").map((m) => m.amountMinor ?? 0),
  );

  const held = sum(
    live.filter((o) => o.payoutHold === true).map((o) => o.totalMinor ?? 0),
  );

  return {
    confirmedIn: { kind: "amount", minor: confirmedIn },
    awaitingConfirmation: { kind: "amount", minor: awaiting },
    outstanding: { kind: "amount", minor: outstanding },
    commissionEarned: priced.length
      ? { kind: "amount", minor: commission }
      : {
          kind: "unavailable",
          reason:
            "No order has a supplier price yet, so there is no commission to count.",
        },
    supplierReleased: { kind: "amount", minor: released },
    supplierOutstanding: { kind: "amount", minor: stillOwed },
    heldOnOrders: { kind: "amount", minor: held },
    activeHoldClaims: claims.filter((c) => claimBlocksPayout(c.status)).length,
    orderCount: live.length,
    unpricedOrderCount: live.length - priced.length,
  };
}

export type OrderMoneySplit = {
  orderId: string;
  label: string;
  supplierPriceMinor: number;
  commissionMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
};

/**
 * Per-order split of what the client pays into supplier earnings, GRIDGO's
 * service fee and delivery. Only orders the server priced appear — an estimate
 * has no supplier price to split.
 */
export function orderMoneySplits(orders: Order[]): OrderMoneySplit[] {
  return orders
    .filter(
      (order) =>
        order.supplierPriceMinor !== undefined &&
        order.serviceFeeMinor !== undefined &&
        !DEAD_STATES.has(order.state),
    )
    .map((order) => ({
      orderId: order.id,
      label: order.title,
      supplierPriceMinor: order.supplierPriceMinor!,
      commissionMinor: order.serviceFeeMinor!,
      deliveryFeeMinor: order.deliveryFeeMinor,
      totalMinor: order.totalMinor,
    }))
    .sort((a, b) => b.totalMinor - a.totalMinor);
}

/** Orders with money still to move, newest activity last. */
export function reconciliationRows(orders: Order[]): Order[] {
  return orders
    .filter((o) => !DEAD_STATES.has(o.state))
    .slice()
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}
