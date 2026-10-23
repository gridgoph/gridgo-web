/**
 * The rider on the way to the shop.
 *
 * Wording and timing match gridgo-supplier `lib/riderApproach.ts`. While a
 * job is `rider_assigned`, `GET /dispatch/:id/location` gives the shop the
 * rider's newest ping and the shop's own pick-up point. At pick-up the
 * answer becomes `{ ping: null, hidden: "picked_up" }` and the approach
 * goes away. This module never keeps a position the server has stopped sending.
 */

export type GeoPoint = { lat: number; lng: number };

export type RiderPing = GeoPoint & {
  at: string;
  accuracy?: number | null;
};

export type LonLat = [number, number];

export type RiderApproach = {
  ping: RiderPing | null;
  shop: GeoPoint | null;
  hidden: "picked_up" | null;
};

export const APPROACH_STALE_MS = 3 * 60_000;
export const APPROACH_POLL_MS = 12_000;
const ARRIVING_METRES = 150;
const FALLBACK_METRES_PER_SECOND = 5;
const STRAIGHT_LINE_DETOUR = 1.3;
const EARTH_RADIUS_M = 6_371_000;

export function isGeoPoint(value: unknown): value is GeoPoint {
  if (!value || typeof value !== "object") return false;
  const { lat, lng } = value as Record<string, unknown>;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

export function toLonLat(point: GeoPoint): LonLat {
  return [point.lng, point.lat];
}

export function haversineMetres(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function parseRiderApproach(raw: unknown): RiderApproach {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawPing = body.ping as Record<string, unknown> | null | undefined;
  const accuracy = rawPing?.accuracy;
  const at = typeof rawPing?.at === "string" && Number.isFinite(Date.parse(rawPing.at)) ? rawPing.at : null;
  const ping =
    rawPing && isGeoPoint(rawPing) && at
      ? {
          lat: rawPing.lat as number,
          lng: rawPing.lng as number,
          at,
          accuracy: typeof accuracy === "number" ? accuracy : null,
        }
      : null;
  const shop = isGeoPoint(body.shop) ? { lat: body.shop.lat, lng: body.shop.lng } : null;
  const hidden = body.hidden === "picked_up" ? "picked_up" : null;
  return { ping: hidden ? null : ping, shop, hidden };
}

export function locationAge(at: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${Math.floor(seconds / 5) * 5} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}

export function isPingStale(at: string, now: number = Date.now()): boolean {
  return now - Date.parse(at) > APPROACH_STALE_MS;
}

export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.max(50, Math.round(metres / 50) * 50)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export type ApproachRoute = {
  routed: boolean;
  distanceMetres: number;
  durationSeconds: number;
  coordinates: LonLat[];
};

export function roughMinutes(route: ApproachRoute): number {
  const seconds = route.routed
    ? route.durationSeconds
    : (route.distanceMetres * STRAIGHT_LINE_DETOUR) / FALLBACK_METRES_PER_SECOND;
  return Math.max(1, Math.round(seconds / 60));
}

export type ApproachTone = "info" | "warning" | "neutral";

export type ApproachReadout = {
  kind: "waiting" | "live" | "stale" | "arriving";
  headline: string;
  distance: string | null;
  freshness: { tone: ApproachTone; label: string; icon: "clock" | "triangle-alert" };
  detail: string | null;
  faded: boolean;
};

export function approachReadout({
  approach,
  route,
  riderName,
  now = Date.now(),
}: {
  approach: RiderApproach;
  route: ApproachRoute | null;
  riderName: string | null;
  now?: number;
}): ApproachReadout {
  const who = riderName || "The rider";
  const ping = approach.ping;

  if (!ping) {
    return {
      kind: "waiting",
      headline: `${who} has not shared a location yet`,
      distance: null,
      freshness: { tone: "neutral", label: "No location yet", icon: "clock" },
      detail: "It shows here once their phone sends it. Message them if you need to know where they are.",
      faded: false,
    };
  }

  const stale = isPingStale(ping.at, now);
  const age = locationAge(ping.at, now);
  const metres = route
    ? route.distanceMetres
    : approach.shop
      ? haversineMetres(ping, approach.shop)
      : null;
  const distance =
    metres == null
      ? null
      : route?.routed
        ? `${formatDistance(metres)} by road`
        : `${formatDistance(metres)} in a straight line`;

  if (stale) {
    return {
      kind: "stale",
      headline: `${who} was last seen ${age}`,
      distance,
      freshness: { tone: "warning", label: `Last seen ${age}`, icon: "triangle-alert" },
      detail: "Their phone has stopped sending a location, so the pin shows where they were. Message them to check.",
      faded: true,
    };
  }

  const freshness = { tone: "info" as const, label: `Updated ${age}`, icon: "clock" as const };

  if (metres != null && metres < ARRIVING_METRES) {
    return {
      kind: "arriving",
      headline: `${who} is almost at your shop`,
      distance,
      freshness,
      detail: "Have the package at the counter for the pickup checks.",
      faded: false,
    };
  }

  return {
    kind: "live",
    headline: route ? `${who} is about ${roughMinutes(route)} min away` : `${who} is on the way`,
    distance,
    freshness,
    detail: route ? "A rough guess from the road distance. Traffic can change it." : null,
    faded: false,
  };
}

/** The approach is gone once GRIDGO stops sharing the position. */
export function approachWithdrawn(approach: RiderApproach | null, unavailable: boolean): boolean {
  return unavailable || approach?.hidden === "picked_up";
}
