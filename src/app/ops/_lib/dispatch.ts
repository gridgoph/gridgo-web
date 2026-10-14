/**
 * Dispatch helpers: which orders the dispatch board shows, in what order.
 * Rider location freshness lives in `src/lib/rider-tracking.ts`.
 */

import type { Order } from "@/lib/api/types";

/**
 * Delivery-related states Operations monitors on the dispatch board.
 *
 * `awaiting_collection` is here because a collected job is not finished when
 * the rider walks away — it sits on the office counter until somebody comes for
 * it, and releasing it is Operations' own action. Off this board, a job on the
 * shelf would be nobody's.
 */
export const DISPATCH_STATES = new Set([
  "ready_for_dispatch",
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
  "awaiting_collection",
]);

export function isDispatchOrder(order: Pick<Order, "state">): boolean {
  return DISPATCH_STATES.has(order.state);
}

export function filterDispatchOrders(orders: Order[]): Order[] {
  return orders
    .filter((o) => isDispatchOrder(o))
    .sort((a, b) => {
      // ready_for_dispatch first (needs ops), then in-flight by update
      // Waiting on Operations first: a job on the counter and a job with no
      // rider are both stuck until somebody here acts.
      const rank = (s: string) =>
        s === "awaiting_collection"
          ? 0
          : s === "ready_for_dispatch"
            ? 1
            : s === "rider_assigned"
              ? 2
              : 3;
      const d = rank(a.state) - rank(b.state);
      if (d !== 0) return d;
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });
}
