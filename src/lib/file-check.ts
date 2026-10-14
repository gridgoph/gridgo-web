/**
 * Operations' file check (gridgo-api#122).
 *
 * Every order paid at checkout waits for a person here to open its artwork
 * before any shop hears of it. The API keeps the wait on `order.fileCheck`
 * (`requestedAt` is checkout, or the client's resubmission).
 *
 * Operating hours (OPERATING_HOURS_API.md): a new order carries `review`, and
 * the API refuses a pass or send-back while GRIDGO is closed. Its wait counts
 * open time only, so a file that arrived at night is not "overdue" at 8 AM;
 * while closed the queue shows when it will be reviewed instead. An order
 * from before operating hours has no `review` and keeps the wall-clock wait.
 *
 * Passing is the existing `needs_qa → supplier_assigned` transition; sending
 * back is `needs_qa → client_correction` with a note the client reads. An order
 * still in payment review is already waiting on its file check, but cannot be
 * passed until its payment is confirmed.
 *
 * Pure: no React, no fetch.
 */

import type {
  FileCheck,
  OperatingHours,
  Order,
  QaCheckId,
  QaChecklist,
} from "@/lib/api/types";
import {
  addOpeningMs,
  isOpenAt,
  manilaWhenFrom,
  openingMsBetween,
} from "@/lib/operating-hours";
import { stageOf } from "@/app/ops/_lib/pipeline";
import { artworkQaCheckLabel, artworkSource } from "@/lib/design-links";

/** A wait this long is worth a second look (portal choice, not an API rule). */
export const FILE_CHECK_LONG_WAIT_SECONDS = 30 * 60;
/** A wait this long means a shop has lost a working morning. */
export const FILE_CHECK_OVERDUE_SECONDS = 2 * 60 * 60;

export type WaitLevel = "fresh" | "long" | "overdue";

export function fileCheckOf(order: Pick<Order, "fileCheck">): FileCheck | null {
  const check = order.fileCheck;
  return check && typeof check === "object" && typeof check.status === "string"
    ? check
    : null;
}

/**
 * Seconds this file has been waiting, measured against the reader's clock so
 * a queue left open keeps counting. An order under operating hours counts
 * open time only when the hours are known. The API's own `waitingSeconds` is
 * used when `requestedAt` cannot be read. `null` when nothing is waiting.
 */
export function fileCheckWaitSeconds(
  order: Pick<Order, "fileCheck" | "review">,
  nowMs: number = Date.now(),
  hours?: OperatingHours | null,
): number | null {
  const check = fileCheckOf(order);
  if (!check || check.status !== "pending") return null;
  const since = Date.parse(check.requestedAt);
  if (Number.isFinite(since)) {
    if (order.review && hours) {
      return Math.floor(openingMsBetween(hours.schedule, since, nowMs) / 1000);
    }
    return Math.max(0, Math.floor((nowMs - since) / 1000));
  }
  return Number.isFinite(check.waitingSeconds) ? Math.max(0, check.waitingSeconds) : null;
}

/** When an order under operating hours can be reviewed, as the queue reads it now. */
export type ReviewSlot = {
  /** GRIDGO is closed: nobody can pass or send back this file until `scheduledAt`. */
  closed: boolean;
  scheduledAt: number | null;
  /** A closure or a settings change pushed this review later. */
  delayed: boolean;
};

/**
 * `null` for an order from before operating hours (no `review`). With the
 * hours at hand the slot follows the reader's clock; without them it is the
 * API's projection from when the order was read.
 */
export function fileCheckReviewSlot(
  order: Pick<Order, "fileCheck" | "review">,
  nowMs: number = Date.now(),
  hours?: OperatingHours | null,
): ReviewSlot | null {
  const review = order.review;
  const check = fileCheckOf(order);
  if (!review || !check || check.status !== "pending") return null;
  const delayed = review.reviewDelayed === true;
  if (hours) {
    const since = Date.parse(check.requestedAt);
    const from = Number.isFinite(since) ? Math.max(nowMs, since) : nowMs;
    return {
      closed: !isOpenAt(hours.schedule, nowMs),
      scheduledAt: addOpeningMs(hours.schedule, from, 0),
      delayed,
    };
  }
  const scheduled = Date.parse(review.scheduledReviewAt);
  return {
    closed: review.isOpenNow === false && (!Number.isFinite(scheduled) || scheduled > nowMs),
    scheduledAt: Number.isFinite(scheduled) ? scheduled : null,
    delayed,
  };
}

export function waitLevel(seconds: number): WaitLevel {
  if (seconds >= FILE_CHECK_OVERDUE_SECONDS) return "overdue";
  if (seconds >= FILE_CHECK_LONG_WAIT_SECONDS) return "long";
  return "fresh";
}

/** "Under a minute", "12 min", "2 h 5 min", "1 d 3 h". */
export function formatWait(seconds: number): string {
  if (seconds < 60) return "Under a minute";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days} d ${rest} h` : `${days} d`;
}

/** Only an order at `needs_qa` can be passed or sent back. */
export function canDecideFileCheck(order: Pick<Order, "state">): boolean {
  return order.state === "needs_qa";
}

export type FileCheckRow = {
  order: Order;
  /** `null` on an order from before the file check (no wait recorded). */
  waitSeconds: number | null;
};

export type FileCheckQueue = {
  /** Paid and waiting on Operations, oldest first. */
  ready: FileCheckRow[];
  /** Waiting on its file check, but the payment is not confirmed yet. */
  awaitingPayment: FileCheckRow[];
  /** Sent back; the client is fixing the artwork. */
  sentBack: Order[];
};

function oldestFirst(a: FileCheckRow, b: FileCheckRow): number {
  // A row with no recorded wait goes last: it cannot be the oldest we know of.
  if (a.waitSeconds === null && b.waitSeconds === null) {
    return (a.order.updatedAt || "").localeCompare(b.order.updatedAt || "");
  }
  if (a.waitSeconds === null) return 1;
  if (b.waitSeconds === null) return -1;
  return b.waitSeconds - a.waitSeconds;
}

export function buildFileCheckQueue(
  orders: readonly Order[],
  nowMs: number = Date.now(),
  hours?: OperatingHours | null,
): FileCheckQueue {
  const ready: FileCheckRow[] = [];
  const awaitingPayment: FileCheckRow[] = [];
  const sentBack: Order[] = [];
  for (const order of orders) {
    const waitSeconds = fileCheckWaitSeconds(order, nowMs, hours);
    if (canDecideFileCheck(order)) {
      ready.push({ order, waitSeconds });
    } else if (order.state === "client_correction") {
      sentBack.push(order);
    } else if (waitSeconds !== null && stageOf(order) === "payment") {
      awaitingPayment.push({ order, waitSeconds });
    }
  }
  ready.sort(oldestFirst);
  awaitingPayment.sort(oldestFirst);
  sentBack.sort((a, b) => (a.updatedAt || "").localeCompare(b.updatedAt || ""));
  return { ready, awaitingPayment, sentBack };
}

/** The send-back reason the client reads. The API refuses a blank one. */
export const SEND_BACK_REASON_MAX = 2000;

export function sendBackReasonProblem(reason: string): string | null {
  const text = reason.trim();
  if (!text)
    return "Say what the client needs to fix. They only have your words to work from.";
  if (text.length > SEND_BACK_REASON_MAX) {
    return `Keep it under ${SEND_BACK_REASON_MAX.toLocaleString("en-PH")} characters.`;
  }
  return null;
}

/**
 * One line for the workspace's quality-check row while the file is waiting:
 * how long, and whose move it is. An order under operating hours read while
 * GRIDGO is closed says when it will be reviewed instead.
 */
export function fileCheckWaitLine(
  order: Pick<Order, "fileCheck" | "state" | "review">,
  nowMs: number = Date.now(),
  formatWhen: (at: number) => string = (at) => manilaWhenFrom(at, nowMs),
): string | null {
  const slot = fileCheckReviewSlot(order, nowMs);
  if (slot?.closed && slot.scheduledAt !== null) {
    const delayed = slot.delayed ? " Review delayed." : "";
    return canDecideFileCheck(order)
      ? `Waiting for review: GRIDGO is closed, so the file is checked ${formatWhen(slot.scheduledAt)}.${delayed}`
      : `Waiting for review ${formatWhen(slot.scheduledAt)}, behind the payment check.${delayed}`;
  }
  const seconds = fileCheckWaitSeconds(order, nowMs);
  if (seconds === null) return null;
  const wait = seconds < 60 ? "under a minute" : formatWait(seconds);
  const delayed = slot?.delayed ? " Review delayed." : "";
  return canDecideFileCheck(order)
    ? `File waiting ${wait}. Pass it or send it back.${delayed}`
    : `File waiting ${wait}, behind the payment check.${delayed}`;
}

/** Version 1 of the four Operations checks, persisted with the review. */
export const QA_CHECKS = [
  { id: "artwork", label: "Artwork opens and is high enough resolution" },
  { id: "spec", label: "Specification matches what the client ordered" },
  { id: "quantity", label: "Quantity looks deliberate" },
  { id: "address", label: "Delivery address is somewhere a rider can go" },
] as const;

/** The four checks in this order's own words: its artwork, and pick-up or delivery. */
export function qaChecksFor(
  order: Pick<Order, "artworkFileIds" | "productionItems" | "requestFulfillment">,
): { id: QaCheckId; label: string }[] {
  const pickup = order.requestFulfillment?.fulfillmentMode === "pickup";
  return QA_CHECKS.map((check) => {
    if (check.id === "artwork") {
      return { id: check.id, label: artworkQaCheckLabel(artworkSource(order)) };
    }
    if (check.id === "address" && pickup) {
      return { id: check.id, label: "Client collects at the GRIDGO counter (Pick-up)" };
    }
    return { ...check };
  });
}

/** Send every tick explicitly; an unticked box does not attest to a failed check. */
export function qaChecklistPayload(checked: Record<string, boolean>): QaChecklist {
  return {
    artwork: checked.artwork === true,
    spec: checked.spec === true,
    quantity: checked.quantity === true,
    address: checked.address === true,
  };
}
