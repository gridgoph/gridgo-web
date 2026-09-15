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
  {
    id: "qa",
    label: "Quality check",
    hint: "Artwork and specification need checking before a shop sees them.",
  },
  {
    id: "production",
    label: "With the shop",
    hint: "Accepted and being printed. Nothing for you to do.",
  },
  {
    id: "delivery",
    label: "Delivery",
    hint: "On its way, or waiting out the issue window.",
  },
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
  // On our own counter, still travelling as far as the pipeline is concerned:
  // it is not done until the client has it.
  awaiting_collection: "delivery",
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
  const counts: Record<Stage, number> = {
    payment: 0,
    qa: 0,
    production: 0,
    delivery: 0,
    done: 0,
  };
  for (const order of orders) counts[stageOf(order)] += 1;
  return counts;
}

/** How many orders in this stage are actually waiting on Operations. */
export function actionableCount(orders: readonly Order[], stage: Stage): number {
  return orders.filter((order) => stageOf(order) === stage && stageNeedsOperations(order))
    .length;
}

/**
 * How many orders, across every stage, are waiting on Operations right now.
 *
 * This is the number on the rail's Orders pill. It is the same test the queue
 * emphasises per stage, summed, so the pill and the page never disagree about
 * what "waiting on you" means: a transfer to confirm or artwork to check, never
 * a job that is with a shop, a rider or a clock.
 */
export function waitingOnOperationsCount(orders: readonly Order[]): number {
  return orders.filter((order) => stageNeedsOperations(order)).length;
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

// ---------------------------------------------------------------------------
// One line per step, readable with the step closed
// ---------------------------------------------------------------------------

/**
 * What a closed step should still tell Operations: the outcome if it is
 * behind, the wait if it is ahead, the ask if it is now. Short, plain, and
 * specific to this order — the step's generic hint is the fallback, not the
 * summary.
 */
export function stageSummary(
  order: Pick<
    Order,
    | "state"
    | "payments"
    | "totalMinor"
    | "timeline"
    | "payoutMilestones"
    | "deliveryEvidence"
    | "pickupChecklist"
    | "issueWindowExpiresAt"
    | "readyAt"
    | "cancelledAt"
  >,
  stage: Exclude<Stage, "done">,
  formatMoney: (minor: number) => string,
  formatWhen: (iso: string) => string,
): string {
  const current = stageOf(order);
  const currentIndex = STAGES.findIndex((entry) => entry.id === current);
  const index = STAGES.findIndex((entry) => entry.id === stage);
  const status: StepStatus =
    index < currentIndex ? "done" : index === currentIndex ? "current" : "locked";

  if (stage === "payment") {
    const downpayment = paymentOf(order, "downpayment");
    const balance = paymentOf(order, "balance");
    const settled = (record: { status: string } | undefined) =>
      record?.status === "confirmed" || record?.status === "legacy_confirmed";
    if (!downpayment && !balance) return "No payment set up yet.";
    if (downpayment?.status === "pending_confirmation") {
      return `Downpayment of ${formatMoney(downpayment.amountMinor)} is waiting on you.`;
    }
    if (balance?.status === "pending_confirmation") {
      return `Balance of ${formatMoney(balance.amountMinor)} is waiting on you.`;
    }
    if (settled(downpayment) && (!balance || settled(balance))) {
      return `Paid in full, ${formatMoney(order.totalMinor)} in.`;
    }
    if (settled(downpayment) && balance) {
      return `Downpayment in. Balance of ${formatMoney(balance.amountMinor)} not sent yet.`;
    }
    if (downpayment) {
      return `Downpayment of ${formatMoney(downpayment.amountMinor)} not sent yet.`;
    }
    return "Waiting on the client.";
  }

  if (stage === "qa") {
    if (order.state === "client_correction")
      return "Sent back to the client for changes.";
    if (order.state === "proof_approval")
      return "Artwork is with the client for approval.";
    if (status === "current") return "Four checks, then approve or send it back.";
    if (status === "locked") return "Opens once the payment is confirmed.";
    const approved = [...(order.timeline ?? [])]
      .reverse()
      .find(
        (entry) =>
          entry.state === "supplier_assigned" || entry.state === "approved_for_matching",
      );
    return approved
      ? `Approved ${formatWhen(approved.at)}.`
      : "Approved and sent to the shop.";
  }

  if (stage === "production") {
    const proofs = (order.payoutMilestones ?? []).filter(
      (m) =>
        (m.code === "printing" || m.code === "packaging_qc") && m.pofFileIds.length > 0,
    );
    const filed =
      proofs.length === 0
        ? null
        : `${proofs.length === 1 ? "One proof" : `${proofs.length} proofs`} on file from the shop.`;
    if (status === "locked") return "Opens once the artwork is approved.";
    if (order.state === "supplier_assigned")
      return "Waiting for the shop to accept the job.";
    if (order.state === "payment_authorized")
      return "Shop has accepted. Printing starts next.";
    if (order.state === "production") return filed ?? "Being printed now.";
    if (order.state === "supplier_self_qc")
      return filed ?? "Packing at the shop (older flow).";
    if (order.state === "ready_for_dispatch")
      return (
        filed ??
        "Packed and waiting for a rider. Supplier and rider check it together at pickup."
      );
    if (status === "done") {
      const handed = order.readyAt
        ? `Handed over ${formatWhen(order.readyAt)}.`
        : "Handed over to a rider.";
      return filed ? `${handed} ${filed}` : handed;
    }
    return filed ?? "With the shop.";
  }

  // delivery
  if (status === "locked") return "Opens once the shop hands the job to a rider.";
  if (order.deliveryEvidence) {
    const when = formatWhen(order.deliveryEvidence.recordedAt);
    if (order.state === "issue_window_open" && order.issueWindowExpiresAt) {
      return `Delivered ${when}. The client can report an issue until ${formatWhen(order.issueWindowExpiresAt)}.`;
    }
    return `Delivered ${when}. Photo on file.`;
  }
  if (order.state === "rider_assigned") return "Rider assigned, not yet picked up.";
  if (order.state === "picked_up" || order.state === "out_for_delivery") {
    return order.pickupChecklist?.status === "passed"
      ? "Picked up with all six checks passed. On its way."
      : "On its way.";
  }
  if (order.state === "awaiting_collection")
    return "Waiting at the counter for the client.";
  if (status === "done") return "Delivered.";
  return "Waiting on a rider.";
}
