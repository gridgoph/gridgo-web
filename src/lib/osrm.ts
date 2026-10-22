/**
 * Road distance for the rider-on-the-way card.
 *
 * Matches gridgo-supplier `lib/osrm.ts`. The public router can fail; a
 * straight line is the fallback and the card says so. This is not the staff
 * dispatch map.
 */

import {
  haversineMetres,
  isGeoPoint,
  toLonLat,
  type ApproachRoute,
  type GeoPoint,
  type LonLat,
} from "@/lib/rider-approach";

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const ROUTE_TIMEOUT_MS = 8_000;

type OsrmRouteResponse = {
  code?: string;
  routes?: { distance: number; duration: number; geometry?: { coordinates?: LonLat[] } }[];
};

export function parseOsrmResponse(data: OsrmRouteResponse): ApproachRoute | null {
  const route = data.code === "Ok" ? data.routes?.[0] : undefined;
  const coordinates = route?.geometry?.coordinates;
  if (!route || !coordinates || coordinates.length < 2) return null;
  if (!Number.isFinite(route.distance) || !Number.isFinite(route.duration)) return null;
  return { routed: true, distanceMetres: route.distance, durationSeconds: route.duration, coordinates };
}

export function fallbackRoute(from: GeoPoint, to: GeoPoint): ApproachRoute {
  return {
    routed: false,
    distanceMetres: haversineMetres(from, to),
    durationSeconds: 0,
    coordinates: [toLonLat(from), toLonLat(to)],
  };
}

export async function fetchRoute(
  from: GeoPoint,
  to: GeoPoint,
  options?: { signal?: AbortSignal; fetchImpl?: typeof fetch },
): Promise<ApproachRoute> {
  if (!isGeoPoint(from) || !isGeoPoint(to)) return fallbackRoute(from, to);
  const [lon1, lat1] = toLonLat(from);
  const [lon2, lat2] = toLonLat(to);
  const url = `${OSRM_BASE}/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
  options?.signal?.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const res = await (options?.fetchImpl ?? fetch)(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return fallbackRoute(from, to);
    return parseOsrmResponse((await res.json()) as OsrmRouteResponse) ?? fallbackRoute(from, to);
  } catch {
    return fallbackRoute(from, to);
  } finally {
    clearTimeout(timer);
  }
}
