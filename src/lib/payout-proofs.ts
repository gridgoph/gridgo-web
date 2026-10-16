/**
 * Proof pictures behind a payout stage, and the rules for a shop adding more.
 *
 * Contract: "Payout proofs" in gridgo-api `docs/OPERATIONAL_MODEL_V2_API.md`
 * (gridgo-api#254). The API lists each picture once in `pofFileIds`, in the
 * order it was first filed, for every role that sees the stages: a repeat of
 * the same bytes, such as a retried filing or the rider app's second copy of
 * its delivery capture, attaches to the order but is never listed again. A
 * shop files as many pictures as it wants on its own stages, before or after
 * release, up to 50 distinct pictures per stage (`409 proof_limit_reached`
 * past that; a repeat never counts). Release still needs only one.
 *
 * The rider's delivered stage is the rider's: the shop reads it, never adds
 * to it. Pure functions: no React, no fetch.
 */

import { isApiError } from "@/lib/api/client";
import type { Order, PayoutMilestone } from "@/lib/api/types";
import { orderHasRefundHold } from "@/lib/api/constraints";
import { releaseRequirementOf, shopProofStages } from "@/lib/payout-plan";

/** The API's `MAX_PROOFS_PER_MILESTONE`; `details.maxProofs` wins when sent. */
export const MAX_PROOFS_PER_STAGE = 50;

/** The stage's proof ids, each once, in the API's order. */
export function stageProofIds(
  milestone: Pick<PayoutMilestone, "pofFileIds"> | null | undefined,
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of milestone?.pofFileIds ?? []) {
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** "No proof on file", "1 proof on file", "27 proofs on file". */
export function proofCountLabel(count: number): string {
  if (count <= 0) return "No proof on file";
  return count === 1 ? "1 proof on file" : `${count} proofs on file`;
}

/** Every picture filed on the shop's own stages, for galleries that would repeat them. */
export function shopProofFileIds(order: Pick<Order, "payoutMilestones">): Set<string> {
  return new Set(shopProofStages(order).flatMap((stage) => stageProofIds(stage)));
}

/** States where the shop has a job on its floor or behind it to photograph. */
const PROOF_STATES = new Set([
  "production",
  "supplier_self_qc",
  "ready_for_dispatch",
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
  "awaiting_collection",
  "delivered",
  "issue_window_open",
  "completed",
  "payout_released",
]);

export type ShopProofAccess =
  | { allowed: true; remaining: number }
  | { allowed: false; reason: string | null };

export const PROOF_LIMIT_COPY = (max: number) =>
  `This stage has ${max} proof photos, the most it takes. If the GRIDGO Team needs more, they will ask.`;

const REFUND_STOP_COPY =
  "This order is stopped for a refund, so no more proof can be added until the GRIDGO Team resolves it.";

/**
 * Whether the shop may add proof to this stage now. Only a stage that waits
 * on the shop's own proof; never the rider's delivered stage or the window
 * share. Released stages still take more. A refund stop, or a full stage,
 * says why; a stage that is simply not the shop's says nothing (null).
 */
export function shopProofAccess(
  order: Pick<Order, "state"> & Partial<Pick<Order, "refundHold">>,
  milestone: Pick<PayoutMilestone, "code" | "status" | "pofFileIds"> &
    Partial<Pick<PayoutMilestone, "releaseRequires">>,
): ShopProofAccess {
  if (releaseRequirementOf(milestone) !== "shop_proof") return { allowed: false, reason: null };
  if (milestone.status === "superseded") return { allowed: false, reason: null };
  if (!PROOF_STATES.has(order.state)) return { allowed: false, reason: null };
  if (orderHasRefundHold(order)) return { allowed: false, reason: REFUND_STOP_COPY };
  const remaining = MAX_PROOFS_PER_STAGE - stageProofIds(milestone).length;
  if (remaining <= 0) {
    return { allowed: false, reason: PROOF_LIMIT_COPY(MAX_PROOFS_PER_STAGE) };
  }
  return { allowed: true, remaining };
}

/**
 * What one attach did to the stage. The API answers `200` for a repeat too,
 * so the stage's list says whether the picture was new: a repeat leaves the
 * count where it was and never lists the new upload.
 */
export function filingOutcome(
  before: readonly string[],
  after: readonly string[],
  fileId: string,
): "filed" | "repeat" {
  if (after.includes(fileId)) return "filed";
  return after.length > before.length ? "filed" : "repeat";
}

export const REPEAT_COPY =
  "Already on file. It is the same picture as one this stage has, so it is not added twice.";

/** Why one proof could not be filed, in words a shop can act on. */
export function proofFilingError(err: unknown): string {
  if (!isApiError(err)) {
    return "The connection dropped, so this photo was not filed. Try again.";
  }
  switch (err.code) {
    case "proof_limit_reached": {
      const max = err.detail<number>("maxProofs");
      return PROOF_LIMIT_COPY(
        typeof max === "number" && Number.isFinite(max) && max > 0 ? max : MAX_PROOFS_PER_STAGE,
      );
    }
    case "refund_fulfillment_stopped":
      return REFUND_STOP_COPY;
    case "reschedule_fulfillment_stopped":
      return "This order is waiting on a deadline decision, so nothing can be filed until the GRIDGO Team settles it.";
    case "shop_recovery_pending":
      return "This order is waiting on the GRIDGO Team to settle a shop change, so nothing can be filed yet.";
    case "invalid_milestone_code":
    case "milestone_not_found":
      return "This stage no longer takes proof. Refresh the job to see where it stands.";
    case "file_already_attached":
      return "This upload is already filed. Choose the photo again to file a new copy.";
    case "file_not_ready":
    case "file_metadata_invalid":
    case "storage_object_mismatch":
      return "The upload did not finish properly. Choose the photo again.";
    default:
      if (err.kind === "unauthorized") return "Your session expired. Sign in again, then file.";
      if (err.kind === "forbidden") return "This account cannot file proof for this job.";
      if (err.status >= 500) return "The server could not file this photo just now. Try again in a minute.";
      return "This photo was not filed. Try again.";
  }
}
