"use client";

import { useEffect, useRef, useState } from "react";

import type { RiderLocation } from "@/lib/api/types";
import {
  fetchRoute,
  haversineMetres,
  isValidLatLng,
  type LatLng,
  type RouteResult,
} from "@/lib/osrm";

/**
 * Road route per rider, keyed by rider id.
 * `undefined` = still finding it; `null` = the trip has no drop-off to route to.
 */
export type RiderRoutes = Record<string, RouteResult | null | undefined>;

/**
 * A ping lands every 15 s. Re-asking the public router for every one of them
 * would trip its rate limit for no visible gain, so a route is only refreshed
 * once the rider has clearly moved along it or the destination changed.
 */
export const REROUTE_AFTER_METRES = 40;

type Tracked = { origin: LatLng; dest: LatLng; controller: AbortController };

function sameDest(a: LatLng, b: LatLng): boolean {
  return a.lat === b.lat && a.lng === b.lng;
}

/** Keeps one live road route per rider, from their latest fix to the drop-off. */
export function useRiderRoutes(riders: RiderLocation[]): RiderRoutes {
  const [routes, setRoutes] = useState<RiderRoutes>({});
  const tracked = useRef(new Map<string, Tracked>());

  useEffect(() => {
    const trips = tracked.current;
    const active = new Set(riders.map((rider) => rider.riderId));
    let departed = false;
    for (const [id, trip] of trips) {
      if (!active.has(id)) {
        trip.controller.abort();
        trips.delete(id);
        departed = true;
      }
    }
    if (departed) {
      setRoutes((prev) => {
        const next: RiderRoutes = {};
        for (const id of Object.keys(prev)) if (active.has(id)) next[id] = prev[id];
        return next;
      });
    }

    for (const rider of riders) {
      const id = rider.riderId;
      const origin = { lat: rider.lat, lng: rider.lng };
      const dest = rider.dropoff;
      if (!isValidLatLng(dest) || !isValidLatLng(origin)) {
        trips.get(id)?.controller.abort();
        trips.delete(id);
        setRoutes((prev) => (prev[id] === null ? prev : { ...prev, [id]: null }));
        continue;
      }
      const prev = trips.get(id);
      if (
        prev &&
        sameDest(prev.dest, dest) &&
        haversineMetres(prev.origin, origin) < REROUTE_AFTER_METRES
      ) {
        continue;
      }
      prev?.controller.abort();
      const controller = new AbortController();
      trips.set(id, { origin, dest, controller });
      // Keep the previous line on the map while the fresh one is fetched.
      setRoutes((current) => (id in current ? current : { ...current, [id]: undefined }));
      void fetchRoute(origin, dest, { signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          setRoutes((current) => ({ ...current, [id]: result }));
        })
        .catch(() => {
          /* Aborted: a newer request or the view is gone. */
        });
    }
  }, [riders]);

  useEffect(() => {
    const trips = tracked.current;
    return () => {
      for (const trip of trips.values()) trip.controller.abort();
      trips.clear();
    };
  }, []);

  return routes;
}
