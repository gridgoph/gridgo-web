/**
 * What the order queue opens on: the orders waiting on Operations, grouped by
 * the action owed and oldest first in each group.
 *
 * The groups run in the order an order reaches them -- the money is confirmed,
 * then the artwork is checked, then a rider takes it -- which is also the
 * order the overview already ranks them in (`pickOverviewNextAction`: payment,
 * QA, dispatch, and a breached deadline after all three). No score is made up
 * here to rank a late order against an unpaid one: a late order that also owes
 * a step sits in that step's group, marked late, and the Late group holds only
 * the late orders that owe nothing else.
 *
 * Every test is one the portal already makes: the payment queue's pending
 * installment, the pin and change payments that hold an order, the file
 * check's `needs_qa`, the dispatch board's `ready_for_dispatch`, and the
 * overview's breached deadline. No new order states, no new rule.
 *
 * Pure functions -- no React, no fetch.
 */

import type { Order, PaymentInstallment } from "@/lib/api/types";
import { pinChangeOf, pinPaymentAwaitingOperations } from "@/lib/delivery-pin";
import { canDecideFileCheck, fileCheckOf } from "@/lib/file-check";
import { changePaymentAwaitingStaff, changeRequestsOf } from "@/lib/order-changes";
import { listedInstallments, paymentOf } from "@/lib/payments";
import { isSlaBreached } from "@/app/ops/_lib/overview";
import { stageOf } from "@/app/ops/_lib/pipeline";

export type NeedsActionId = "payment" | "artwork" | "rider" | "late";

export type NeedsActionDefinition = {
  id: NeedsActionId;
  /** The action, as a verb: what the row asks of Operations. */
  label: string;
  /** One line under the count. */
  hint: string;
};

/** In the order the order flow reaches them. */
export const NEEDS_ACTIONS: readonly NeedsActionDefinition[] = [
  {
    id: "payment",
    label: "Confirm payment",
    hint: "A client's transfer is waiting on you.",
  },
  {
    id: "artwork",
    label: "Check artwork",
    hint: "Paid files to check before a shop sees them.",
  },
  {
    id: "rider",
    label: "Assign rider",
    hint: "Ready at the shop with no rider yet.",
  },
  {
    id: "late",
    label: "Late",
    hint: "Past its date, with nothing else waiting on you.",
  },
] as const;

export type NeedsActionRow = {
  order: Order;
  action: NeedsActionId;
  /** When the order started waiting for this action. Null when it cannot be read. */
  since: string | null;
  /** Past its deadline or promised date, whatever it waits on. */
  late: boolean;
  /**
   * The order's own installment waiting on a decision, when that is what the
   * payment is. Null for a pin or change payment, which is decided on the order.
   */
  installment: PaymentInstallment | null;
};

/**
 * The overview's breached deadline, unchanged (`isSlaBreached`). An order on
 * the office counter is still late until the client has it. Finished and
 * cancelled orders never reach this: `needsActionOf` drops them first.
 */
export function isLate(order: Order, nowMs: number = Date.now()): boolean {
  return isSlaBreached(order, nowMs);
}

/** When the order last entered its current state, from its own timeline. */
function enteredStateAt(order: Order): string | null {
  const entry = [...(order.timeline ?? [])]
    .reverse()
    .find((item) => item.state === order.state);
  return entry?.at ?? order.updatedAt ?? null;
}

/** The moment the order passed its earliest date. */
function lateSince(order: Order): string | null {
  const dates = [order.deadline, order.promisedDate]
    .filter((value): value is string => Boolean(value))
    .filter((value) => !Number.isNaN(Date.parse(value)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return dates[0] ?? null;
}

/**
 * The one action this order owes Operations, or null. The first group it
 * qualifies for wins, so an order is never listed twice.
 */
export function needsActionOf(
  order: Order,
  nowMs: number = Date.now(),
): Omit<NeedsActionRow, "order" | "late"> | null {
  if (stageOf(order) === "done") return null;

  // The order's own installment: the downpayment before a balance, as the
  // payment queue ranks them.
  for (const installment of listedInstallments(order)) {
    const payment = paymentOf(order, installment);
    if (payment?.status === "pending_confirmation") {
      return { action: "payment", since: payment.submittedAt ?? null, installment };
    }
  }
  if (pinPaymentAwaitingOperations(order)) {
    return {
      action: "payment",
      since: pinChangeOf(order)?.payment?.submittedAt ?? enteredStateAt(order),
      installment: null,
    };
  }
  if (changePaymentAwaitingStaff(order)) {
    const request = changeRequestsOf(order).find(
      (entry) => entry.status === "pending_confirmation",
    );
    return {
      action: "payment",
      since: request?.payment?.submittedAt ?? enteredStateAt(order),
      installment: null,
    };
  }

  if (canDecideFileCheck(order)) {
    return {
      action: "artwork",
      since: fileCheckOf(order)?.requestedAt ?? enteredStateAt(order),
      installment: null,
    };
  }

  if (order.state === "ready_for_dispatch") {
    return {
      action: "rider",
      since: order.readyAt ?? enteredStateAt(order),
      installment: null,
    };
  }

  if (isLate(order, nowMs)) {
    return { action: "late", since: lateSince(order), installment: null };
  }
  return null;
}

const RANK: Record<NeedsActionId, number> = Object.fromEntries(
  NEEDS_ACTIONS.map((entry, index) => [entry.id, index]),
) as Record<NeedsActionId, number>;

function sinceMs(row: NeedsActionRow): number {
  const ms = row.since ? Date.parse(row.since) : NaN;
  // A wait that cannot be read goes last in its group, not first.
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/** Every order waiting on Operations: by group in flow order, oldest first in each. */
export function buildNeedsActionQueue(
  orders: readonly Order[],
  nowMs: number = Date.now(),
): NeedsActionRow[] {
  const rows: NeedsActionRow[] = [];
  for (const order of orders) {
    const owed = needsActionOf(order, nowMs);
    if (owed) rows.push({ order, ...owed, late: isLate(order, nowMs) });
  }
  return rows.sort(
    (a, b) =>
      RANK[a.action] - RANK[b.action] ||
      sinceMs(a) - sinceMs(b) ||
      a.order.id.localeCompare(b.order.id),
  );
}

export function needsActionCounts(
  rows: readonly NeedsActionRow[],
): Record<NeedsActionId, number> {
  const counts: Record<NeedsActionId, number> = {
    payment: 0,
    artwork: 0,
    rider: 0,
    late: 0,
  };
  for (const row of rows) counts[row.action] += 1;
  return counts;
}

/** The row's position in the queue, for a sortable column that keeps the groups. */
export function needsActionSortKey(row: NeedsActionRow): number {
  const ms = sinceMs(row);
  return RANK[row.action] * 1e15 + (Number.isFinite(ms) ? ms : 1e15 - 1);
}
