"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, LocateFixed } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  ensureLeaflet,
  TILE_OPTIONS,
  TILE_URL,
  useDarkTheme,
  type LeafletLike,
  type LeafletMap,
} from "@/components/maps/leaflet";
import { Button } from "@/components/ui/button";
import { DAVAO_CENTRE, isPlaced, nudgePin, pointInDavao } from "@/lib/guided-signup";

type Point = { lat: number; lng: number };

/** The few Leaflet calls a movable pin needs beyond the portal's shared typings. */
type ClickEvent = { latlng: { lat: number; lng: number } };
type PickMap = LeafletMap & {
  on: (event: "click", handler: (event: ClickEvent) => void) => void;
  getZoom: () => number;
};
type PickMarker = {
  addTo: (map: LeafletMap) => PickMarker;
  setLatLng: (latlng: [number, number]) => void;
  getLatLng: () => { lat: number; lng: number };
  on: (event: "dragend", handler: () => void) => void;
  remove: () => void;
};

const PIN_HTML = '<div class="gg-pin-mark gg-pin-mark--final"></div>';

/**
 * Where the shop prints from, on a map (the shop app's ShopLocationPicker,
 * drawn for a mouse). Click the map to drop the pin, drag it onto the door,
 * or nudge it three metres at a time with the arrows, which also make the
 * pin movable from the keyboard. "Use my location" asks the browser once.
 *
 * Nothing invents a point: until the shop places one, there is no pin.
 */
export function PinPicker({ pin, onChange }: { pin: Point | null; onChange: (pin: Point) => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [instance, setInstance] = useState<{ map: PickMap; L: LeafletLike } | null>(null);
  const markerRef = useRef<PickMarker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [mapFailed, setMapFailed] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateProblem, setLocateProblem] = useState<string | null>(null);
  const dark = useDarkTheme();
  const placed = pin && isPlaced(pin) ? pin : null;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let map: PickMap | null = null;
    void ensureLeaflet()
      .then((L) => {
        if (cancelled || !hostRef.current) return;
        map = L.map(host).setView(placed ? [placed.lat, placed.lng] : DAVAO_CENTRE, placed ? 17 : 13) as PickMap;
        L.tileLayer(TILE_URL, TILE_OPTIONS).addTo(map);
        map.on("click", (event) => onChangeRef.current({ lat: event.latlng.lat, lng: event.latlng.lng }));
        setInstance({ map, L });
      })
      .catch(() => setMapFailed(true));
    return () => {
      cancelled = true;
      markerRef.current = null;
      map?.remove();
    };
    // The map is made once; the pin follows below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!instance) return;
    const { map, L } = instance;
    if (!placed) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const marker = (L.marker([placed.lat, placed.lng], {
        icon: L.divIcon({
          className: "gg-pin-host",
          html: PIN_HTML,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
          popupAnchor: [0, -12],
        }),
        alt: "Your shop",
        ...({ draggable: true } as object),
      }) as unknown as PickMarker).addTo(map);
      marker.on("dragend", () => {
        const at = marker.getLatLng();
        onChangeRef.current({ lat: at.lat, lng: at.lng });
      });
      markerRef.current = marker;
      if (map.getZoom() < 16) map.setView([placed.lat, placed.lng], 17);
    } else {
      markerRef.current.setLatLng([placed.lat, placed.lng]);
    }
  }, [instance, placed]);

  function useMyLocation() {
    setLocateProblem(null);
    if (!navigator.geolocation) {
      setLocateProblem("This browser cannot share its location. Click your shop on the map instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const next = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (!pointInDavao(next.lat, next.lng)) {
          setLocateProblem("Your computer says it is outside Davao City. Click your shop on the map instead.");
          return;
        }
        onChange(next);
        instance?.map.setView([next.lat, next.lng], 18);
      },
      () => {
        setLocating(false);
        setLocateProblem("The browser did not share a location. Click your shop on the map instead.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function nudge(direction: "north" | "south" | "east" | "west") {
    if (!placed) return;
    onChange(nudgePin(placed, direction));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={dark ? "gg-map gg-map--dark" : "gg-map"}>
        <div
          ref={hostRef}
          className="gg-card h-80 w-full cursor-crosshair overflow-hidden p-0"
          role="application"
          aria-label="Map. Click where your shop stands to place the pin."
          data-testid="pin-map"
        />
      </div>
      {mapFailed ? (
        <p className="text-body m-0 text-error" role="alert">
          The map did not load. Use my location, or try again with a better connection.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={useMyLocation} disabled={locating}>
          <LocateFixed aria-hidden />
          {locating ? "Finding you…" : "Use my location"}
        </Button>
        {placed ? (
          <div className="flex items-center gap-1" role="group" aria-label="Move the pin 3 metres">
            <Button variant="ghost" size="icon" aria-label="Move pin north" onClick={() => nudge("north")}>
              <ArrowUp />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Move pin south" onClick={() => nudge("south")}>
              <ArrowDown />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Move pin west" onClick={() => nudge("west")}>
              <ArrowLeft />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Move pin east" onClick={() => nudge("east")}>
              <ArrowRight />
            </Button>
          </div>
        ) : null}
        <span className="text-caption tabular-nums text-text-muted" data-testid="pin-coordinates">
          {placed ? `${placed.lat.toFixed(6)}, ${placed.lng.toFixed(6)}` : "No pin yet"}
        </span>
      </div>
      {locateProblem ? (
        <p className="text-caption m-0 text-error" role="alert">
          {locateProblem}
        </p>
      ) : null}
    </div>
  );
}
