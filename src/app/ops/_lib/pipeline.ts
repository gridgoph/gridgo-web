/**
 * One queue, four steps.
 *
 * Operations used to work an order across three destinations: a payments queue
 * to confirm the transfer, a QA queue to check the artwork, and a matching
 * screen to pick a shop. Matching is gone -- GRIDGO chooses the press -- and the
 * other two are the same order at two moments of the same job, so they are one
 * queue filtered by where the order has got to.
 *
 * The order of the steps is the order the work actually happens in, and it is
 * not arbitrary: the money is confirmed before anyone looks at the artwork, and
 * the shop does not see the job until both are done.
 *
 * Pure functions -- no React, no fetch.
 */

import type { Order } from "@/lib/api/types";
import { paymentOf } from "@/lib/payments";

export type Stage = "payment" | "qa" | "production" | "delivery" | "done";

export type StageDefinition = {
  id: Stage;
  label: string;
  /** What Operations is waiting on, or doing, at this stage. */
  hint: string;
};

/** Left to right, in the order an order passes through them. */
export const STAGES: readonly StageDefinition[] = [
  { id: "payment", label: "Payment", hint: "A transfer is waiting on your decision." },
  { id: "qa", label: "Quality check", hint: "Artwork and specification need checking before a shop sees them." },
  { id: "production", label: "With the shop", hint: "Accepted and being printed. Nothing for you to do." },
  { id: "delivery", label: "Delivery", hint: "On its way, or waiting out the issue window." },
  { id: "done", label: "Finished", hint: "Completed, paid out, or cancelled." },
] as const;

const STAGE_BY_STATE: Record<string, Stage> = {
  // Money. Everything before Operations has confirmed the client's transfer.
  draft: "payment",
  submitted: "payment",
  awaiting_initial_payment: "payment",
  initial_payment_review: "payment",
  awaiting_downpayment: "payment",
  downpayment_review: "payment",
  awaiting_checkout: "payment",

  // Artwork. Confirmed money, not yet handed to a shop.
  needs_qa: "qa",
  client_correction: "qa",
  proof_approval: "qa",

  // The shop's own work, from being offered the job to setting it down for a rider.
  approved_for_matching: "production",
  supplier_assigned: "production",
  payment_authorized: "production",
  production: "production",
  supplier_self_qc: "production",
  ready_for_dispatch: "production",

  rider_assigned: "delivery",
  picked_up: "delivery",
  out_for_delivery: "delivery",
  delivered: "delivery",
  issue_window_open: "delivery",

  completed: "done",
  payout_released: "done",
  cancelled: "done",
};

export function stageOf(order: Pick<Order, "state">): Stage {
  return STAGE_BY_STATE[order.state] ?? "production";
}

/**
 * Whether this stage is waiting on Operations, as opposed to on a shop, a rider
 * or a clock. A queue that counts work nobody can act on teaches people to stop
 * reading the counts.
 */
export function stageNeedsOperations(order: Order): boolean {
  const stage = stageOf(order);
  if (stage === "payment") {
    return paymentOf(order, "downpayment")?.status === "pending_confirmation";
  }
  if (stage === "qa") {
    // A correction is with the client; only a fresh check is ours.
    return order.state === "needs_qa";
  }
  // An order that has stalled where it should not have is worth surfacing, but
  // that is the recovery desk's job rather than this queue's.
  return false;
}

export function ordersInStage(orders: readonly Order[], stage: Stage): Order[] {
  return orders.filter((order) => stageOf(order) === stage);
}

export function stageCounts(orders: readonly Order[]): Record<Stage, number> {
  const counts: Record<Stage, number> = { payment: 0, qa: 0, production: 0, delivery: 0, done: 0 };
  for (const order of orders) counts[stageOf(order)] += 1;
  return counts;
}

/** How many orders in this stage are actually waiting on Operations. */
export function actionableCount(orders: readonly Order[], stage: Stage): number {
  return orders.filter((order) => stageOf(order) === stage && stageNeedsOperations(order)).length;
}

export type StepStatus = "done" | "current" | "locked";

export type WorkspaceStep = {
  id: Stage;
  label: string;
  status: StepStatus;
};

/**
 * The four steps as one order sees them.
 *
 * Everything behind the order's own stage is done, the stage it is in is
 * current, and everything ahead is locked -- so only one step is ever
 * actionable, and a screen cannot invite somebody to approve artwork on an
 * order whose payment has not cleared.
 */
export function stepsFor(order: Pick<Order, "state">): WorkspaceStep[] {
  const stage = stageOf(order);
  const currentIndex = STAGES.findIndex((entry) => entry.id === stage);
  return STAGES.filter((entry) => entry.id !== "done").map((entry, index) => ({
    id: entry.id,
    label: entry.label,
    status: index < currentIndex ? "done" : index === currentIndex ? "current" : "locked",
  }));
}

/** A cancelled order is finished, but it did not finish well. */
export function isCancelled(order: Pick<Order, "state">): boolean {
  return order.state === "cancelled";
}
