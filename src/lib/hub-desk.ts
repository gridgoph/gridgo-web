/**
 * The pick-up hub as Operations and Super Admin watch it (gridgoph/gridgo-api#124
 * and #125; contract gridgo-api docs/HUB_HANDOVER_API.md).
 *
 * A ready pick-up order waits at the hub until the client brings its QR and
 * matching code. Each open hub day that closes without them counts once. The
 * first missed day sends a reminder, the second a stronger warning, and on
 * the third the order comes to Operations: the client may collect or ask for
 * redelivery at their own cost. Nothing is cancelled or forfeited, and the
 * API invents no redelivery fee; Operations arranges that with the client.
 *
 * Pure: no React, no fetch.
 */

import type { HubHandout, HubStaffTotal, HubWaitingOrder } from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

/** The missed hub day on which Operations takes over. */
export const OPERATIONS_AFTER_MISSED_DAYS = 3;

export type WaitingStep = {
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
  /** What happens next, for the reader of the row. */
  next: string;
  /** Waiting on Operations right now. */
  forOperations: boolean;
};

export function waitingStep(order: HubWaitingOrder): WaitingStep {
  if (order.redeliveryRequest) {
    return {
      label: "Redelivery requested",
      tone: "warning",
      icon: "triangle-alert",
      next: "The client chose redelivery at their own cost. Agree the fee with them and arrange the delivery.",
      forOperations: true,
    };
  }
  if (order.operationsRequired || order.missedDays >= OPERATIONS_AFTER_MISSED_DAYS) {
    return {
      label: "Needs Operations",
      tone: "error",
      icon: "triangle-alert",
      next: "Three hub days missed. Contact the client: they collect, or ask for redelivery at their own cost. The order is not forfeited.",
      forOperations: true,
    };
  }
  if (order.missedDays === 2) {
    return {
      label: "Final warning sent",
      tone: "warning",
      icon: "clock",
      next: "Two hub days missed. One more and it comes to Operations.",
      forOperations: false,
    };
  }
  if (order.missedDays === 1) {
    return {
      label: "Reminder sent",
      tone: "info",
      icon: "clock",
      next: "One hub day missed. The client was reminded to bring the QR and code.",
      forOperations: false,
    };
  }
  return {
    label: "Waiting for the client",
    tone: "neutral",
    icon: "circle-dot",
    next: "Ready at the hub. The client was told to bring the QR and code during hub hours.",
    forOperations: false,
  };
}

/** Operations' work first, then the most missed days, then the longest waiting. */
export function sortWaiting(orders: readonly HubWaitingOrder[]): HubWaitingOrder[] {
  return [...orders].sort((a, b) => {
    const ops =
      Number(waitingStep(b).forOperations) - Number(waitingStep(a).forOperations);
    if (ops) return ops;
    if (b.missedDays !== a.missedDays) return b.missedDays - a.missedDays;
    return (a.readyAt ?? "").localeCompare(b.readyAt ?? "");
  });
}

/** How long a ready order has waited: "Waiting 7 hours", "Waiting 3 days". */
export function waitingFor(readyAt: string, now: number = Date.now()): string {
  const ms = now - Date.parse(readyAt);
  if (!Number.isFinite(ms) || ms < 0) return "Just ready";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "Ready under an hour";
  if (hours < 48) return `Waiting ${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `Waiting ${Math.floor(hours / 24)} days`;
}

export function missedDaysLabel(missedDays: number): string {
  if (missedDays <= 0) return "No hub day missed";
  return `${missedDays} hub ${missedDays === 1 ? "day" : "days"} missed`;
}

/** Staff by handovers, most first; ties by name. Counts cover every handout. */
export function rankStaffTotals(totals: readonly HubStaffTotal[]): HubStaffTotal[] {
  return [...totals].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Append an older page, dropping anything already shown (a retry or a live reload). */
export function mergeHandouts(
  shown: readonly HubHandout[],
  older: readonly HubHandout[],
): HubHandout[] {
  const seen = new Set(shown.map((handout) => handout.id));
  return [...shown, ...older.filter((handout) => !seen.has(handout.id))];
}
