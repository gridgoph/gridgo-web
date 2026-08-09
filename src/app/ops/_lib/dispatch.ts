/**
 * Dispatch helpers: delivery states and honest location freshness.
 * Location pings are never persisted — callers must re-fetch.
 */

import type { LocationPing, Order } from "@/lib/api/types";

/** Delivery-related states Operations monitors on the dispatch board. */
export const DISPATCH_STATES = new Set([
  "ready_for_dispatch",
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
]);

/** Tracking is only meaningful once a rider is on the job. */
export const TRACKING_ACTIVE_STATES = new Set([
  "picked_up",
  "out_for_delivery",
]);

/** After this age, a ping must never be presented as live. */
export const LOCATION_STALE_MS = 5 * 60 * 1000;

export type LocationFreshness = "live" | "stale" | "missing" | "not_tracking";

export type LocationView = {
  freshness: LocationFreshness;
  /** Human label for StatusChip — never “live” when stale. */
  label: string;
  lat?: number;
  lng?: number;
  accuracy?: number | null;
  at?: string;
  ageMs?: number;
};

export function isDispatchOrder(order: Pick<Order, "state">): boolean {
  return DISPATCH_STATES.has(order.state);
}

export function filterDispatchOrders(orders: Order[]): Order[] {
  return orders
    .filter((o) => isDispatchOrder(o))
    .sort((a, b) => {
      // ready_for_dispatch first (needs ops), then in-flight by update
      const rank = (s: string) =>
        s === "ready_for_dispatch" ? 0 : s === "rider_assigned" ? 1 : 2;
      const d = rank(a.state) - rank(b.state);
      if (d !== 0) return d;
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });
}

/**
 * Present a location ping with honest freshness.
 * Pass `nowMs` for deterministic tests. Never stores the ping.
 */
export function presentLocation(
  ping: LocationPing | null | undefined,
  orderState: string,
  nowMs: number = Date.now(),
  staleAfterMs: number = LOCATION_STALE_MS,
): LocationView {
  if (!TRACKING_ACTIVE_STATES.has(orderState) && !ping) {
    if (orderState === "ready_for_dispatch") {
      return {
        freshness: "not_tracking",
        label: "No rider yet",
      };
    }
    if (orderState === "rider_assigned") {
      return {
        freshness: "not_tracking",
        label: "Tracking starts at pickup",
      };
    }
    return {
      freshness: "missing",
      label: "No location",
    };
  }

  if (!ping) {
    return {
      freshness: "missing",
      label: "No location yet",
    };
  }

  const atMs = Date.parse(ping.at);
  const ageMs = Number.isNaN(atMs) ? Number.POSITIVE_INFINITY : nowMs - atMs;

  if (ageMs > staleAfterMs) {
    return {
      freshness: "stale",
      label: "Location stale",
      lat: ping.lat,
      lng: ping.lng,
      accuracy: ping.accuracy,
      at: ping.at,
      ageMs,
    };
  }

  return {
    freshness: "live",
    label: "Location live",
    lat: ping.lat,
    lng: ping.lng,
    accuracy: ping.accuracy,
    at: ping.at,
    ageMs,
  };
}

export function locationTone(
  freshness: LocationFreshness,
): "success" | "warning" | "error" | "info" | "neutral" {
  switch (freshness) {
    case "live":
      return "success";
    case "stale":
      return "warning";
    case "missing":
      return "error";
    case "not_tracking":
      return "neutral";
    default:
      return "neutral";
  }
}

export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
