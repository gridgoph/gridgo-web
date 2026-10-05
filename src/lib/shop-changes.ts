/**
 * When a shop cannot take, keep, or meet an order.
 *
 * Two API contracts feed one desk:
 *
 * - Shop acceptance and recovery (gridgo-api SHOP_RECOVERY_API.md,
 *   gridgo-supplier#102). A shop has one opening hour to accept; no answer,
 *   a decline, or a cancellation before pickup is logged with the stage it
 *   happened at, and GRIDGO offers the client a vetted replacement or a full
 *   refund. When the shop was already paid a share, nothing moves on its own:
 *   the recovery waits for Operations (`ops_review`).
 * - Production deadline requests (gridgo-api ORDER_RESCHEDULE_API.md,
 *   gridgo-supplier#101). A shop asks once for a later date; the client
 *   accepts or declines. An applied late-production deduction, or a paid share
 *   on a declined request, routes it to Operations.
 *
 * Both sets of "needs Operations" cases land in one list. Pure: no React, no
 * fetch.
 */

import type {
  RescheduleRequest,
  ShopAcceptance,
  ShopFailureEvent,
  ShopFailureKind,
  ShopRecovery,
} from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";
import { presentOrderState } from "@/lib/order-state";

export type Presentation = { label: string; tone: StatusTone; icon: StatusIconName };

export function presentFailureKind(kind: ShopFailureKind | string): string {
  switch (kind) {
    case "timed_out":
      return "No answer in time";
    case "declined":
      return "Declined the order";
    case "cancelled":
      return "Cancelled after accepting";
    default:
      return "Could not fulfil";
  }
}

/** The order state the shop failed at, in the words the queues use. */
export function presentFailureStage(stage: string | null | undefined): string {
  if (!stage) return "Unknown stage";
  return presentOrderState(stage).label;
}

export function recoveryNeedsOperations(
  recovery: Pick<ShopRecovery, "status"> | null | undefined,
): boolean {
  return recovery?.status === "ops_review";
}

export function presentRecoveryStatus(
  recovery: Pick<ShopRecovery, "status" | "proposal">,
): Presentation {
  switch (recovery.status) {
    case "ops_review":
      return { label: "Needs Operations", tone: "warning", icon: "triangle-alert" };
    case "awaiting_client":
      return recovery.proposal
        ? { label: "Client choosing: replacement or refund", tone: "info", icon: "clock" }
        : { label: "No replacement, client may refund", tone: "info", icon: "clock" };
    case "refund_requested":
      return { label: "Refund requested", tone: "info", icon: "clock" };
    case "refunded":
      return { label: "Refunded", tone: "neutral", icon: "circle-check" };
    case "accepted":
      return {
        label: "Replacement shop accepted",
        tone: "success",
        icon: "circle-check",
      };
    default:
      return { label: "Recovery", tone: "neutral", icon: "circle-help" };
  }
}

/** Work and payouts stay stopped until the recovery is accepted. */
export function recoveryHoldsWork(
  recovery: Pick<ShopRecovery, "status"> | null | undefined,
) {
  return Boolean(recovery && recovery.status !== "accepted");
}

export function rescheduleNeedsOperations(
  request:
    Pick<RescheduleRequest, "status" | "resolution" | "workHeld"> | null | undefined,
): boolean {
  if (!request || !request.workHeld) return false;
  return (
    request.resolution === "operations_required" ||
    request.status === "operations_required"
  );
}

/** Whether Operations may record a resolution (`POST …/resolve`). */
export function canResolveReschedule(
  request: Pick<RescheduleRequest, "workHeld" | "resolution"> | null | undefined,
): boolean {
  return Boolean(request?.workHeld && request.resolution !== "refund_requested");
}

export function presentRescheduleStatus(
  request: Pick<RescheduleRequest, "status" | "resolution" | "workHeld">,
): Presentation {
  if (rescheduleNeedsOperations(request)) {
    return { label: "Needs Operations", tone: "warning", icon: "triangle-alert" };
  }
  switch (request.resolution) {
    case "resolved":
      return { label: "Resolved by Operations", tone: "neutral", icon: "circle-check" };
    case "rematched":
      return { label: "Moved to another shop", tone: "success", icon: "git-merge" };
    case "refund_requested":
      return { label: "Client asked for a refund", tone: "info", icon: "clock" };
    case "rematch_offered":
      return { label: "Declined, replacement offered", tone: "info", icon: "clock" };
    case "no_match":
      return { label: "Declined, no replacement found", tone: "info", icon: "clock" };
    default:
      break;
  }
  switch (request.status) {
    case "pending":
      return { label: "Waiting on the client", tone: "info", icon: "clock" };
    case "accepted":
      return { label: "New date accepted", tone: "success", icon: "circle-check" };
    case "declined":
      return { label: "Client declined", tone: "info", icon: "circle-x" };
    case "expired":
      return {
        label: "No answer, original date stands",
        tone: "neutral",
        icon: "circle-dashed",
      };
    default:
      return { label: "Deadline request", tone: "neutral", icon: "circle-help" };
  }
}

/** Why a "needs Operations" case is there, in one plain sentence. */
export function rescheduleOperationsReason(
  request: Pick<RescheduleRequest, "status" | "appliedDeductionMinor">,
  formatMoney: (minor: number) => string,
): string {
  const deduction = request.appliedDeductionMinor ?? 0;
  const applied =
    deduction > 0
      ? `A late-production deduction of ${formatMoney(deduction)} was already taken`
      : "A shop payout was already released";
  return request.status === "declined"
    ? `${applied}, so the client's decline cannot move the order to another shop by itself.`
    : `${applied}, so the new date was not applied. Dates and deductions are unchanged.`;
}

export const RECOVERY_OPERATIONS_REASON =
  "The shop was already paid a share of this order, so GRIDGO did not look for a replacement. Decide how the order continues; the client can still ask for a full refund.";

// ---------------------------------------------------------------------------
// The acceptance window
// ---------------------------------------------------------------------------

export type AcceptanceView = {
  summary: string;
  /** The window is open now. */
  open: boolean;
};

export function acceptanceView(
  acceptance: ShopAcceptance,
  formatWhen: (iso: string) => string,
  nowMs: number = Date.now(),
): AcceptanceView {
  const deadline = Date.parse(acceptance.deadlineAt);
  switch (acceptance.status) {
    case "pending":
      if (Number.isFinite(deadline) && deadline > nowMs) {
        return {
          summary: `Waiting for the shop to accept, until ${formatWhen(acceptance.deadlineAt)}.`,
          open: true,
        };
      }
      return {
        summary: `The window closed ${formatWhen(acceptance.deadlineAt)}. It is recorded as no answer within a minute.`,
        open: false,
      };
    case "accepted":
      return {
        summary: acceptance.acceptedAt
          ? `Accepted ${formatWhen(acceptance.acceptedAt)}.`
          : "Accepted within its window.",
        open: false,
      };
    case "timed_out":
      return {
        summary: `No answer by ${formatWhen(acceptance.deadlineAt)}.`,
        open: false,
      };
    case "declined":
      return { summary: "The shop declined the order.", open: false };
    case "cancelled":
      return { summary: "The shop cancelled after accepting.", open: false };
    default:
      return { summary: "Acceptance window recorded.", open: false };
  }
}

// ---------------------------------------------------------------------------
// The "needs Operations" list
// ---------------------------------------------------------------------------

export type NeedsOperationsItem =
  | {
      key: string;
      kind: "recovery";
      orderId: string;
      supplierId: string | null;
      since: string;
      event: ShopFailureEvent;
      recovery: ShopRecovery;
    }
  | {
      key: string;
      kind: "reschedule";
      orderId: string;
      supplierId: string | null;
      since: string;
      request: RescheduleRequest;
    };

/**
 * Every case that waits on Operations, oldest first: recoveries in
 * `ops_review` (one per order, from the event that opened it) and deadline
 * requests whose hold only Operations can lift.
 */
export function buildNeedsOperations(
  events: readonly ShopFailureEvent[],
  requests: readonly RescheduleRequest[],
): NeedsOperationsItem[] {
  const items: NeedsOperationsItem[] = [];
  // The order's current recovery rides on every one of its events; keep one
  // row per order, from the event that opened it when that event is listed.
  const opening = new Map<string, ShopFailureEvent>();
  for (const event of events) {
    const recovery = event.recovery;
    if (!recovery || !recoveryNeedsOperations(recovery)) continue;
    const kept = opening.get(event.orderId);
    if (!kept || event.id === recovery.id) opening.set(event.orderId, event);
  }
  for (const [orderId, event] of opening) {
    const recovery = event.recovery as ShopRecovery;
    items.push({
      key: `recovery:${recovery.id}`,
      kind: "recovery",
      orderId,
      supplierId: recovery.originalSupplierId ?? event.supplierId ?? null,
      since: recovery.createdAt ?? event.at,
      event,
      recovery,
    });
  }
  for (const request of requests) {
    if (!rescheduleNeedsOperations(request)) continue;
    items.push({
      key: `reschedule:${request.id}`,
      kind: "reschedule",
      orderId: request.orderId,
      supplierId: request.supplierId ?? null,
      since: request.answeredAt ?? request.requestedAt,
      request,
    });
  }
  return items.sort((a, b) => (a.since || "").localeCompare(b.since || ""));
}

/** One order's failures, oldest first. */
export function failuresForOrder(
  events: readonly ShopFailureEvent[],
  orderId: string,
): ShopFailureEvent[] {
  return events
    .filter((event) => event.orderId === orderId)
    .sort((a, b) => (a.at || "").localeCompare(b.at || ""));
}

/** Resolution notes are audited; the API takes 1–2,000 characters. */
export const RESOLUTION_REASON_MAX = 2000;
