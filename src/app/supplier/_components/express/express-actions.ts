import { ApiError, getOrder, transitionOrder } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { stepRefusal } from "@/lib/packaging-readiness";
import {
  EXPRESS_STEP_NOTE,
  expressReadySteps,
  readyNeedsTwoSteps,
} from "@/lib/express-shop";

export type ReadyResult =
  | { kind: "ready"; order: Order }
  /** GRIDGO wants something first (a photo or its own check): open the job. */
  | { kind: "needs_step"; message: string }
  | { kind: "failed"; message: string };

const NEEDS_STEP = new Set([
  "production_photo_required",
  "production_finished_required",
  "packing_photo_required",
  "finished_product_review_required",
  "finished_product_photo_required",
]);

function readyError(error: unknown): ReadyResult {
  const refusal = stepRefusal(error);
  if (
    (error instanceof ApiError && NEEDS_STEP.has(error.code)) ||
    (refusal && refusal.missing.length > 0)
  ) {
    return {
      kind: "needs_step",
      message: refusal?.message
        ? `${refusal.message} Open the job to do it.`
        : "GRIDGO needs one more step before this job is ready. Open the job to do it.",
    };
  }
  if (error instanceof ApiError && error.code === "claim_hold_active") {
    return {
      kind: "failed",
      message: "A claim is holding this order. Operations must clear it first.",
    };
  }
  if (error instanceof ApiError && error.code === "transition_not_allowed") {
    return {
      kind: "failed",
      message: "This job has moved on. The page now shows where it stands.",
    };
  }
  return { kind: "failed", message: "It's ready did not reach GRIDGO. Try again." };
}

/**
 * It's ready: one step straight to ready (gridgo-api#419). An API without that
 * refuses the jump, so the shop's two steps (on the press, then ready) are
 * sent instead.
 */
export async function markExpressReady(order: Order): Promise<ReadyResult> {
  try {
    let current = order;
    for (const state of expressReadySteps(order, true)) {
      current = await transitionOrder(order.id, state, { note: EXPRESS_STEP_NOTE[state] });
    }
    return { kind: "ready", order: current };
  } catch (error) {
    if (!readyNeedsTwoSteps(error)) return readyError(error);
  }
  try {
    const fresh = await getOrder(order.id);
    let current = fresh;
    for (const state of expressReadySteps(fresh, false)) {
      current = await transitionOrder(order.id, state, { note: EXPRESS_STEP_NOTE[state] });
    }
    return { kind: "ready", order: current };
  } catch (error) {
    return readyError(error);
  }
}

/** The words for a refused Accept. */
export function acceptErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "shop_acceptance_expired":
      case "express_acceptance_not_pending":
        return "The five minutes ran out, so GRIDGO sent this job to another shop.";
      case "special_instructions_read_required":
        return "Tick that you read the client's note, then accept.";
      case "supplier_not_approved":
      case "verification_not_approved":
        return "Your shop is still waiting for approval, so it cannot take jobs yet.";
    }
  }
  return "Accept did not reach GRIDGO. Try again.";
}
