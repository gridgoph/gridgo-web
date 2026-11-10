"use client";

import { useEffect, useState } from "react";

import type { HomePromo } from "@/lib/api/home-promos";
import { nextBoundary } from "@/lib/home-promos";

/** setTimeout's ceiling; a later boundary is re-armed when this one fires. */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * The clock a Home promos screen reads status by. It moves at the next start
 * or end among `promos`, so Scheduled turns Live (and Live turns Ended) on
 * an open page, and `onReturn` runs when the tab is focused or shown again.
 */
export function usePromoClock(promos: HomePromo[], onReturn?: () => void): number {
  const [now, setNow] = useState(() => Date.now());
  const boundary = nextBoundary(promos, now);

  useEffect(() => {
    if (boundary === null) return;
    const wait = Math.min(MAX_TIMER_MS, Math.max(0, boundary - Date.now()) + 50);
    const timer = window.setTimeout(() => setNow(Date.now()), wait);
    return () => window.clearTimeout(timer);
  }, [boundary]);

  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === "hidden") return;
      setNow(Date.now());
      onReturn?.();
    };
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [onReturn]);

  return now;
}
