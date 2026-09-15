"use client";

import { useEffect, useRef, useState } from "react";

import { presentLocation, type LocationFreshness } from "@/app/ops/_lib/dispatch";
import type { RiderRoutes } from "@/components/riders/useRiderRoutes";
import type { MapPoint, RiderLocation } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";
import { routeSummaryLabel } from "@/lib/osrm";
import { resolveTheme } from "@/lib/theme";
import { vehicleGlyphSvg, vehicleSummary } from "@/lib/vehicle";

const DAVAO = { lat: 7.0731, lng: 125.6128 };
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

/**
 * Basemap: the same OpenStreetMap tiles the rider app draws, keyless. The
 * cartography is toned to GRIDGO's greys in CSS (`.gg-map`), and inverted for
 * the dark theme (`.gg-map--dark`), so the yellow route is the only colour on
 * the map in either theme.
 */
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_OPTIONS = {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
} as const;

/**
 * Route colours come from the theme tokens at draw time, so the casing that
 * separates the line from the tiles is dark on the light map and light on the
 * dark one. The fallbacks are the light-theme token values.
 */
function routeStyles() {
  return {
    /** The rider app draws its road route in this same yellow. */
    casing: {
      color: readToken("--color-text-primary", "#1a1a1a"),
      weight: 8,
      opacity: 0.9,
      lineJoin: "round",
      lineCap: "round",
    },
    line: {
      color: readToken("--color-action-yellow", "#ffde58"),
      weight: 4,
      opacity: 1,
      lineJoin: "round",
      lineCap: "round",
    },
    /** Fallback: direct line, dashed so nobody mistakes it for a road. */
    direct: {
      color: readToken("--color-text-muted", "#7a7a7a"),
      weight: 3,
      opacity: 0.9,
      dashArray: "6 8",
      lineJoin: "round",
      lineCap: "round",
    },
  } as const;
}

function readToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name);
  return value.trim() || fallback;
}

function isDarkTheme(): boolean {
  return resolveTheme() === "dark";
}

/** Follows the portal theme: the header toggle's class, else the device preference. */
function useDarkTheme(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const update = () => setDark(isDarkTheme());
    update();
    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    media?.addEventListener("change", update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      media?.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);
  return dark;
}

type Props = {
  riders: RiderLocation[];
  routes: RiderRoutes;
  /** Pan to this rider and open their pin. Changes are honoured once each. */
  focusRiderId: string | null;
  nowMs: number;
};

type TripLayers = {
  rider: LeafletMarker;
  iconKey: string;
  pickup: LeafletMarker | null;
  dropoff: LeafletMarker | null;
  casing: LeafletPolyline | null;
  line: LeafletPolyline | null;
  routeKey: string;
};

/**
 * Live map of riders on active trips: each pin is the vehicle the rider
 * drives, the trip's pickup and drop-off are marked, and the road route from
 * the rider to the drop-off is drawn. The basemap follows the portal theme.
 *
 * Layers are diffed by rider id so a location update never resets the camera
 * or closes an open popup; the viewport is fitted once, on first data.
 */
export function RiderMap({ riders, routes, focusRiderId, nowMs }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [instance, setInstance] = useState<{ map: LeafletMap; L: LeafletLike } | null>(
    null,
  );
  const tripsRef = useRef(new Map<string, TripLayers>());
  const fittedRef = useRef(false);
  const focusedRef = useRef<string | null>(null);
  const dark = useDarkTheme();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let map: LeafletMap | null = null;
    const trips = tripsRef.current;

    function ensureLeaflet(): Promise<LeafletLike> {
      const existing = (window as unknown as { L?: LeafletLike }).L;
      if (existing) return Promise.resolve(existing);
      if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = LEAFLET_CSS;
        document.head.appendChild(css);
      }
      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = LEAFLET_JS;
        script.async = true;
        script.onload = () => {
          const L = (window as unknown as { L?: LeafletLike }).L;
          if (!L) reject(new Error("Leaflet failed to load"));
          else resolve(L);
        };
        script.onerror = () => reject(new Error("Leaflet failed to load"));
        document.body.appendChild(script);
      });
    }

    void ensureLeaflet()
      .then((L) => {
        if (cancelled || !hostRef.current) return;
        map = L.map(host).setView([DAVAO.lat, DAVAO.lng], 12);
        setInstance({ map, L });
      })
      .catch(() => {
        /* Map tiles are optional; the roster below still works. */
      });

    return () => {
      cancelled = true;
      map?.remove();
      trips.clear();
      fittedRef.current = false;
      focusedRef.current = null;
    };
  }, []);

  // Basemap.
  useEffect(() => {
    if (!instance) return;
    const tiles = instance.L.tileLayer(TILE_URL, TILE_OPTIONS).addTo(instance.map);
    return () => tiles.remove();
  }, [instance]);

  // Riders, pickups and drop-offs.
  useEffect(() => {
    if (!instance) return;
    const { map, L } = instance;
    const trips = tripsRef.current;
    const activeIds = new Set(riders.map((rider) => rider.riderId));
    for (const [id, trip] of trips) {
      if (!activeIds.has(id)) {
        removeTrip(trip);
        trips.delete(id);
      }
    }
    const points = riders.map((rider) => {
      const point: [number, number] = [rider.lat, rider.lng];
      const freshness = presentLocation(
        {
          id: rider.riderId,
          orderId: rider.orderId,
          riderId: rider.riderId,
          lat: rider.lat,
          lng: rider.lng,
          accuracy: rider.accuracy,
          at: rider.at,
        },
        rider.state,
        nowMs,
      ).freshness;
      const iconKey = `${rider.vehicleType ?? "unknown"}|${freshness}`;
      const html = popupHtml(rider, freshness, routes[rider.riderId]);
      const existing = trips.get(rider.riderId);
      if (existing) {
        existing.rider.setLatLng(point);
        existing.rider.setPopupContent(html);
        if (existing.iconKey !== iconKey) {
          existing.rider.setIcon(riderIcon(L, rider, freshness));
          existing.iconKey = iconKey;
        }
        existing.pickup = syncEndpoint(L, map, existing.pickup, rider.pickup, "pickup");
        existing.dropoff = syncEndpoint(
          L,
          map,
          existing.dropoff,
          rider.dropoff,
          "dropoff",
        );
      } else {
        const marker = L.marker(point, {
          icon: riderIcon(L, rider, freshness),
          zIndexOffset: 1000,
          alt: `${rider.name}, ${vehicleSummary(rider.vehicleType, rider.plateNumber)}`,
        }).addTo(map);
        marker.bindPopup(html);
        trips.set(rider.riderId, {
          rider: marker,
          iconKey,
          pickup: syncEndpoint(L, map, null, rider.pickup, "pickup"),
          dropoff: syncEndpoint(L, map, null, rider.dropoff, "dropoff"),
          casing: null,
          line: null,
          routeKey: "",
        });
      }
      return point;
    });
    if (!fittedRef.current && points.length) {
      if (points.length === 1) map.setView(points[0], 14);
      else map.fitBounds(points, { padding: [32, 32] });
      fittedRef.current = true;
    }
  }, [instance, riders, routes, nowMs]);

  // Road routes, redrawn when the route or the theme changes.
  useEffect(() => {
    if (!instance) return;
    const { map, L } = instance;
    const styles = routeStyles();
    for (const [id, trip] of tripsRef.current) {
      const route = routes[id];
      const routeKey =
        route && route.coordinates.length >= 2
          ? `${dark ? "dark" : "light"}:${route.routed ? "road" : "direct"}:${route.coordinates.length}:${route.coordinates[0]!.join(",")}`
          : "";
      if (trip.routeKey === routeKey) continue;
      trip.casing?.remove();
      trip.line?.remove();
      trip.casing = null;
      trip.line = null;
      trip.routeKey = routeKey;
      if (!route || !routeKey) continue;
      // GeoJSON is [lon, lat]; Leaflet wants [lat, lon].
      const latlngs = route.coordinates.map(([lng, lat]): [number, number] => [lat, lng]);
      if (route.routed) trip.casing = L.polyline(latlngs, styles.casing).addTo(map);
      trip.line = L.polyline(latlngs, route.routed ? styles.line : styles.direct).addTo(
        map,
      );
    }
  }, [instance, routes, riders, dark]);

  // Focus: pan to a rider once per request, when their pin exists.
  useEffect(() => {
    if (!instance || !focusRiderId || focusedRef.current === focusRiderId) return;
    const trip = tripsRef.current.get(focusRiderId);
    const rider = riders.find((candidate) => candidate.riderId === focusRiderId);
    if (!trip || !rider) return;
    instance.map.setView([rider.lat, rider.lng], 15);
    trip.rider.openPopup();
    focusedRef.current = focusRiderId;
  }, [instance, focusRiderId, riders]);

  return (
    // The wrapper carries the theme class; Leaflet owns the host's class list.
    <div className={dark ? "gg-map gg-map--dark" : "gg-map"}>
      <div
        ref={hostRef}
        className="gg-card h-[min(70vh,560px)] w-full overflow-hidden p-0"
        role="img"
        aria-label="Map of riders currently sharing location, with each trip's pickup, drop-off and road route"
      />
    </div>
  );
}

function removeTrip(trip: TripLayers) {
  trip.rider.remove();
  trip.pickup?.remove();
  trip.dropoff?.remove();
  trip.casing?.remove();
  trip.line?.remove();
}

function riderIcon(L: LeafletLike, rider: RiderLocation, freshness: LocationFreshness) {
  const stale = freshness !== "live";
  return L.divIcon({
    className: "gg-pin-host",
    html: `<div class="gg-rider-pin${stale ? " gg-rider-pin--stale" : ""}">${vehicleGlyphSvg(rider.vehicleType, 22)}</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22],
  });
}

function endpointIcon(L: LeafletLike, kind: "pickup" | "dropoff") {
  const size = kind === "pickup" ? 14 : 18;
  return L.divIcon({
    className: "gg-pin-host",
    html: `<div class="gg-trip-pin gg-trip-pin--${kind}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 2],
  });
}

function syncEndpoint(
  L: LeafletLike,
  map: LeafletMap,
  marker: LeafletMarker | null,
  point: MapPoint | null,
  kind: "pickup" | "dropoff",
): LeafletMarker | null {
  if (!point) {
    marker?.remove();
    return null;
  }
  const latlng: [number, number] = [point.lat, point.lng];
  const title = kind === "pickup" ? "Pickup" : "Drop-off";
  const html = `<strong>${title}</strong><br/>${escapeHtml(point.label || "")}`;
  if (marker) {
    marker.setLatLng(latlng);
    marker.setPopupContent(html);
    return marker;
  }
  const created = L.marker(latlng, {
    icon: endpointIcon(L, kind),
    alt: `${title}: ${point.label || "location"}`,
  }).addTo(map);
  created.bindPopup(html);
  return created;
}

function popupHtml(
  rider: RiderLocation,
  freshness: LocationFreshness,
  route: RiderRoutes[string],
): string {
  const status = presentOrderState(rider.state).label;
  const order = rider.orderTitle
    ? `${rider.orderTitle} · Order ${rider.orderId}`
    : `Order ${rider.orderId}`;
  const ping = `Last ping ${formatDateTime(rider.at)}${freshness === "stale" ? " · stale" : ""}`;
  return [
    `<strong>${escapeHtml(rider.name)}</strong>`,
    escapeHtml(vehicleSummary(rider.vehicleType, rider.plateNumber)),
    `${escapeHtml(order)} · ${escapeHtml(status)}`,
    escapeHtml(routeSummaryLabel(route)),
    escapeHtml(ping),
  ].join("<br/>");
}

type LeafletMap = {
  setView: (latlng: [number, number], zoom: number) => LeafletMap;
  fitBounds: (points: [number, number][], opts: { padding: [number, number] }) => void;
  remove: () => void;
};

type LeafletIcon = object;

type LeafletMarker = {
  addTo: (map: LeafletMap) => LeafletMarker;
  bindPopup: (html: string) => void;
  setPopupContent: (html: string) => void;
  setLatLng: (latlng: [number, number]) => void;
  setIcon: (icon: LeafletIcon) => void;
  openPopup: () => void;
  remove: () => void;
};

type LeafletPolyline = {
  addTo: (map: LeafletMap) => LeafletPolyline;
  remove: () => void;
};

type LeafletTileLayer = {
  addTo: (map: LeafletMap) => LeafletTileLayer;
  remove: () => void;
};

type LeafletLike = {
  map: (el: HTMLElement) => LeafletMap;
  tileLayer: (
    url: string,
    opts: { attribution: string; maxZoom: number },
  ) => LeafletTileLayer;
  marker: (
    latlng: [number, number],
    opts: { icon: LeafletIcon; zIndexOffset?: number; alt?: string },
  ) => LeafletMarker;
  divIcon: (opts: {
    className: string;
    html: string;
    iconSize: [number, number];
    iconAnchor: [number, number];
    popupAnchor: [number, number];
  }) => LeafletIcon;
  polyline: (
    latlngs: [number, number][],
    opts: {
      color: string;
      weight: number;
      opacity: number;
      dashArray?: string;
      lineJoin: string;
      lineCap: string;
    },
  ) => LeafletPolyline;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
