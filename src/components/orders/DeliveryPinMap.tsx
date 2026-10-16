"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  ensureLeaflet,
  escapeHtml,
  readToken,
  TILE_OPTIONS,
  TILE_URL,
  useDarkTheme,
  type LeafletLike,
  type LeafletMap,
  type LeafletMarker,
  type LeafletPolyline,
} from "@/components/maps/leaflet";
import { coordinatesLine, type PinMapPoint } from "@/lib/delivery-pin";
import { cn } from "@/lib/utils";

const GLYPH_SIZE: Record<PinMapPoint["kind"], number> = {
  shop: 14,
  original: 18,
  final: 20,
  proposed: 20,
};

/**
 * Where this order goes, on one small map: the shop, the checkout pin and,
 * once the client used their one change, where the pin moved to.
 *
 * The move is the only line on the map, dashed from the old pin to the new
 * one, so whether the destination changed reads at a glance. The checkout pin
 * is a hollow ring once it is no longer in use; a proposed pin that is not
 * saved yet is a dashed ring, never the solid pin the rider follows.
 *
 * The list under the map says the same in words, with coordinates, so nothing
 * depends on seeing the map or on the tiles loading.
 */
export function DeliveryPinMap({ points }: { points: PinMapPoint[] }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [instance, setInstance] = useState<{ map: LeafletMap; L: LeafletLike } | null>(
    null,
  );
  const dark = useDarkTheme();
  const key = useMemo(
    () =>
      points.map((entry) => `${entry.kind}:${entry.point.lat},${entry.point.lng}`).join("|"),
    [points],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let map: LeafletMap | null = null;
    void ensureLeaflet()
      .then((L) => {
        if (cancelled || !hostRef.current) return;
        map = L.map(host).setView([7.0731, 125.6128], 13);
        setInstance({ map, L });
      })
      .catch(() => {
        /* Tiles are optional: the list below carries every point. */
      });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, []);

  useEffect(() => {
    if (!instance) return;
    const tiles = instance.L.tileLayer(TILE_URL, TILE_OPTIONS).addTo(instance.map);
    return () => tiles.remove();
  }, [instance]);

  // The pins and the move between them. Redrawn when a point or the theme
  // changes; the camera is fitted to the points each time they change.
  useEffect(() => {
    if (!instance || points.length === 0) return;
    const { map, L } = instance;
    const markers: LeafletMarker[] = [];
    const lines: LeafletPolyline[] = [];
    for (const entry of points) {
      const size = GLYPH_SIZE[entry.kind];
      const marker = L.marker([entry.point.lat, entry.point.lng], {
        icon: L.divIcon({
          className: "gg-pin-host",
          html: `<div class="gg-pin-mark gg-pin-mark--${entry.kind}"></div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          popupAnchor: [0, -size / 2 - 2],
        }),
        zIndexOffset: entry.kind === "final" ? 500 : 0,
        alt: `${entry.label}: ${entry.point.label || "location"}`,
      }).addTo(map);
      marker.bindPopup(
        `<strong>${escapeHtml(entry.label)}</strong><br/>${escapeHtml(entry.point.label || "")}`,
      );
      markers.push(marker);
    }
    const from = points.find((entry) => entry.kind === "original")
      ?? (points.some((entry) => entry.kind === "proposed")
        ? points.find((entry) => entry.kind === "final")
        : undefined);
    const to = points.find((entry) => entry.kind === "proposed")
      ?? points.find((entry) => entry.kind === "final");
    if (from && to && from !== to) {
      lines.push(
        L.polyline(
          [
            [from.point.lat, from.point.lng],
            [to.point.lat, to.point.lng],
          ],
          {
            color: readToken("--color-text-primary", "#1a1a1a"),
            weight: 2,
            opacity: 0.8,
            dashArray: "4 6",
            lineJoin: "round",
            lineCap: "round",
          },
        ).addTo(map),
      );
    }
    const latlngs = points.map((entry): [number, number] => [entry.point.lat, entry.point.lng]);
    if (latlngs.length === 1) map.setView(latlngs[0]!, 15);
    else map.fitBounds(latlngs, { padding: [28, 28] });
    return () => {
      for (const marker of markers) marker.remove();
      for (const line of lines) line.remove();
    };
    // `key` stands for `points`: a live refresh with the same pins draws nothing new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance, key, dark]);

  return (
    <figure className="m-0 flex flex-col gap-2">
      <div className={dark ? "gg-map gg-map--dark" : "gg-map"}>
        <div
          ref={hostRef}
          className="gg-card h-60 w-full overflow-hidden p-0"
          role="img"
          aria-label={`Map of ${points.map((entry) => entry.label.toLowerCase()).join(", ")}`}
        />
      </div>
      <figcaption>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {points.map((entry) => (
            <li key={entry.kind} className="flex items-start gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden>
                <span className={cn("gg-pin-mark", `gg-pin-mark--${entry.kind}`)} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-caption text-text-muted">{entry.label}</span>
                <span className="text-body text-text-primary break-words">
                  {entry.point.label || "No address label"}
                </span>
                <span className="text-caption text-text-muted tabular-nums">
                  {coordinatesLine(entry.point)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
