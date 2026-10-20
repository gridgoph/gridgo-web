import type { Order } from "@/lib/api/types";

/**
 * The shop's hour to answer a new job (gridgo-api `docs/SHOP_RECOVERY_API.md`).
 *
 * GRIDGO gives an assigned shop sixty minutes of its opening time. `deadlineAt`
 * is that moment already walked through closed hours, so it is the one figure
 * this module trusts. A window that reaches past closing is `spans_closed`:
 * the hour pauses while the shop is shut, and a wall-clock countdown would
 * race through the night. The screen then says when the hour runs out.
 */

export type AcceptWindowOrder = Pick<Order, "state"> &
  Partial<Pick<Order, "shopAcceptance" | "shopRecovery">>;

export type AcceptWindow =
  | { kind: "none" }
  | {
      kind: "running";
      deadlineAt: Date;
      remainingMs: number;
      /** Share of the hour already gone, 0–1. */
      elapsed: number;
      /** Ten minutes or less to go. */
      closing: boolean;
    }
  | { kind: "spans_closed"; deadlineAt: Date }
  | { kind: "expired"; deadlineAt: Date };

const MINUTE_MS = 60_000;
const SPAN_TOLERANCE_MS = MINUTE_MS;
const CLOSING_MS = 10 * MINUTE_MS;

function time(value: string | null | undefined): number | null {
  if (!value) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
}

function dayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

function formatWhen(date: Date): string {
  return date.toLocaleString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Where this job's answer window stands, or `none` when it has no clock. */
export function acceptWindow(order: AcceptWindowOrder, now: Date = new Date()): AcceptWindow {
  const window = order.shopAcceptance;
  if (order.state !== "supplier_assigned" || order.shopRecovery || window?.status !== "pending") {
    return { kind: "none" };
  }
  const deadline = time(window.deadlineAt);
  const assigned = time(window.assignedAt);
  if (deadline == null) return { kind: "none" };
  const deadlineAt = new Date(deadline);
  const remainingMs = deadline - now.getTime();
  if (remainingMs <= 0) return { kind: "expired", deadlineAt };

  const workingMs = (window.workingMinutes > 0 ? window.workingMinutes : 60) * MINUTE_MS;
  const spanMs = assigned == null ? workingMs : deadline - assigned;
  if (spanMs > workingMs + SPAN_TOLERANCE_MS) return { kind: "spans_closed", deadlineAt };

  return {
    kind: "running",
    deadlineAt,
    remainingMs,
    elapsed: Math.min(1, Math.max(0, 1 - remainingMs / workingMs)),
    closing: remainingMs <= CLOSING_MS,
  };
}

/** "42:07" — minutes and seconds. Only honest while the hour is running. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** "8:50 AM", "8:50 AM tomorrow", or the full date when further out. */
export function answerByTime(deadlineAt: Date, now: Date = new Date()): string {
  const today = dayKey(now);
  const tomorrow = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const day = dayKey(deadlineAt);
  if (day === today) return formatTime(deadlineAt);
  if (day === tomorrow) return `${formatTime(deadlineAt)} tomorrow`;
  return formatWhen(deadlineAt);
}

/** One line for a job card. Null when the job has no answer clock. */
export function acceptWindowLine(window: AcceptWindow, now: Date = new Date()): string | null {
  switch (window.kind) {
    case "running": {
      const minutes = Math.ceil(window.remainingMs / MINUTE_MS);
      return minutes <= 1 ? "Under a minute left to answer" : `${minutes} min left to answer`;
    }
    case "spans_closed":
      return `Answer by ${answerByTime(window.deadlineAt, now)}`;
    case "expired":
      return "Time to answer has run out";
    default:
      return null;
  }
}

/**
 * How often a running hour should redraw. A window that pauses across closed
 * hours has no countdown, so it does not tick: the caller waits until
 * `deadlineAt` instead.
 */
export function acceptWindowTickMs(window: AcceptWindow): number | null {
  if (window.kind === "running") return 1000;
  return null;
}

/** Milliseconds until the soonest open answer deadline, or null when none is running. */
export function soonestAcceptDeadlineMs(
  orders: readonly AcceptWindowOrder[],
  now: Date = new Date(),
): number | null {
  let soonest: number | null = null;
  for (const order of orders) {
    const window = acceptWindow(order, now);
    if (window.kind !== "running" && window.kind !== "spans_closed") continue;
    const wait = window.deadlineAt.getTime() - now.getTime();
    if (wait <= 0) continue;
    soonest = soonest == null ? wait : Math.min(soonest, wait);
  }
  return soonest;
}
