"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, getSettings, listRiderLocations } from "@/lib/api/client";
import type { RiderLocation } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  presentRiderLocation,
  trackingSettingsOf,
  type RiderLocationView,
  type TrackingSettings,
} from "@/lib/rider-tracking";

/** Ages on screen count on between reads; a few seconds is fine-grained enough. */
export const AGE_TICK_MS = 5_000;

export type RiderLocations = {
  riders: RiderLocation[] | null;
  error: string | null;
  loading: boolean;
  tracking: TrackingSettings;
  /** The device clock at render, for counting ages on. */
  nowMs: number;
  view: (row: RiderLocation) => RiderLocationView;
  reload: () => Promise<void>;
};

/**
 * Every rider on an active trip, re-read at the refresh interval Super Admin
 * set (no push arrives for a GPS fix), plus the stale threshold in force.
 * Polling pauses while the tab is hidden and catches up when it is shown.
 */
export function useRiderLocations(): RiderLocations {
  const [riders, setRiders] = useState<RiderLocation[] | null>(null);
  const [fetchedAtMs, setFetchedAtMs] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState<TrackingSettings>(() => trackingSettingsOf(null));
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadSettings = useCallback(async () => {
    // Best effort: without settings the API defaults apply.
    try {
      setTracking(trackingSettingsOf(await getSettings()));
    } catch {
      /* keep the last known values */
    }
  }, []);

  const reload = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      try {
        const next = await listRiderLocations();
        const at = Date.now();
        setRiders(next);
        setFetchedAtMs(at);
        setNowMs(at);
        setError(null);
      } catch (err) {
        // A failed re-read keeps the last answer on screen and says so.
        setError(
          err instanceof ApiError
            ? `Could not load rider locations (${err.code}).`
            : "Could not reach the API. Check it is running, then retry.",
        );
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useEffect(() => {
    void loadSettings();
    void reload();
  }, [loadSettings, reload]);

  useLiveReload("settings", loadSettings);
  useLiveReload(["location", "dispatch"], reload);

  const intervalMs = tracking.refreshIntervalSeconds * 1000;
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void reload();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, reload]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), AGE_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const view = useCallback(
    (row: RiderLocation) =>
      presentRiderLocation(row, tracking.staleAfterSeconds, fetchedAtMs, nowMs),
    [tracking.staleAfterSeconds, fetchedAtMs, nowMs],
  );

  return useMemo(
    () => ({ riders, error, loading, tracking, nowMs, view, reload }),
    [riders, error, loading, tracking, nowMs, view, reload],
  );
}
