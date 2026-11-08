"use client";

/**
 * What the orders queue and the rail's Orders count read beside the orders:
 * GRIDGO's hours, the API's dispatch offers, and one shared minute clock.
 *
 * Both mount this hook, so a minute passes for both at once. A clock tick
 * recomputes from what is already loaded. Only when the tick crosses one of
 * GRIDGO's opening or closing times is `GET /dispatch/offers` read again,
 * because that is when the API's answer about hours changes. The orders list
 * itself is never refetched for the clock.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { QueueContext } from "@/app/ops/_lib/pipeline";
import { getSettings, listDispatchOffers } from "@/lib/api/client";
import type { OperatingHours } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { isOpenAt } from "@/lib/operating-hours";

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

const EMPTY: QueueContext = {};

/**
 * The queue context, or `{}` while disabled (a rail with no Orders count).
 * A failed read leaves that part unknown, which the classifier treats as
 * "the API decides": nothing is hidden on a guess.
 */
export function useQueueContext(enabled = true): QueueContext {
  const [hours, setHours] = useState<OperatingHours | null>(null);
  const [offers, setOffers] = useState<Offers>({ ids: null, readAt: 0 });

  const loadHours = useSerializedLoad(
    useCallback(async () => {
      if (!enabled) return;
      try {
        setHours((await getSettings()).operatingHours ?? null);
      } catch {
        // Keep whatever was read last.
      }
    }, [enabled]),
  );
  const loadOffers = useSerializedLoad(
    useCallback(async () => {
      if (!enabled) return;
      const readAt = Date.now();
      try {
        const list = await listDispatchOffers();
        setOffers({ ids: new Set(list.map((order) => order.id)), readAt });
      } catch {
        setOffers({ ids: null, readAt });
      }
    }, [enabled]),
  );

  useEffect(() => {
    void loadHours();
    void loadOffers();
  }, [loadHours, loadOffers]);
  useLiveReload("settings", loadHours);
  // An order moving, a hold lifting or a rider taking a job changes offers.
  useLiveReload(["orders", "settings"], loadOffers);

  const now = useMinuteClock();
  useEffect(() => {
    if (!enabled || !hours || offers.readAt === 0) return;
    const schedule = hours.schedule;
    if (isOpenAt(schedule, offers.readAt) !== isOpenAt(schedule, now)) {
      void loadOffers();
    }
  }, [enabled, hours, offers.readAt, now, loadOffers]);

  return useMemo<QueueContext>(
    () => (enabled ? { hours, nowMs: now, dispatchable: offers.ids } : EMPTY),
    [enabled, hours, now, offers.ids],
  );
}
