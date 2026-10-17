"use client";

import { useEffect, useState } from "react";

import {
  acceptWindow,
  acceptWindowTickMs,
  soonestAcceptDeadlineMs,
  type AcceptWindowOrder,
} from "@/lib/supplier-accept-window";

const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * The clock for one job's answer hour.
 *
 * A running hour redraws every second. An hour that pauses across closed
 * hours does not: it wakes once, at `deadlineAt`, so nothing counts through
 * the night.
 */
export function useAcceptClock(order: AcceptWindowOrder | null): Date {
  const [now, setNow] = useState(() => new Date());
  const deadline = order?.shopAcceptance?.deadlineAt ?? "";
  const status = order?.shopAcceptance?.status ?? "";
  const state = order?.state ?? "";
  const recovery = order?.shopRecovery?.status ?? "";

  useEffect(() => {
    if (!order) return;
    const window = acceptWindow(order);
    if (window.kind === "running" && acceptWindowTickMs(window) != null) {
      const id = setInterval(() => setNow(new Date()), 1000);
      return () => clearInterval(id);
    }
    if (window.kind === "spans_closed") {
      const wait = Math.max(0, window.deadlineAt.getTime() - Date.now());
      const id = setTimeout(() => setNow(new Date()), Math.min(wait, MAX_TIMEOUT_MS));
      return () => clearTimeout(id);
    }
    return;
  }, [order, deadline, status, state, recovery]);

  return now;
}

/**
 * Wakes once, when the soonest open answer hour on this list runs out.
 * No interval runs while a deadline sits across closed hours.
 */
export function useAcceptDeadlines(orders: readonly AcceptWindowOrder[]): Date {
  const [now, setNow] = useState(() => new Date());
  const signature = orders
    .map((order) => {
      const window = acceptWindow(order, now);
      return window.kind === "running" || window.kind === "spans_closed"
        ? window.deadlineAt.toISOString()
        : "";
    })
    .join("|");

  useEffect(() => {
    const wait = soonestAcceptDeadlineMs(orders, new Date());
    if (wait == null) return;
    const id = setTimeout(() => setNow(new Date()), Math.min(wait, MAX_TIMEOUT_MS));
    return () => clearTimeout(id);
  }, [orders, signature]);

  return now;
}
