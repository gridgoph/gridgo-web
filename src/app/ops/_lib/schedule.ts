/**
 * Operational schedule events derived from orders and claims.
 * No parallel records — events always open an existing authorised workspace.
 */

import type { Claim, Order } from "@/lib/api/types";
import { claimBlocksPayout } from "@/lib/api/constraints";
import {
  endOfDay,
  endOfWeek,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";

export type ScheduleKind =
  | "qa"
  | "proof"
  | "acceptance_sla"
  | "production"
  | "pickup"
  | "delivery"
  | "recovery"
  | "cash_reconciliation"
  | "payout_hold";

export type ScheduleEvent = {
  id: string;
  kind: ScheduleKind;
  title: string;
  /** ISO timestamp used for placement. */
  at: string;
  orderId: string;
  orderTitle: string;
  href: string;
  detail: string;
};

export type ScheduleViewMode = "day" | "week";

export const SCHEDULE_KIND_LABEL: Record<ScheduleKind, string> = {
  qa: "QA",
  proof: "Proof",
  acceptance_sla: "Acceptance SLA",
  production: "Production",
  pickup: "Pickup",
  delivery: "Delivery",
  recovery: "Recovery",
  cash_reconciliation: "Cash reconciliation",
  payout_hold: "Payout hold",
};

const QA_STATES = new Set(["submitted", "needs_qa"]);
const PROOF_STATES = new Set(["proof_approval"]);
const ACCEPT_STATES = new Set(["supplier_assigned"]);
const PRODUCTION_STATES = new Set([
  "payment_authorized",
  "production",
  "supplier_self_qc",
]);
const PICKUP_STATES = new Set(["ready_for_dispatch", "rider_assigned"]);
const DELIVERY_STATES = new Set(["picked_up", "out_for_delivery"]);
const RECOVERY_STATES = new Set(["client_correction", "issue_window_open"]);
const CASH_STATES = new Set(["delivered", "issue_window_open", "completed"]);

function safeIso(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return fallback;
  return new Date(t).toISOString();
}

/**
 * Build schedule events from live orders and claims.
 * Prefer promisedDate, then parseable deadline, then updatedAt.
 */
export function buildScheduleEvents(
  orders: Order[],
  claims: Claim[] = [],
): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];

  for (const order of orders) {
    if (order.state === "draft") continue;

    const anchor = safeIso(
      order.promisedDate ||
        (order.deadline && !Number.isNaN(Date.parse(order.deadline))
          ? order.deadline
          : null) ||
        order.updatedAt,
      order.updatedAt || order.createdAt,
    );

    if (QA_STATES.has(order.state)) {
      events.push({
        id: `${order.id}:qa`,
        kind: "qa",
        title: "QA decision",
        at: anchor,
        orderId: order.id,
        orderTitle: order.title,
        href: `/ops/qa/${order.id}`,
        detail: "Review artwork and specs",
      });
    }

    if (PROOF_STATES.has(order.state)) {
      events.push({
        id: `${order.id}:proof`,
        kind: "proof",
        title: "Proof with client",
        at: anchor,
        orderId: order.id,
        orderTitle: order.title,
        href: `/ops/qa/${order.id}`,
        detail: "Waiting on client proof decision",
      });
    }

    if (ACCEPT_STATES.has(order.state)) {
      events.push({
        id: `${order.id}:accept`,
        kind: "acceptance_sla",
        title: "Supplier acceptance",
        at: anchor,
        orderId: order.id,
        orderTitle: order.title,
        href: `/ops/qa/${order.id}`,
        detail: "Supplier must accept or decline",
      });
    }

    if (PRODUCTION_STATES.has(order.state)) {
      events.push({
        id: `${order.id}:prod`,
        kind: "production",
        title: "Production",
        at: anchor,
        orderId: order.id,
        orderTitle: order.title,
        href: `/ops/qa/${order.id}`,
        detail: "In supplier production",
      });
    }

    if (PICKUP_STATES.has(order.state)) {
      events.push({
        id: `${order.id}:pickup`,
        kind: "pickup",
        title: "Pickup",
        at: anchor,
        orderId: order.id,
        orderTitle: order.title,
        href: `/ops/dispatch?order=${encodeURIComponent(order.id)}`,
        detail:
          order.state === "ready_for_dispatch"
            ? "Assign rider for pickup"
            : "Rider assigned — await pickup",
      });
    }

    if (DELIVERY_STATES.has(order.state)) {
      events.push({
        id: `${order.id}:delivery`,
        kind: "delivery",
        title: "Delivery",
        at: anchor,
        orderId: order.id,
        orderTitle: order.title,
        href: `/ops/dispatch?order=${encodeURIComponent(order.id)}`,
        detail: "Out with rider",
      });
    }

    if (RECOVERY_STATES.has(order.state)) {
      events.push({
        id: `${order.id}:recovery`,
        kind: "recovery",
        title: "Recovery",
        at: anchor,
        orderId: order.id,
        orderTitle: order.title,
        href: "/ops/recovery",
        detail:
          order.state === "client_correction"
            ? "Client correction outstanding"
            : "Issue window open",
      });
    }

    if (
      CASH_STATES.has(order.state) &&
      order.paymentMethod === "cod" &&
      order.paymentStatus !== "reconciled"
    ) {
      events.push({
        id: `${order.id}:cash`,
        kind: "cash_reconciliation",
        title: "Cash reconciliation",
        at: anchor,
        orderId: order.id,
        orderTitle: order.title,
        href: `/ops/qa/${order.id}`,
        detail: "COD collection needs reconciliation",
      });
    }

    // Explicit deadline / promised markers when parseable and not already covered
    if (order.promisedDate && !Number.isNaN(Date.parse(order.promisedDate))) {
      if (
        !events.some(
          (e) => e.orderId === order.id && e.at === order.promisedDate,
        )
      ) {
        // already using promised as anchor above — no extra row needed
      }
    }
  }

  for (const claim of claims) {
    if (!claimBlocksPayout(claim.status)) continue;
    const order = orders.find((o) => o.id === claim.orderId);
    const at = safeIso(
      claim.heldAt || claim.createdAt,
      claim.updatedAt || claim.createdAt,
    );
    events.push({
      id: `claim:${claim.id}:hold`,
      kind: "payout_hold",
      title: "Payout hold",
      at,
      orderId: claim.orderId,
      orderTitle: order?.title ?? claim.orderId,
      href: "/ops/claims",
      detail: claim.holdReason || claim.reason,
    });
  }

  return events.sort((a, b) => a.at.localeCompare(b.at));
}

export function rangeForView(
  mode: ScheduleViewMode,
  anchor: Date,
): { start: Date; end: Date } {
  if (mode === "day") {
    return { start: startOfDay(anchor), end: endOfDay(anchor) };
  }
  // Week starts Monday to match PH operations planning
  return {
    start: startOfWeek(anchor, { weekStartsOn: 1 }),
    end: endOfWeek(anchor, { weekStartsOn: 1 }),
  };
}

export function filterEventsInRange(
  events: ScheduleEvent[],
  start: Date,
  end: Date,
  kinds?: Set<ScheduleKind> | null,
): ScheduleEvent[] {
  return events.filter((ev) => {
    if (kinds && kinds.size > 0 && !kinds.has(ev.kind)) return false;
    try {
      const at = parseISO(ev.at);
      if (Number.isNaN(at.getTime())) return false;
      return isWithinInterval(at, { start, end });
    } catch {
      return false;
    }
  });
}

export function groupEventsByDay(
  events: ScheduleEvent[],
): { dayKey: string; dayLabel: string; events: ScheduleEvent[] }[] {
  const map = new Map<string, ScheduleEvent[]>();
  for (const ev of events) {
    const d = new Date(ev.at);
    if (Number.isNaN(d.getTime())) continue;
    const key = d.toISOString().slice(0, 10);
    const list = map.get(key) ?? [];
    list.push(ev);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, dayEvents]) => ({
      dayKey,
      dayLabel: new Intl.DateTimeFormat("en-PH", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(new Date(dayKey + "T12:00:00")),
      events: dayEvents.sort((a, b) => a.at.localeCompare(b.at)),
    }));
}
