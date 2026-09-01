/**
 * Operations overview: queue buckets, SLA pressure, single next action.
 * Pure functions — no React, no fetch.
 */

import type { Claim, Issue, Order } from "@/lib/api/types";
import { claimBlocksPayout } from "@/lib/api/constraints";
import { primaryOpsAction } from "@/lib/ops-actions";
import { presentOrderState } from "@/lib/order-state";

export type OverviewBucketId =
  | "needs_qa"
  | "payment_confirmation"
  | "awaiting_matching"
  | "signup_approvals"
  | "in_production"
  | "out_for_delivery"
  | "escalated"
  | "blocked"
  | "sla_risk";

export type OverviewBucket = {
  id: OverviewBucketId;
  label: string;
  description: string;
  count: number;
  /** Href for the primary surface that works this queue. */
  href: string;
  /** When true, this bucket is the recommended next focus. */
  urgent: boolean;
};

export type OverviewNextAction = {
  title: string;
  body: string;
  href: string;
  cta: string;
  orderId?: string;
  orderTitle?: string;
};

const QA_STATES = new Set(["submitted", "needs_qa"]);
const MATCH_STATES = new Set(["approved_for_matching"]);
/** An order stalls here until Operations confirms the client's transfer. */
const PAYMENT_REVIEW_STATES = new Set(["downpayment_review", "initial_payment_review"]);
const PRODUCTION_STATES = new Set([
  "supplier_assigned",
  "awaiting_downpayment",
  "payment_authorized",
  "production",
  "supplier_self_qc",
]);
const DELIVERY_STATES = new Set([
  "ready_for_dispatch",
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
  // A collected job on the office counter is still Operations' to move: it
  // waits there until somebody releases it to the client.
  "awaiting_collection",
]);
const BLOCKED_STATES = new Set(["client_correction"]);
const TERMINAL_STATES = new Set(["payout_released", "draft"]);

/** Hours before deadline that count as “near SLA”. */
export const SLA_NEAR_HOURS = 24;

export function isSlaAtRisk(
  order: Pick<Order, "state" | "deadline" | "promisedDate">,
  nowMs: number = Date.now(),
): boolean {
  if (TERMINAL_STATES.has(order.state)) return false;
  if (order.state === "completed" || order.state === "delivered") return false;

  const candidates = [order.deadline, order.promisedDate]
    .filter((v): v is string => Boolean(v))
    .map((v) => Date.parse(v))
    .filter((t) => !Number.isNaN(t));

  if (!candidates.length) return false;

  const soonest = Math.min(...candidates);
  const windowMs = SLA_NEAR_HOURS * 60 * 60 * 1000;
  return soonest <= nowMs + windowMs;
}

export function isSlaBreached(
  order: Pick<Order, "state" | "deadline" | "promisedDate">,
  nowMs: number = Date.now(),
): boolean {
  if (TERMINAL_STATES.has(order.state)) return false;
  if (
    order.state === "completed" ||
    order.state === "delivered" ||
    order.state === "payout_released"
  ) {
    return false;
  }

  const candidates = [order.deadline, order.promisedDate]
    .filter((v): v is string => Boolean(v))
    .map((v) => Date.parse(v))
    .filter((t) => !Number.isNaN(t));

  if (!candidates.length) return false;
  return Math.min(...candidates) < nowMs;
}

export function orderIsBlocked(
  order: Order,
  claims: Claim[] = [],
  issues: Issue[] = [],
): boolean {
  if (BLOCKED_STATES.has(order.state)) return true;
  if (order.payoutHold) return true;
  const orderClaims = claims.filter((c) => c.orderId === order.id);
  if (orderClaims.some((c) => claimBlocksPayout(c.status))) return true;
  const openIssues = issues.filter((i) => i.orderId === order.id && i.status === "open");
  return openIssues.length > 0;
}

export function buildOverviewBuckets(
  orders: Order[],
  claims: Claim[] = [],
  issues: Issue[] = [],
  nowMs: number = Date.now(),
  extras: {
    pendingSignups?: number;
    openEscalations?: number;
  } = {},
): OverviewBucket[] {
  const active = orders.filter((o) => o.state !== "draft");

  const needsQa = active.filter((o) => QA_STATES.has(o.state));
  const payments = active.filter((o) => PAYMENT_REVIEW_STATES.has(o.state));
  const matching = active.filter((o) => MATCH_STATES.has(o.state));
  const production = active.filter((o) => PRODUCTION_STATES.has(o.state));
  const delivery = active.filter((o) => DELIVERY_STATES.has(o.state));
  const blocked = active.filter((o) => orderIsBlocked(o, claims, issues));
  const slaRisk = active.filter((o) => isSlaAtRisk(o, nowMs) || isSlaBreached(o, nowMs));
  const pendingSignups = extras.pendingSignups ?? 0;
  const openEscalations = extras.openEscalations ?? 0;

  const buckets: OverviewBucket[] = [
    {
      id: "payment_confirmation",
      label: "Payments to confirm",
      description:
        "A client has transferred and is waiting. Nothing moves until the money is confirmed.",
      count: payments.length,
      href: "/ops/orders?stage=payment",
      urgent: payments.length > 0,
    },
    {
      id: "escalated",
      label: "Riders blocked",
      description:
        "A pickup check failed. The rider must not transport until you say what happens.",
      count: openEscalations,
      href: "/ops/escalations",
      urgent: openEscalations > 0,
    },
    {
      id: "needs_qa",
      label: "Needs QA",
      description: "Submitted or in review — artwork and specs need a decision.",
      count: needsQa.length,
      href: "/ops/orders",
      urgent: needsQa.length > 0,
    },
    {
      id: "awaiting_matching",
      label: "Awaiting matching",
      description: "Approved work waiting for an Operations supplier choice.",
      count: matching.length,
      href: "/ops/orders?stage=qa",
      urgent: matching.length > 0,
    },
    {
      id: "signup_approvals",
      label: "Sign-ups waiting",
      description:
        "Suppliers and riders who cannot be given work until they are approved.",
      count: pendingSignups,
      href: "/ops/approvals",
      urgent: pendingSignups > 0,
    },
    {
      id: "in_production",
      label: "In production",
      description: "Assigned through supplier self-QC — monitor, not queue.",
      count: production.length,
      href: "/ops/orders",
      urgent: false,
    },
    {
      id: "out_for_delivery",
      label: "Out for delivery",
      description: "Dispatch and rider states through delivery and collection.",
      count: delivery.length,
      href: "/ops/dispatch",
      urgent: delivery.some(
        (o) => o.state === "ready_for_dispatch" || o.state === "awaiting_collection",
      ),
    },
    {
      id: "blocked",
      label: "Blocked",
      description: "Corrections, open issues, or active payout holds.",
      count: blocked.length,
      href: "/ops/recovery",
      urgent: blocked.length > 0,
    },
    {
      id: "sla_risk",
      label: "SLA risk",
      description: "Deadline or promised date within 24 hours, or already late.",
      count: slaRisk.length,
      href: "/ops/schedule",
      urgent: slaRisk.some((o) => isSlaBreached(o, nowMs)),
    },
  ];

  return buckets;
}

/**
 * One clear next action for the overview — prioritised, not a wall of counters.
 */
export function pickOverviewNextAction(
  orders: Order[],
  claims: Claim[] = [],
  issues: Issue[] = [],
  nowMs: number = Date.now(),
  extras: { openEscalations?: number } = {},
): OverviewNextAction | null {
  const active = orders.filter((o) => o.state !== "draft");

  // 1. A rider standing at a supplier with a failed check outranks everything:
  //    they cannot move, and an unlogged defect becomes GRIDGO's liability.
  if (extras.openEscalations) {
    return {
      title: "A rider is blocked at pickup",
      body:
        extras.openEscalations === 1
          ? "A pickup check failed and the rider is waiting for your instruction before they can transport."
          : `${extras.openEscalations} pickup checks failed. Those riders are waiting for your instruction.`,
      href: "/ops/escalations",
      cta: "Open escalations",
    };
  }

  // 2. Money a client has already sent. The order is stopped until it clears.
  const paymentOrder = active
    .filter((o) => PAYMENT_REVIEW_STATES.has(o.state))
    .sort((a, b) => (a.updatedAt || "").localeCompare(b.updatedAt || ""))[0];
  if (paymentOrder) {
    return {
      title: "Confirm a downpayment",
      body: `${paymentOrder.title} — the client has transferred and the order cannot move until the money is confirmed.`,
      href: `/ops/orders/${paymentOrder.id}`,
      cta: "Review payment",
      orderId: paymentOrder.id,
      orderTitle: paymentOrder.title,
    };
  }

  // 3. QA that Operations can progress
  const qaOrder = active
    .filter((o) => QA_STATES.has(o.state))
    .sort((a, b) => (a.updatedAt || "").localeCompare(b.updatedAt || ""))[0];
  if (qaOrder) {
    const action = primaryOpsAction(qaOrder.state);
    return {
      title: action?.label ?? "Open QA workspace",
      body: `${qaOrder.title} — ${presentOrderState(qaOrder.state).label}.`,
      href: `/ops/orders/${qaOrder.id}`,
      cta: action?.label ?? "Open for QA",
      orderId: qaOrder.id,
      orderTitle: qaOrder.title,
    };
  }

  // 2. Matching
  const matchOrder = active.find((o) => MATCH_STATES.has(o.state));
  if (matchOrder) {
    return {
      title: "Assign a supplier",
      body: `${matchOrder.title} is ready for matching. Choose an eligible supplier with a clear reason.`,
      href: `/ops/orders/${matchOrder.id}`,
      cta: "Open matching",
      orderId: matchOrder.id,
      orderTitle: matchOrder.title,
    };
  }

  // 3. Dispatch ready
  const dispatchOrder = active.find((o) => o.state === "ready_for_dispatch");
  if (dispatchOrder) {
    return {
      title: "Assign a rider",
      body: `${dispatchOrder.title} is ready for pickup.`,
      href: `/ops/dispatch?order=${encodeURIComponent(dispatchOrder.id)}`,
      cta: "Open dispatch",
      orderId: dispatchOrder.id,
      orderTitle: dispatchOrder.title,
    };
  }

  // 4. Open recovery (issue or claim)
  const openIssue = issues.find((i) => i.status === "open");
  if (openIssue) {
    const order = active.find((o) => o.id === openIssue.orderId);
    return {
      title: "Resolve open issue",
      body: order ? `${order.title}: ${openIssue.description}` : openIssue.description,
      href: "/ops/recovery",
      cta: "Open recovery",
      orderId: openIssue.orderId,
      orderTitle: order?.title,
    };
  }

  const heldClaim = claims.find((c) => claimBlocksPayout(c.status));
  if (heldClaim) {
    const order = active.find((o) => o.id === heldClaim.orderId);
    return {
      title: "Review payout hold",
      body: order ? `${order.title} — ${heldClaim.reason}` : heldClaim.reason,
      href: "/ops/claims",
      cta: "Open claims",
      orderId: heldClaim.orderId,
      orderTitle: order?.title,
    };
  }

  // 5. SLA breach / near
  const breached = active
    .filter((o) => isSlaBreached(o, nowMs))
    .sort((a, b) => {
      const ta = Date.parse(a.promisedDate || a.deadline || "") || 0;
      const tb = Date.parse(b.promisedDate || b.deadline || "") || 0;
      return ta - tb;
    })[0];
  if (breached) {
    return {
      title: "SLA breached",
      body: `${breached.title} is past its deadline or promised date.`,
      href: `/ops/orders/${breached.id}`,
      cta: "Open order",
      orderId: breached.id,
      orderTitle: breached.title,
    };
  }

  const near = active
    .filter((o) => isSlaAtRisk(o, nowMs))
    .sort((a, b) => {
      const ta = Date.parse(a.promisedDate || a.deadline || "") || 0;
      const tb = Date.parse(b.promisedDate || b.deadline || "") || 0;
      return ta - tb;
    })[0];
  if (near) {
    return {
      title: "Deadline approaching",
      body: `${near.title} is within the next ${SLA_NEAR_HOURS} hours.`,
      href: `/ops/orders/${near.id}`,
      cta: "Open order",
      orderId: near.id,
      orderTitle: near.title,
    };
  }

  // 6. Milestones a supplier has earned and can be paid for.
  //    The issue window is not here: only the platform closes it, once it has
  //    actually expired, so there is nothing for Operations to do about it.
  const payoutReady = active.find(
    (o) =>
      !o.payoutHold &&
      (o.payoutMilestones ?? []).some(
        (m) => m.status === "pof_attached" || m.pofFileIds.length > 0,
      ) &&
      (o.payoutMilestones ?? []).some((m) => m.status !== "released"),
  );
  if (payoutReady) {
    return {
      title: "Release a supplier milestone",
      body: `${payoutReady.title} has proof waiting against a milestone the supplier has already earned.`,
      href: "/ops/payouts",
      cta: "Open payouts",
      orderId: payoutReady.id,
      orderTitle: payoutReady.title,
    };
  }

  return null;
}
