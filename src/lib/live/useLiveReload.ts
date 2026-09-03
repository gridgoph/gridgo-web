"use client";

import { useEffect, useRef } from "react";

import type { InvalidatePing, InvalidateResource } from "@/lib/api/types";
import { useLiveOptional } from "@/lib/live/LiveProvider";

export const LIVE_RELOAD_COALESCE_MS = 300;
const FALLBACK_POLL_MS = 30_000;

export function matchesInvalidate(
  ping: InvalidatePing,
  resources: readonly InvalidateResource[],
  matchId?: string,
): boolean {
  if (!resources.includes(ping.resource)) return false;
  if (matchId && ping.id && ping.id !== matchId) return false;
  return true;
}

/**
 * Refetch when the live stream says this resource changed.
 *
 * Detail pages pass matchId so another order's ping is ignored; a resource-wide
 * ping (no id) still reloads. Fallback polling runs only while the stream is
 * down. Existing Refresh buttons stay.
 */
export function useLiveReload(
  resource: InvalidateResource | readonly InvalidateResource[],
  load: () => void | Promise<void>,
  options?: { matchId?: string },
): void {
  const live = useLiveOptional();
  const loadRef = useRef(load);
  loadRef.current = load;
  const resources = Array.isArray(resource) ? resource : [resource];
  const resourceKey = resources.join(",");
  const matchId = options?.matchId;

  useEffect(() => {
    if (!live) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;

    const flush = () => {
      timer = null;
      if (!pending) return;
      pending = false;
      void loadRef.current();
    };

    const unsubscribe = live.subscribe((ping) => {
      if (!matchesInvalidate(ping, resources, matchId)) return;
      pending = true;
      if (!timer) timer = setTimeout(flush, LIVE_RELOAD_COALESCE_MS);
    });

    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
    // resources is derived from resourceKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, matchId, resourceKey]);

  useEffect(() => {
    if (!live || live.live) return;

    const onVis = () => {
      if (document.visibilityState === "visible") void loadRef.current();
    };
    document.addEventListener("visibilitychange", onVis);
    const interval = setInterval(() => {
      void loadRef.current();
    }, FALLBACK_POLL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(interval);
    };
  }, [live, live?.live]);
}
