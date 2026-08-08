/**
 * Finance rollups composed from orders + claims.
 * Only sums figures the demo ledger actually exposes — never invents rows.
 */

import type { Claim, Order } from "@/lib/api/types";

export type MoneyFigure =
  | { kind: "amount"; minor: number }
  | { kind: "unavailable"; reason: string };

export type FinanceRollup = {
  /** Sum of order totals with paymentStatus authorised. */
  authorised: MoneyFigure;
  /** Sum of order totals with paymentStatus collected. */
  collected: MoneyFigure;
  /** Sum of order totals still unpaid (any method or none). */
  unpaid: MoneyFigure;
  /**
   * Order totals where payoutHold is true.
   * Reflects active claim holds blocking payout_released.
   */
  heldOnOrders: MoneyFigure;
  /** Count of claims currently in payout_held status. */
  activeHoldClaims: number;
  /** COD orders with payment collected. */
  codCollected: MoneyFigure;
  /** COD orders not yet collected. */
  codOutstanding: MoneyFigure;
  /**
   * Payout released amounts.
   * Demo orders expose state `payout_released` but no separate payout amount
   * field — we use order totalMinor when that state is present.
   */
  payoutReleased: MoneyFigure;
  orderCount: number;
  codOrderCount: number;
};

function sumTotals(
  orders: Order[],
  predicate: (o: Order) => boolean,
): number {
  return orders.reduce(
    (sum, o) => (predicate(o) ? sum + (o.totalMinor ?? 0) : sum),
    0,
  );
}

export function rollupFinance(
  orders: Order[],
  claims: Claim[],
): FinanceRollup {
  const authorisedMinor = sumTotals(
    orders,
    (o) => o.paymentStatus === "authorized",
  );
  const collectedMinor = sumTotals(
    orders,
    (o) => o.paymentStatus === "collected",
  );
  const unpaidMinor = sumTotals(orders, (o) => o.paymentStatus === "unpaid");
  const heldMinor = sumTotals(orders, (o) => o.payoutHold === true);

  const codOrders = orders.filter((o) => o.paymentMethod === "cod");
  const codCollectedMinor = sumTotals(
    codOrders,
    (o) => o.paymentStatus === "collected",
  );
  const codOutstandingMinor = sumTotals(
    codOrders,
    (o) => o.paymentStatus !== "collected",
  );

  const releasedOrders = orders.filter((o) => o.state === "payout_released");
  const releasedMinor = sumTotals(releasedOrders, () => true);

  const activeHoldClaims = claims.filter(
    (c) => c.status === "payout_held",
  ).length;

  return {
    authorised: { kind: "amount", minor: authorisedMinor },
    collected: { kind: "amount", minor: collectedMinor },
    unpaid: { kind: "amount", minor: unpaidMinor },
    heldOnOrders: { kind: "amount", minor: heldMinor },
    activeHoldClaims,
    codCollected: { kind: "amount", minor: codCollectedMinor },
    codOutstanding: { kind: "amount", minor: codOutstandingMinor },
    payoutReleased:
      releasedOrders.length > 0
        ? { kind: "amount", minor: releasedMinor }
        : {
            kind: "unavailable",
            reason:
              "No orders in payout released on the demo ledger. When that state appears, totals use the order amount (no separate payout field exists).",
          },
    orderCount: orders.length,
    codOrderCount: codOrders.length,
  };
}

/** Whether an order is cash-on-delivery. */
export function isCodOrder(order: Order): boolean {
  return order.paymentMethod === "cod";
}

/** COD rows for reconciliation table. */
export function codReconciliationRows(orders: Order[]): Order[] {
  return orders
    .filter(isCodOrder)
    .slice()
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}
