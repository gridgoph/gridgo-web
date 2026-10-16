"use client";

/**
 * Leaflet, loaded once from the CDN, for every map in the portal: the live
 * rider map and the order's delivery-pin map. One loader, one basemap and one
 * theme hook, so both maps look and behave alike.
 */

import { useEffect, useState } from "react";

import { resolveTheme } from "@/lib/theme";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

/**
 * Basemap: the same OpenStreetMap tiles the rider app draws, keyless. The
 * cartography is toned to GRIDGO's greys in CSS (`.gg-map`), and inverted for
 * the dark theme (`.gg-map--dark`), so the yellow route is the only colour on
 * the map in either theme.
 */
export const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_OPTIONS = {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
} as const;

/** One load for every map on the page, so two maps mounting together share one script. */
let loading: Promise<LeafletLike> | null = null;

export function ensureLeaflet(): Promise<LeafletLike> {
  const existing = (window as unknown as { L?: LeafletLike }).L;
  if (existing) return Promise.resolve(existing);
  if (loading) return loading;
  if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = LEAFLET_CSS;
    document.head.appendChild(css);
  }
  loading = new Promise<LeafletLike>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => {
      const L = (window as unknown as { L?: LeafletLike }).L;
      if (!L) reject(new Error("Leaflet failed to load"));
      else resolve(L);
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("Leaflet failed to load"));
    };
    document.body.appendChild(script);
  }).catch((error: unknown) => {
    // A failed load is tried again by the next map, not remembered.
    loading = null;
    throw error;
  });
  return loading;
}

export function readToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name);
  return value.trim() || fallback;
}

function isDarkTheme(): boolean {
  return resolveTheme() === "dark";
}

/** Follows the portal theme: the header toggle's class, else the device preference. */
export function useDarkTheme(): boolean {
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

export type LeafletMap = {
  setView: (latlng: [number, number], zoom: number) => LeafletMap;
  fitBounds: (points: [number, number][], opts: { padding: [number, number] }) => void;
  remove: () => void;
};

export type LeafletIcon = object;

export type LeafletMarker = {
  addTo: (map: LeafletMap) => LeafletMarker;
  bindPopup: (html: string) => void;
  setPopupContent: (html: string) => void;
  setLatLng: (latlng: [number, number]) => void;
  setIcon: (icon: LeafletIcon) => void;
  openPopup: () => void;
  remove: () => void;
};

export type LeafletPolyline = {
  addTo: (map: LeafletMap) => LeafletPolyline;
  remove: () => void;
};

export type LeafletTileLayer = {
  addTo: (map: LeafletMap) => LeafletTileLayer;
  remove: () => void;
};

export type LeafletLike = {
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

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
