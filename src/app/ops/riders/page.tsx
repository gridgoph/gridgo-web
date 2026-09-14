"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/button";
import { ApiError, listRiderLocations } from "@/lib/api/client";
import type { RiderLocation } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { formatDateTime } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";

const DAVAO = { lat: 7.0731, lng: 125.6128 };
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

/**
 * Live map of riders who are currently sharing a location on an active trip.
 *
 * Pings only exist while a job is picked up or out for delivery — a rider
 * sitting idle does not appear. OpenStreetMap tiles match the rest of GRIDGO.
 */
export default function OpsRiderMapPage() {
  const [riders, setRiders] = useState<RiderLocation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRiders(await listRiderLocations());
    } catch (err) {
      setRiders(null);
      setError(
        err instanceof ApiError
          ? `Could not load rider locations (${err.code}).`
          : "Could not reach the API. Check it is running, then retry.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveReload("location", load);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h2 text-text-primary m-0">Rider locations</h1>
          <p className="text-body text-text-secondary m-0 mt-1">
            Riders appear here only while they are sharing location on a live trip.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error ? (
        <ErrorState
          body={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      ) : null}

      <RiderMap riders={riders ?? []} />

      {riders && riders.length === 0 && !loading && !error ? (
        <EmptyState
          title="No riders sharing location"
          body="A pin appears when a rider is on a pickup or delivery and the phone is sending its position."
        />
      ) : null}

      {riders && riders.length > 0 ? (
        <ul className="gg-card divide-y divide-[var(--color-outline-subtle)] p-0 m-0 list-none">
          {riders.map((rider) => {
            const status = presentOrderState(rider.state);
            return (
              <li key={rider.riderId} className="px-4 py-3">
                <p
                  className="text-body text-text-primary m-0"
                  style={{ fontFamily: "var(--font-medium)" }}
                >
                  {rider.name}
                </p>
                <p className="text-caption text-text-muted m-0 mt-0.5">
                  {status.label} · Order {rider.orderId}
                  {rider.orderTitle ? ` · ${rider.orderTitle}` : ""}
                </p>
                <p className="text-caption text-text-muted m-0 mt-0.5">
                  Last ping {formatDateTime(rider.at)}
                </p>
                <Link
                  href={`/ops/orders/${rider.orderId}`}
                  className="text-caption text-text-secondary mt-1 inline-block hover:text-text-primary"
                >
                  Open order
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function RiderMap({ riders }: { riders: RiderLocation[] }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;

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
        mapRef.current?.remove();
        const map = L.map(hostRef.current).setView([DAVAO.lat, DAVAO.lng], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap",
        }).addTo(map);
        const points = riders.map((rider) => {
          const marker = L.marker([rider.lat, rider.lng]).addTo(map);
          marker.bindPopup(
            `<strong>${escapeHtml(rider.name)}</strong><br/>Order ${escapeHtml(rider.orderId)}<br/>${escapeHtml(presentOrderState(rider.state).label)}`,
          );
          return [rider.lat, rider.lng] as [number, number];
        });
        if (points.length === 1) map.setView(points[0], 14);
        else if (points.length > 1) map.fitBounds(points, { padding: [32, 32] });
        mapRef.current = map;
      })
      .catch(() => {
        /* Map tiles are optional; the list below still works. */
      });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [riders]);

  return (
    <div
      ref={hostRef}
      className="gg-card h-[min(70vh,560px)] w-full overflow-hidden"
      role="img"
      aria-label="Map of riders currently sharing location"
    />
  );
}

type LeafletMap = {
  setView: (latlng: [number, number], zoom: number) => LeafletMap;
  fitBounds: (points: [number, number][], opts: { padding: [number, number] }) => void;
  remove: () => void;
};

type LeafletLike = {
  map: (el: HTMLElement) => LeafletMap;
  tileLayer: (
    url: string,
    opts: { attribution: string },
  ) => { addTo: (map: LeafletMap) => void };
  marker: (latlng: [number, number]) => {
    addTo: (map: LeafletMap) => { bindPopup: (html: string) => void };
  };
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
