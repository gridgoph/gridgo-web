"use client";

import { useCallback, useEffect, useRef } from "react";

import type { InvalidatePing, InvalidateResource } from "@/lib/api/types";
import { useLiveOptional } from "@/lib/live/LiveProvider";

export const LIVE_RELOAD_COALESCE_MS = 300;
const FALLBACK_POLL_MS = 30_000;

export function matchesInvalidate(
  ping: InvalidatePing,
  resources: readonly InvalidateResource[],
  matchId?: string,
): boolean {
  // Approval and membership revocations invalidate every mounted domain view.
  if (ping.resource === "identity") return true;
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
  const subscribe = live?.subscribe;
  const connected = live?.live;
  const previouslyConnected = useRef(connected);
  const loadRef = useRef(load);
  loadRef.current = load;
  const mounted = useRef(true);
  const running = useRef(false);
  const dirty = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Events, recovery and fallback share one flight and one dirty follow-up.
  const queueLoad = useCallback(() => {
    dirty.current = true;
    if (running.current) return;
    running.current = true;
    void (async () => {
      try {
        while (mounted.current && dirty.current) {
          dirty.current = false;
          try {
            await loadRef.current();
          } catch {
            /* Screen owns recovery copy. */
          }
        }
      } finally {
        running.current = false;
      }
    })();
  }, []);
  const resources = Array.isArray(resource) ? resource : [resource];
  const resourceKey = resources.join(",");
  const matchId = options?.matchId;

  useEffect(() => {
    if (!subscribe) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;

    const flush = () => {
      timer = null;
      if (!pending) return;
      pending = false;
      queueLoad();
    };

    const unsubscribe = subscribe((ping) => {
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
  }, [subscribe, matchId, resourceKey, queueLoad]);

  useEffect(() => {
    if (!subscribe) return;
    const wasConnected = previouslyConnected.current;
    previouslyConnected.current = connected;
    if (connected) {
      if (!wasConnected) queueLoad();
      return;
    }

    const onVis = () => {
      if (document.visibilityState === "visible") queueLoad();
    };
    document.addEventListener("visibilitychange", onVis);
    const interval = setInterval(() => {
      queueLoad();
    }, FALLBACK_POLL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(interval);
    };
  }, [subscribe, connected, queueLoad]);
}
