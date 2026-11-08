"use client";

/**
 * What the orders queue and the rail's Orders count read beside the orders:
 * GRIDGO's hours, the API's dispatch offers, and one shared minute clock.
 *
 * Both mount this hook, so a minute passes for both at once. Each tick
 * recomputes from the orders already loaded and re-reads only
 * `GET /dispatch/offers`, once per tick for every mounted reader: a shop's own
 * opening or closing inside GRIDGO's hours changes the API's answer without
 * any order changing, and the portal does not know those times. The orders
 * list itself is never refetched for the clock.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { QueueContext } from "@/app/ops/_lib/pipeline";
import { getSettings, listDispatchOffers } from "@/lib/api/client";
import type { OperatingHours, Order } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

const MINUTE_MS = 60_000;

let clockNow = Date.now();
let clockTimer: ReturnType<typeof setTimeout> | null = null;
const clockListeners = new Set<() => void>();

function scheduleTick() {
  const wait = MINUTE_MS - (Date.now() % MINUTE_MS);
  clockTimer = setTimeout(() => {
    clockNow = Date.now();
    for (const listener of clockListeners) listener();
    scheduleTick();
  }, wait);
}

function subscribeClock(listener: () => void) {
  if (clockListeners.size === 0) {
    clockNow = Date.now();
    scheduleTick();
  }
  clockListeners.add(listener);
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockTimer !== null) {
      clearTimeout(clockTimer);
      clockTimer = null;
    }
  };
}

/** One clock for every subscriber, ticking on the minute. */
export function useMinuteClock(): number {
  return useSyncExternalStore(
    subscribeClock,
    () => clockNow,
    () => clockNow,
  );
}

type Offers = { ids: ReadonlySet<string> | null; readAt: number };

/** One offers read per clock tick, shared by the page and the rail. */
let tickRead: { tick: number; promise: Promise<Order[]> } | null = null;
function offersForTick(tick: number): Promise<Order[]> {
  if (tickRead?.tick !== tick) tickRead = { tick, promise: listDispatchOffers() };
  return tickRead.promise;
}

const EMPTY: QueueContext = {};

/**
 * The queue context, or `{}` while disabled (a rail with no Orders count).
 * A failed read leaves that part unknown, which the classifier treats as
 * "the API decides": nothing is hidden on a guess.
 */
export function useQueueContext(enabled = true): QueueContext {
  const [hours, setHours] = useState<OperatingHours | null>(null);
  const [offers, setOffers] = useState<Offers>({ ids: null, readAt: 0 });
  // A read that settles after unmount must not touch state.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadHours = useSerializedLoad(
    useCallback(async () => {
      if (!enabled) return;
      try {
        const settings = await getSettings();
        if (mounted.current) setHours(settings.operatingHours ?? null);
      } catch {
        // Keep whatever was read last.
      }
    }, [enabled]),
  );
  const loadOffers = useSerializedLoad(
    useCallback(
      async (tick?: number) => {
        if (!enabled) return;
        const readAt = Date.now();
        try {
          const list = await (tick === undefined ? listDispatchOffers() : offersForTick(tick));
          if (mounted.current) {
            setOffers({ ids: new Set(list.map((order) => order.id)), readAt });
          }
        } catch {
          if (mounted.current) setOffers({ ids: null, readAt });
        }
      },
      [enabled],
    ),
  );

  useEffect(() => {
    void loadHours();
    void loadOffers();
  }, [loadHours, loadOffers]);
  useLiveReload("settings", loadHours);
  // An order moving, a hold lifting or a rider taking a job changes offers.
  const reloadOffers = useCallback(() => loadOffers(), [loadOffers]);
  useLiveReload(["orders", "settings"], reloadOffers);

  const now = useMinuteClock();
  const firstTick = useRef(now);
  useEffect(() => {
    // The mount read above covers the first minute.
    if (!enabled || now === firstTick.current) return;
    void loadOffers(now);
  }, [enabled, now, loadOffers]);

  return useMemo<QueueContext>(
    () => (enabled ? { hours, nowMs: now, dispatchable: offers.ids } : EMPTY),
    [enabled, hours, now, offers.ids],
  );
}
