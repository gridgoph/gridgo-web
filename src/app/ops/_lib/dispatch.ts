/**
 * Dispatch helpers: which orders the dispatch board shows, in what order.
 * Rider location freshness lives in `src/lib/rider-tracking.ts`.
 */

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { isApiError } from "@/lib/api/client";
import type { Order, User } from "@/lib/api/types";

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

export type RouteAction = {
  /** Where "Show route" goes: the rider on the live map. Null when it cannot open. */
  href: string | null;
  /** "Show route on map" while live, "Show last position on map" once the rider goes quiet. */
  label: string;
  /** Under a disabled control and its accessible description: the location label. */
  reason: string | null;
};

/**
 * The dispatch row's route control. A last known position still opens it, so
 * a quiet rider can be found where they were. With no position the control
 * stays visible but disabled, and says why in the location column's words.
 */
export function presentRouteAction(
  riderId: string | null | undefined,
  view: { hasPosition: boolean; freshness: string } | null,
  locationLabel: string,
): RouteAction {
  if (riderId && view?.hasPosition) {
    return {
      href: `/ops/riders?rider=${encodeURIComponent(riderId)}`,
      label:
        view.freshness === "live" ? "Show route on map" : "Show last position on map",
      reason: null,
    };
  }
  return { href: null, label: "Show route on map", reason: locationLabel };
}

/**
 * The riders Operations can assign: the same test the API applies to the
 * `rider_assigned` transition (gridgo-api `approvedRole`), read off the rider
 * list the portal already loads. An approved rider whose account is active;
 * a pending, suspended or rejected rider, or one on an account hold, is left
 * out rather than offered and refused.
 */
export function assignableRiders(riders: readonly User[]): User[] {
  return riders
    .filter(
      (rider) =>
        rider.verificationStatus === "approved" &&
        (rider.accountStatus ?? "active") === "active",
    )
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
}

/** Why assigning a rider did not go through, in Operations' words. */
export function assignRiderErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    if (err.code === "delivery_pin_payment_pending") {
      return "The client's delivery-pin payment is waiting on Operations. Verify or reject it on the order, then assign a rider.";
    }
    if (err.code === "rider_not_found") {
      return "That rider account no longer exists. Refresh and choose another rider.";
    }
    return opsErrorMessage(err, `Could not assign rider (${err.code}).`);
  }
  return "Network error while assigning rider.";
}
