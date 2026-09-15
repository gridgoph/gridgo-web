/**
 * Road routes for the rider map, from the public OSRM demo server.
 *
 * Same service and same honesty rules as the rider app: it is free, keyless,
 * rate-limited and without an SLA, so routing failure is normal. The fallback
 * is a straight line whose label says it is direct, and no travel time is ever
 * invented for it.
 *
 * OSRM paths are lon,lat. Leaflet is lat,lng. Mixing them puts Davao in the sea.
 */

export type LatLng = { lat: number; lng: number };
/** GeoJSON order: [longitude, latitude]. */
export type LonLat = [number, number];

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const EARTH_RADIUS_METRES = 6_371_000;

export type RouteResult = {
  /** True when OSRM returned a road route; false for the straight-line fallback. */
  routed: boolean;
  distanceMetres: number;
  /** Null whenever routing failed: a guessed travel time is worse than none. */
  durationSeconds: number | null;
  /** GeoJSON LineString coordinates as [lon, lat][]. */
  coordinates: LonLat[];
};

export type OsrmRouteResponse = {
  code?: string;
  routes?: {
    distance: number;
    duration: number;
    geometry?: { type?: string; coordinates?: LonLat[] };
  }[];
};

export function isValidLatLng(point: LatLng | null | undefined): point is LatLng {
  return (
    !!point &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  );
}

export function haversineMetres(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Parse an OSRM body into a route, or null when it is unusable. Pure. */
export function parseOsrmResponse(data: OsrmRouteResponse): RouteResult | null {
  if (data.code !== "Ok" || !data.routes?.length) return null;
  const route = data.routes[0]!;
  const coords = route.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  if (!Number.isFinite(route.distance) || !Number.isFinite(route.duration)) return null;
  return {
    routed: true,
    distanceMetres: route.distance,
    durationSeconds: route.duration,
    coordinates: coords,
  };
}

/** Straight line between the two points; the distance is real but not a road distance. */
export function fallbackRoute(from: LatLng, to: LatLng): RouteResult {
  return {
    routed: false,
    distanceMetres: haversineMetres(from, to),
    durationSeconds: null,
    coordinates: [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ],
  };
}

/** Fetch a driving route. Always resolves; network trouble yields the fallback. */
export async function fetchRoute(
  from: LatLng,
  to: LatLng,
  options?: { signal?: AbortSignal; fetchImpl?: typeof fetch },
): Promise<RouteResult> {
  if (from.lat === to.lat && from.lng === to.lng) {
    return {
      routed: true,
      distanceMetres: 0,
      durationSeconds: 0,
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
    };
  }
  const url = `${OSRM_BASE}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const doFetch = options?.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") return fallbackRoute(from, to);
  try {
    const res = await doFetch(url, {
      signal: options?.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return fallbackRoute(from, to);
    const data = (await res.json()) as OsrmRouteResponse;
    return parseOsrmResponse(data) ?? fallbackRoute(from, to);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    return fallbackRoute(from, to);
  }
}

export function formatDistanceMetres(metres: number): string {
  if (!Number.isFinite(metres) || metres < 0) return "—";
  if (metres < 950) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(metres < 9_950 ? 1 : 0)} km`;
}

export function formatDurationSeconds(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/**
 * One line for the roster and the pin popup.
 * A road route reads "4.2 km · 14 min to drop-off". A fallback never borrows
 * that shape: it says the line is direct and that travel time is unknown.
 */
export function routeSummaryLabel(route: RouteResult | null | undefined): string {
  if (route === undefined) return "Finding the road route…";
  if (route === null) return "No drop-off on file";
  const dist = formatDistanceMetres(route.distanceMetres);
  if (!route.routed || route.durationSeconds == null) {
    return `${dist} direct · road route unavailable`;
  }
  return `${dist} · ${formatDurationSeconds(route.durationSeconds)} to drop-off`;
}
