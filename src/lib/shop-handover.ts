/**
 * The shop-to-rider handover, and GRIDGO's review of the finished work.
 *
 * Contract: `gridgo-api/docs/SHOP_HANDOVER_API.md` (report 6C695C15,
 * gridgo-api#216). An order snapshots one of two flows, sent as
 * `handoverFlow`:
 *
 * - `rider_packs` (new commitments): the shop photographs the finished,
 *   unpacked products and submits them (`production` → `supplier_self_qc`).
 *   Operations or Super Admin approves them or sends them back with a reason
 *   the shop reads. Only after approval can the shop call a rider, and it
 *   prepares packing materials without packing. The rider checks the unpacked
 *   items, packs them in front of the shop, photographs the packed job, and
 *   takes the shop's signature, which moves custody. The shop's production
 *   clock does not run while GRIDGO reviews.
 * - `legacy`: the shop's own progress photo, its own packing photo, ready for
 *   dispatch, then the counter check and signature.
 *
 * Forced steps (a staff correction out of production) need a reason code and
 * a note for both flows; the order carries each one in `forcedSteps`.
 *
 * An API that predates the field sends no `handoverFlow`. Every helper then
 * answers "unknown" and the screens keep their older behaviour.
 *
 * Pure functions: no React, no fetch.
 */

import type {
  FinishedAttempt,
  FinishedReview,
  FinishedSubmission,
  ForcedStep,
  HandoverFlow,
  Order,
  ProductionPhoto,
} from "@/lib/api/types";
import {
  presentOrderState,
  type StatePresentation,
  type StatusIconName,
  type StatusTone,
} from "@/lib/order-state";

type FlowSource = Partial<Pick<Order, "handoverFlow">>;

/** The order's flow, or null on an API that does not say. */
export function handoverFlowOf(order: FlowSource): HandoverFlow | null {
  return order.handoverFlow === "rider_packs" || order.handoverFlow === "legacy"
    ? order.handoverFlow
    : null;
}

export function ridersPack(order: FlowSource): boolean {
  return handoverFlowOf(order) === "rider_packs";
}

// ---------------------------------------------------------------------------
// The finished-work review
// ---------------------------------------------------------------------------

type ReviewSource = FlowSource &
  Pick<Order, "state"> &
  Partial<Pick<Order, "shopHandover" | "supplierId">>;

/** The submission the shop has open now, if it is this shop's. */
export function currentSubmission(order: ReviewSource): FinishedSubmission | null {
  const finished = order.shopHandover?.finished;
  if (!finished || !Array.isArray(finished.photoFileIds)) return null;
  if (
    order.supplierId &&
    finished.supplierId &&
    finished.supplierId !== order.supplierId
  ) {
    return null;
  }
  return finished;
}

/** Every reviewed submission, oldest first. */
export function reviewAttempts(order: ReviewSource): FinishedAttempt[] {
  const attempts = order.shopHandover?.attempts;
  if (!Array.isArray(attempts)) return [];
  return attempts
    .filter((attempt) => attempt?.finished && attempt.review)
    .slice()
    .sort((a, b) => a.review.at.localeCompare(b.review.at));
}

/** The send-backs on this order, oldest first. */
export function sentBackAttempts(order: ReviewSource): FinishedAttempt[] {
  return reviewAttempts(order).filter(
    (attempt) => attempt.review.decision === "rejected",
  );
}

export type FinishedReviewStatus =
  /** Still printing; nothing submitted yet. */
  | "not_submitted"
  /** Submitted and waiting on GRIDGO. */
  | "pending"
  /** GRIDGO approved; the shop may call a rider. */
  | "approved"
  /** GRIDGO sent it back; the shop is redoing it. */
  | "sent_back"
  /** The order left production without a review (a forced step, or a recovery). */
  | "skipped";

const BEFORE_PRODUCTION = new Set([
  "draft",
  "submitted",
  "needs_qa",
  "client_correction",
  "proof_approval",
  "approved_for_matching",
  "supplier_assigned",
  "supplier_accepted",
  "awaiting_checkout",
  "awaiting_initial_payment",
  "awaiting_downpayment",
  "initial_payment_review",
  "downpayment_review",
  "payment_authorized",
]);

/** Where the finished-work review stands, or null when the flow has none. */
export function finishedReviewStatus(order: ReviewSource): FinishedReviewStatus | null {
  if (!ridersPack(order)) return null;
  const submission = currentSubmission(order);
  const review = order.shopHandover?.review ?? null;
  if (submission && review?.decision === "approved") return "approved";
  if (submission && !review && order.state === "supplier_self_qc") return "pending";
  if (BEFORE_PRODUCTION.has(order.state) || order.state === "production") {
    return sentBackAttempts(order).length > 0 && !submission
      ? "sent_back"
      : "not_submitted";
  }
  if (order.state === "cancelled") return null;
  return submission && review?.decision === "approved" ? "approved" : "skipped";
}

/** True when GRIDGO's review is the one thing this order is waiting for. */
export function awaitingFinishedReview(order: ReviewSource): boolean {
  return finishedReviewStatus(order) === "pending";
}

/** The answer GRIDGO gave the current submission, or the last one. */
export function latestReview(order: ReviewSource): FinishedReview | null {
  return order.shopHandover?.review ?? reviewAttempts(order).at(-1)?.review ?? null;
}

/**
 * The finished photos of a submission, matched to the signed photos the
 * order carries. A photo the order did not sign for this reader keeps its
 * id, and the gallery fetches its link itself.
 */
export function submissionPhotos(
  submission: Pick<FinishedSubmission, "photoFileIds" | "at"> | null | undefined,
  order: Partial<Pick<Order, "productionProgress">>,
): ProductionPhoto[] {
  if (!submission) return [];
  const signed = new Map(
    (order.productionProgress?.photos ?? []).map((photo) => [photo.fileId, photo]),
  );
  return submission.photoFileIds.map(
    (fileId) =>
      signed.get(fileId) ?? { fileId, contentType: "image/jpeg", at: submission.at },
  );
}

/** "1 photo", "3 photos". */
export function photoCount(count: number): string {
  return count === 1 ? "1 photo" : `${count} photos`;
}

/** "First try", "Second try", … as the shop has submitted it. */
export function attemptLabel(attemptNumber: number): string {
  const words = ["First", "Second", "Third", "Fourth", "Fifth"];
  return attemptNumber <= words.length
    ? `${words[attemptNumber - 1]} try`
    : `Try ${attemptNumber}`;
}

/** Which try the open submission is: one more than the send-backs before it. */
export function submissionNumber(order: ReviewSource): number {
  return sentBackAttempts(order).length + 1;
}

/**
 * What a reviewer compares before approving. A review aid, never sent: the
 * API takes only the decision (and the reason when sent back).
 */
export const FINISHED_REVIEW_CHECKS = [
  {
    id: "every_line",
    label: "Every item on the order is in the photos",
    hint: "Each line, unpacked, so the quantity can be judged.",
  },
  {
    id: "specification",
    label: "It matches the specification",
    hint: "Size, material, finish and the client's artwork.",
  },
  {
    id: "no_defects",
    label: "No visible defects",
    hint: "No smudges, misprints, bad cuts, colour shifts or damage.",
  },
] as const;

export type FinishedReviewCheckId = (typeof FINISHED_REVIEW_CHECKS)[number]["id"];

/** Ready-made reasons; each stays editable and the shop reads exactly what is sent. */
export const FINISHED_SEND_BACK_REASONS = [
  "Some items are missing from the photos. Photograph every item, unpacked, so we can check the quantity.",
  "The photos are too dark or blurry to check. Retake them in good light, close enough to see the print.",
  "The print does not match the client's artwork. Reprint the affected items and send new photos.",
  "Some items are damaged or misprinted. Reprint those items and send new photos of the full run.",
] as const;

/** The API keeps at most this much of a send-back reason. */
export const FINISHED_SEND_BACK_MAX = 2000;

/** The pending reviews, oldest submission first: the longest wait leads. */
export function finishedReviewQueue<T extends ReviewSource>(orders: readonly T[]): T[] {
  return orders
    .filter((order) => awaitingFinishedReview(order))
    .sort((a, b) =>
      (currentSubmission(a)?.at ?? "").localeCompare(currentSubmission(b)?.at ?? ""),
    );
}

/** Sent back and not resubmitted, the latest send-back first. */
export function sentBackQueue<T extends ReviewSource>(orders: readonly T[]): T[] {
  return orders
    .filter((order) => finishedReviewStatus(order) === "sent_back")
    .sort((a, b) =>
      (sentBackAttempts(b).at(-1)?.review.at ?? "").localeCompare(
        sentBackAttempts(a).at(-1)?.review.at ?? "",
      ),
    );
}

/** Approved, the latest approval first. */
export function approvedQueue<T extends ReviewSource>(orders: readonly T[]): T[] {
  return orders
    .filter((order) => finishedReviewStatus(order) === "approved")
    .sort((a, b) =>
      (b.shopHandover?.review?.at ?? "").localeCompare(a.shopHandover?.review?.at ?? ""),
    );
}

/** The rail's number: orders that cannot move until GRIDGO reviews them. */
export function finishedReviewWaitingCount(orders: readonly ReviewSource[]): number {
  return orders.filter((order) => awaitingFinishedReview(order)).length;
}

/** Seconds the open submission has waited, on the reader's clock. */
export function submissionWaitSeconds(order: ReviewSource, nowMs = Date.now()): number {
  const at = Date.parse(currentSubmission(order)?.at ?? "");
  return Number.isFinite(at) ? Math.max(0, Math.floor((nowMs - at) / 1000)) : 0;
}

// ---------------------------------------------------------------------------
// The shop's side of the review
// ---------------------------------------------------------------------------

/** What the shop is told wherever a rider is called on a rider-packs job. */
export const DO_NOT_PACK_YET =
  "Prepare packing materials. Do not pack yet; the rider checks the unpacked items first.";

/**
 * Where the finished work stands for the shop, while the job is still its to
 * finish (the same four stages as gridgo-supplier `lib/shopHandover.ts`):
 *
 * - `to_send`: photograph the finished, unpacked work and send it. When the
 *   last try was sent back, `sendBack` is GRIDGO's answer, read word for word.
 * - `in_review`: GRIDGO is checking it. Nothing is the shop's to do.
 * - `approved`: the shop can mark the job ready for rider pickup.
 * - `with_gridgo`: a staff correction moved the job on with nothing of this
 *   shop's to review; the GRIDGO Team takes the next step.
 */
export type ShopFinishedStep =
  | { stage: "to_send"; sendBack: FinishedReview | null }
  | { stage: "in_review"; submission: FinishedSubmission }
  | { stage: "approved"; submission: FinishedSubmission; review: FinishedReview }
  | { stage: "with_gridgo" };

type ShopStepSource = ReviewSource & Partial<Pick<Order, "supplierId">>;

/** This shop's reviewed tries, oldest first: a replacement never reads another shop's. */
function ownAttempts(order: ShopStepSource): FinishedAttempt[] {
  return reviewAttempts(order).filter(
    (attempt) =>
      !order.supplierId ||
      !attempt.finished.supplierId ||
      attempt.finished.supplierId === order.supplierId,
  );
}

/** The shop's step on the finished work, or null outside a rider-packs production. */
export function shopFinishedStep(order: ShopStepSource): ShopFinishedStep | null {
  if (!ridersPack(order)) return null;
  if (order.state === "production") {
    const last = ownAttempts(order).at(-1);
    return {
      stage: "to_send",
      sendBack: last?.review.decision === "rejected" ? last.review : null,
    };
  }
  if (order.state !== "supplier_self_qc") return null;
  const submission = currentSubmission(order);
  const review = order.shopHandover?.review ?? null;
  if (!submission) return { stage: "with_gridgo" };
  if (!review) return { stage: "in_review", submission };
  if (review.decision === "approved") return { stage: "approved", submission, review };
  return { stage: "with_gridgo" };
}

/**
 * The shop's status chip where the state alone says the wrong thing on a
 * rider-packs job: `supplier_self_qc` is GRIDGO's review there, not packing.
 * Null where the ordinary state label is right.
 */
export function shopHandoverChip(
  order: ShopStepSource,
): { label: string; tone: StatusTone; icon: StatusIconName } | null {
  const step = shopFinishedStep(order);
  if (step?.stage === "to_send" && step.sendBack) {
    return { label: "Needs a fix", tone: "warning", icon: "triangle-alert" };
  }
  if (step?.stage === "in_review") {
    return { label: "GRIDGO reviewing", tone: "info", icon: "clock" };
  }
  if (step?.stage === "with_gridgo") {
    return { label: "With GRIDGO", tone: "info", icon: "clock" };
  }
  if (step?.stage === "approved") {
    return { label: "Approved", tone: "success", icon: "circle-check" };
  }
  if (ridersPack(order) && order.state === "ready_for_dispatch") {
    return { label: "Ready for rider pickup", tone: "success", icon: "circle-check" };
  }
  return null;
}

/**
 * A state on the shop's timeline, in the shop's words. On a rider-packs job
 * the two packing states are GRIDGO's review and waiting for a rider. An
 * entry records the moment it was made, so it is read by its state alone,
 * never by where the review stands now.
 */
export function shopTimelineState(
  order: FlowSource & Parameters<typeof presentOrderState>[1],
  state: string,
): StatePresentation {
  if (ridersPack(order ?? {})) {
    if (state === "supplier_self_qc") {
      return { label: "GRIDGO review", tone: "info", icon: "clock" };
    }
    if (state === "ready_for_dispatch") {
      return { label: "Ready for rider pickup", tone: "success", icon: "circle-check" };
    }
  }
  return presentOrderState(state, order);
}

// ---------------------------------------------------------------------------
// Forced steps
// ---------------------------------------------------------------------------

/** The reason codes the API accepts today, in its order. */
export const FORCED_STEP_REASON_CODES = [
  "technical_issue",
  "evidence_verified_offline",
  "operational_correction",
  "other",
] as const;

const FORCED_REASON_LABELS: Record<string, { label: string; hint: string }> = {
  technical_issue: {
    label: "Technical issue",
    hint: "The app or an upload failed, and the shop could not finish the step.",
  },
  evidence_verified_offline: {
    label: "Checked outside the app",
    hint: "Someone at GRIDGO saw the finished work in person or through another channel.",
  },
  operational_correction: {
    label: "Correcting the record",
    hint: "The order is in the wrong step and needs to be put right.",
  },
  other: {
    label: "Something else",
    hint: "Explain it fully in the note.",
  },
};

/** The codes to offer: what this order's API says, else the known four. */
export function forcedReasonCodes(
  order: Partial<Pick<Order, "forcedStepReasonCodes">>,
): string[] {
  const offered = order.forcedStepReasonCodes;
  return Array.isArray(offered) && offered.length
    ? offered.filter((code) => typeof code === "string" && code)
    : [...FORCED_STEP_REASON_CODES];
}

export function forcedReasonLabel(code: string): string {
  return FORCED_REASON_LABELS[code]?.label ?? "Other reason";
}

export function forcedReasonHint(code: string): string | null {
  return FORCED_REASON_LABELS[code]?.hint ?? null;
}

/** The note the API keeps with a forced step, at most. */
export const FORCED_NOTE_MAX = 2000;

const SKIPPED_CHECK_LABELS: Record<string, string> = {
  production_finished_required: "The shop's finished-product photos",
  finished_product_photo_required: "The finished-product photos still on file",
  production_review_required: "GRIDGO's review of the finished work",
  production_photo_required: "A progress photo from the shop",
  packing_photo_required: "The shop's packing photo",
};

/** A skipped check in words. A code this portal does not know yet still reads as a sentence. */
export function skippedCheckLabel(code: string): string {
  return SKIPPED_CHECK_LABELS[code] ?? "Another check the shop had not finished";
}

/** What a force would go past now, from the readiness the API sent this read. */
export function checksAForceSkips(
  order: Partial<Pick<Order, "transitionReadiness">>,
  next: "supplier_self_qc" | "ready_for_dispatch" = "ready_for_dispatch",
): string[] {
  const missing = order.transitionReadiness?.[next]?.missing ?? [];
  return missing.map((item) => item.code).filter((code) => code in SKIPPED_CHECK_LABELS);
}

/** The forced steps on the order, oldest first. */
export function forcedSteps(order: Partial<Pick<Order, "forcedSteps">>): ForcedStep[] {
  const steps = order.forcedSteps;
  if (!Array.isArray(steps)) return [];
  return steps
    .filter((step) => step && step.at)
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** True when any production step on this order was forced. */
export function forcedByGridgo(
  order: Partial<Pick<Order, "forcedByGridgo" | "forcedSteps">>,
): boolean {
  return order.forcedByGridgo === true || forcedSteps(order).length > 0;
}

/**
 * The closed line for a forced order: what the latest force went past, in
 * words. The rider's own checks are never skipped, so the rider-packs line
 * says they still happen.
 */
export function forcedSummary(
  order: Partial<Pick<Order, "forcedByGridgo" | "forcedSteps" | "handoverFlow">>,
): string {
  const skipped = forcedSteps(order).at(-1)?.skippedChecks ?? [];
  const words = skipped.map((code) => {
    const label = skippedCheckLabel(code);
    return label.startsWith("GRIDGO")
      ? label
      : label.charAt(0).toLowerCase() + label.slice(1);
  });
  const head = words.length
    ? `${FORCED_BY_GRIDGO}, skipping ${words.join(" and ")}.`
    : `${FORCED_BY_GRIDGO}.`;
  return ridersPack(order)
    ? `${head} The rider still checks the unpacked items and packs them in front of the shop.`
    : head;
}

/** The one wording every app uses for a forced order. */
export const FORCED_BY_GRIDGO = "Forced by GRIDGO";

// ---------------------------------------------------------------------------
// The handover, as a sequence of steps
// ---------------------------------------------------------------------------

export type HandoverStepStatus =
  "done" | "current" | "upcoming" | "forced" | "not_recorded";

export type HandoverStep = {
  id: string;
  label: string;
  status: HandoverStepStatus;
  /** When it happened, if it did. */
  at: string | null;
  /** One plain line under the label. */
  detail: string | null;
};

const STATE_RANK: Record<string, number> = {
  production: 0,
  supplier_self_qc: 1,
  ready_for_dispatch: 2,
  rider_assigned: 3,
  picked_up: 4,
  out_for_delivery: 4,
  awaiting_collection: 4,
  delivered: 4,
  issue_window_open: 4,
  completed: 4,
  payout_released: 4,
};

function rank(state: string): number {
  return STATE_RANK[state] ?? (BEFORE_PRODUCTION.has(state) ? -1 : -2);
}

type StepSource = ReviewSource &
  Partial<
    Pick<
      Order,
      | "pickupChecklist"
      | "productionProgress"
      | "packingProgress"
      | "readyAt"
      | "forcedSteps"
      | "forcedByGridgo"
      | "timeline"
    >
  >;

/** The time the order first reached a state, from its own history. */
function reachedAt(order: StepSource, states: readonly string[]): string | null {
  const entry = (order.timeline ?? [])
    .filter((item) => states.includes(item.state))
    .sort((a, b) => a.at.localeCompare(b.at))[0];
  return entry?.at ?? null;
}

/** The forced step that went past `state`, if one did. */
function forcedPast(order: StepSource, toRank: number): ForcedStep | null {
  return (
    forcedSteps(order).find(
      (step) => rank(step.from) < toRank && rank(step.to) >= toRank,
    ) ?? null
  );
}

/**
 * Each step the handover has, in the order it happens. Behind the order's
 * position a step is done, forced (passed by a staff correction) or not on
 * record; at the position it is current; ahead it is upcoming.
 */
export function handoverSteps(
  order: StepSource,
  formatWhen: (iso: string) => string,
  reader: "staff" | "shop" = "staff",
): HandoverStep[] {
  const flow = handoverFlowOf(order);
  if (!flow) return [];
  return flow === "rider_packs"
    ? riderPacksSteps(order, formatWhen, reader)
    : legacySteps(order);
}

function passedStatus(order: StepSource, toRank: number): HandoverStepStatus {
  return forcedPast(order, toRank) ? "forced" : "not_recorded";
}

function riderPacksSteps(
  order: StepSource,
  formatWhen: (iso: string) => string,
  reader: "staff" | "shop" = "staff",
): HandoverStep[] {
  const at = rank(order.state);
  const submission = currentSubmission(order);
  const review = order.shopHandover?.review ?? null;
  const backs = sentBackAttempts(order);
  const status = finishedReviewStatus(order);
  const checklist = order.pickupChecklist;
  const inspection =
    checklist?.status === "inspected" ||
    (checklist?.status === "passed" && checklist.inspectionId)
      ? checklist
      : null;
  const inspectedAt =
    checklist?.status === "inspected"
      ? checklist.completedAt
      : (checklist?.inspectedAt ?? null);
  const inspectionId = inspection?.inspectionId ?? null;
  const packing = (order.shopHandover?.packingPhotos ?? []).filter(
    (photo) => inspectionId && photo.inspectionId === inspectionId,
  );
  const packedIds = checklist?.packedPhotoFileIds ?? packing.map((photo) => photo.fileId);
  const signature =
    checklist?.status === "passed" ? (checklist.handoffSignature ?? null) : null;
  const arrivedPacked = order.shopHandover?.arrivedPacked ?? [];

  const lastBack = backs.at(-1);
  const sent: HandoverStep = {
    id: "finished_sent",
    label: "Shop sends photos of the finished, unpacked work",
    status: submission
      ? "done"
      : at > 0
        ? passedStatus(order, 1)
        : at === 0
          ? "current"
          : "upcoming",
    at: submission?.at ?? null,
    detail: submission
      ? `${photoCount(submission.photoFileIds.length)}, ${attemptLabel(submissionNumber(order)).toLowerCase()}.`
      : status === "sent_back" && lastBack
        ? `Sent back ${formatWhen(lastBack.review.at)}. Waiting for new photos.`
        : at === 0
          ? "Still being printed."
          : null,
  };

  const reviewed: HandoverStep = {
    id: "gridgo_review",
    label: "GRIDGO reviews the finished work",
    status:
      status === "approved"
        ? "done"
        : status === "pending"
          ? "current"
          : at >= 2
            ? passedStatus(order, 2)
            : "upcoming",
    at: status === "approved" ? (review?.at ?? null) : null,
    detail:
      status === "approved"
        ? "Approved. The shop's production clock stopped when the photos were sent."
        : status === "pending"
          ? reader === "shop"
            ? "GRIDGO is reviewing these photos. Your production time is paused."
            : "Waiting on you. The shop's production clock is paused meanwhile."
          : backs.length
            ? `Sent back ${backs.length === 1 ? "once" : `${backs.length} times`}.`
            : null,
  };

  const ready: HandoverStep = {
    id: "ready",
    label: "Ready for rider pickup",
    status: at >= 2 ? "done" : "upcoming",
    at: at >= 2 ? (order.readyAt ?? reachedAt(order, ["ready_for_dispatch"])) : null,
    detail:
      at === 2 ? "The shop prepares packing materials and does not pack yet." : null,
  };

  const checked: HandoverStep = {
    id: "unpacked_check",
    label: "Rider checks the unpacked items",
    status: inspection
      ? "done"
      : at === 3
        ? "current"
        : at > 3
          ? "not_recorded"
          : "upcoming",
    at: inspectedAt,
    detail: arrivedPacked.length
      ? `The shop presented it already packed (${formatWhen(arrivedPacked[0].at)}); the rider had it unpacked first.`
      : inspection
        ? "Count, specification, defects and paperwork checked on the unpacked products."
        : null,
  };

  const packed: HandoverStep = {
    id: "packed",
    label: "Packed in front of the rider",
    status: packedIds.length
      ? "done"
      : inspection && at === 3
        ? "current"
        : at > 3
          ? "not_recorded"
          : "upcoming",
    at: packing.at(-1)?.at ?? null,
    detail: packedIds.length
      ? `${photoCount(packedIds.length)} of the packed job, from the rider.`
      : null,
  };

  const signed: HandoverStep = {
    id: "signed",
    label: "Shop signs; the rider takes it",
    status: signature
      ? "done"
      : at > 3
        ? "not_recorded"
        : packedIds.length && at === 3
          ? "current"
          : "upcoming",
    at: signature?.signedAt ?? null,
    detail: signature?.signerName ? `Signed by ${signature.signerName}.` : null,
  };

  return [sent, reviewed, ready, checked, packed, signed];
}

function legacySteps(order: StepSource): HandoverStep[] {
  const at = rank(order.state);
  const progress = order.productionProgress?.photos ?? null;
  const packing = order.packingProgress?.photos ?? null;
  const checklist = order.pickupChecklist;
  const signature =
    checklist?.status === "passed" ? (checklist.handoffSignature ?? null) : null;

  const photo = progress?.[0] ?? null;
  const packedPhoto = packing?.[0] ?? null;
  return [
    {
      id: "progress_photo",
      label: "Shop sends a progress photo",
      status: photo
        ? "done"
        : at > 0
          ? passedStatus(order, 1)
          : at === 0
            ? "current"
            : "upcoming",
      at: photo?.at ?? null,
      detail: progress && progress.length > 1 ? photoCount(progress.length) : null,
    },
    {
      id: "shop_packed",
      label: "Shop packs the job and photographs it",
      status: packedPhoto
        ? "done"
        : at >= 2
          ? passedStatus(order, 2)
          : at >= 0 && photo
            ? "current"
            : "upcoming",
      at: packedPhoto?.at ?? null,
      detail: null,
    },
    {
      id: "ready",
      label: "Ready for dispatch",
      status: at >= 2 ? "done" : "upcoming",
      at: at >= 2 ? (order.readyAt ?? reachedAt(order, ["ready_for_dispatch"])) : null,
      detail: null,
    },
    {
      id: "signed",
      label: "Rider counts, checks and takes the shop's signature",
      status:
        signature || checklist?.status === "passed"
          ? "done"
          : at > 3
            ? "not_recorded"
            : at === 3
              ? "current"
              : "upcoming",
      at: signature?.signedAt ?? checklist?.completedAt ?? null,
      detail: signature?.signerName ? `Signed by ${signature.signerName}.` : null,
    },
  ];
}

/** Whether the handover belongs on screen: the flow is known and production has begun. */
export function handoverVisible(order: StepSource): boolean {
  return handoverFlowOf(order) !== null && rank(order.state) >= 0;
}
