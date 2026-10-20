/**
 * Supplier-facing state actions for the v2 model.
 * Only the valid actions for a job's current state are offered.
 *
 * Accepting an assigned job is a confirmation. The client already chose the
 * listing, so the price and the date are already on the order. The shop says
 * it can run the work; it does not name a price or a promise date.
 *
 * Once production has started, the shop files evidence for the payout plan:
 * every stage that waits on the shop's proof, in the plan's order. On the
 * escrow plan that is one photo, the start of production; a legacy four-stage
 * order still asks for printing, then packaging. Filing attaches a photo to one
 * payout milestone; it does not change the order state, and it does not
 * release money. Operations reviews the evidence later. A missing payout proof
 * is the first action, and it is not a physical gate: when the API's physical
 * gates are already met, the permitted forward step stays beside it.
 *
 * Packing also needs one progress photo (`productionProgress`, see
 * `src/lib/production-progress.ts`). A start-of-production photo counts, so on
 * most jobs the proof above already covers it; a PDF proof does not, and then
 * the shop is asked for a photo before packing is offered.
 *
 * Ready for dispatch also needs a separate packing photo of the finished
 * prints packed (`packingProgress`, `409 packing_photo_required`); a
 * production photo never counts for it.
 *
 * Where the API sends `transitionReadiness` (report 6C695C15,
 * `src/lib/packaging-readiness.ts`), its list decides which photo is still
 * owed and what else holds the step. Anything the shop cannot lift itself, a
 * claim above all, keeps Package for pickup on the page but disabled, with the
 * API's own sentence (`409 claim_hold_active`, gridgoph/gridgo-web#74). An
 * older API without the list falls back to `payoutHold` and the galleries.
 *
 * A rider-packs job (`handoverFlow`, `src/lib/shop-handover.ts`) owes neither
 * photo above. The shop sends photos of the finished, unpacked work for
 * GRIDGO's review (`POST /orders/:id/production-finished`), waits while the
 * GRIDGO Team reviews it, and once approved marks it Ready for rider pickup
 * with packing materials prepared and nothing packed. A send-back returns it
 * to sending new photos.
 */

import type { Order, PayoutMilestone } from "@/lib/api/types";
import { milestoneName, presentOrderState, type StatePresentation } from "@/lib/order-state";
import { isLegacyPayoutPlan, shopProofStages } from "@/lib/payout-plan";
import { packagingCheck, packagingHold } from "@/lib/packaging-readiness";
import { productionPhotoMissing } from "@/lib/production-progress";
import { acceptWindow } from "@/lib/supplier-accept-window";
import { keptShopEarnings, refundNotice, refundStanding, refundStatus } from "@/lib/supplier-refund";
import { shopRelease } from "@/lib/supplier-recovery";
import { rescheduleNotice, rescheduleStopped } from "@/lib/supplier-reschedule";
import { DO_NOT_PACK_YET, ridersPack, shopFinishedStep, shopHandoverChip } from "@/lib/shop-handover";

export type SupplierActionKind =
  | "accept"
  | "decline"
  | "start_production"
  | "ready_for_pickup"
  | "add_proof"
  | "add_progress_photo"
  | "add_packing_photo"
  | "send_finished_photos";

/** A stage the shop files its own proof for. The order's plan decides which. */
export type ShopProofCode =
  "production_started" | "printing" | "packaging_qc" | (string & {});

export type SupplierAction = {
  kind: SupplierActionKind;
  label: string;
  /**
   * The `state` value sent to the transition endpoint.
   * Null when the step is not a transition — filing proof or a progress photo
   * does not move the job.
   */
  targetState: string | null;
  primary: boolean;
  destructive?: boolean;
  /** Set on `add_proof`: which payout part the evidence backs. */
  milestoneCode?: ShopProofCode;
  /** Set on `add_proof`: the part's name, as the proof dialog titles it. */
  proofLabel?: string;
  /** Set on `add_proof`: what the photo should show. */
  proofHint?: string;
  /** Set on `add_proof`: the part as a phrase, "start-of-production". */
  proofNoun?: string;
  /**
   * Shown but not available: why, in the shop's words. A blocked action is
   * never what the shop "needs" to do; someone else has to act first.
   */
  blockedReason?: string;
};

export const CLAIM_HOLD_PACKING_REASON =
  "A claim is holding payouts on this order. Operations must clear the claim before you package it for pickup.";

type ShopOrder = Pick<Order, "state" | "payoutMilestones" | "payoutHold"> &
  Partial<
    Pick<
      Order,
      | "payoutPlanVersion"
      | "productionProgress"
      | "packingProgress"
      | "transitionReadiness"
      | "shopAcceptance"
      | "shopRecovery"
      | "rescheduleRequest"
      | "refundHold"
      | "refundDisposition"
      | "pickupChecklist"
      | "handoverFlow"
      | "shopHandover"
      | "supplierId"
      | "supplierSettlementPayouts"
    >
  >;

/**
 * The shop answered no, or the hour ran out: GRIDGO keeps the order at
 * `supplier_assigned` while it finds another shop (SHOP_RECOVERY_API.md), so
 * the offer must stop being offered here.
 */
export function shopLetJobGo(order: Pick<Order, "state"> & Partial<Pick<Order, "shopAcceptance">>): boolean {
  const status = order.shopAcceptance?.status;
  return (
    order.state === "supplier_assigned" &&
    (status === "declined" || status === "timed_out" || status === "cancelled")
  );
}

/** States where a shop may still attach a production or packing photo. */
const PHOTO_OPEN_STATES = new Set(["production", "supplier_self_qc"]);

/**
 * The production photo is still owed. The API's list decides when it sent
 * one; otherwise the gallery does, and an absent gallery owes nothing.
 */
export function productionPhotoOwed(order: ShopOrder): boolean {
  // A rider-packs job owes finished-work photos instead.
  if (ridersPack(order)) return false;
  const check = packagingCheck(order);
  if (check) return check.missing.some((item) => item.kind === "production_photo");
  return productionPhotoMissing(order);
}

/** The separate packing photo is still owed, by the same rule. */
export function packingPhotoOwed(order: ShopOrder): boolean {
  // On a rider-packs job the rider photographs the packed job, at the counter.
  if (ridersPack(order)) return false;
  if (!PHOTO_OPEN_STATES.has(order.state)) return false;
  const check = packagingCheck(order);
  if (check) return check.missing.some((item) => item.kind === "packing_photo");
  const progress = order.packingProgress;
  if (!progress || !Array.isArray(progress.photos)) return false;
  return progress.status === "waiting_for_photo" || progress.photos.length === 0;
}

/** Why packaging would be refused for a reason the shop cannot lift, or null. */
export function packagingBlockedReason(order: ShopOrder): string | null {
  const check = packagingCheck(order);
  if (check) return packagingHold(check)?.message ?? null;
  return order.payoutHold === true ? CLAIM_HOLD_PACKING_REASON : null;
}

export type ShopProofWords = { label: string; noun: string; hint: string };
export type OwedShopProof = ShopProofWords & { code: ShopProofCode };

/*
 The words for the shop proofs this portal knows. A shop stage it has never
 seen is still filed, under the API's own label and a plain hint.
*/
const SHOP_PROOF_WORDS: Readonly<Record<string, ShopProofWords>> = {
  production_started: {
    label: "Start of production",
    noun: "start-of-production",
    hint: "Show this job on your press or the first finished sheets coming off it — enough to recognise the job, with the colour readable.",
  },
  printing: {
    label: "Printing",
    noun: "printing",
    hint: "Show the finished print on your floor — enough of it to recognise the job, with the colour and the trim readable.",
  },
  packaging_qc: {
    label: "Packaging",
    noun: "packaging",
    hint: "Show the job boxed or wrapped as the rider will collect it, labelled and ready to move.",
  },
};

const GENERIC_SHOP_PROOF_HINT =
  "Show this stage of the job on your floor — enough of it to recognise the job.";

/** How the proof dialog names a shop stage and what its photos should show. */
export function shopProofWords(
  milestone: Pick<PayoutMilestone, "code"> &
    Partial<Pick<PayoutMilestone, "label" | "sharePercent">>,
): ShopProofWords {
  const known = SHOP_PROOF_WORDS[milestone.code];
  if (known) return known;
  const label = milestoneName(milestone);
  return { label, noun: label.toLowerCase(), hint: GENERIC_SHOP_PROOF_HINT };
}

/** States where a shop can photograph the run or the packed job. */
const PROOF_REACHED = new Set([
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

export function shopProofHint(code: ShopProofCode): string {
  return SHOP_PROOF_WORDS[code]?.hint ?? GENERIC_SHOP_PROOF_HINT;
}

export function shopProofLabel(code: ShopProofCode): string {
  return SHOP_PROOF_WORDS[code]?.label ?? "";
}

/**
 * The first shop milestone that is reached, not held, and still waiting on
 * evidence, in the order's own plan. The rider's delivery evidence and the
 * complaint window are never the shop's to file.
 */
export function nextShopProof(order: ShopOrder): OwedShopProof | null {
  if (order.payoutHold === true) return null;
  if (!PROOF_REACHED.has(order.state)) return null;
  for (const milestone of shopProofStages(order)) {
    if (milestone.status !== "pending_pof") continue;
    return { code: milestone.code, ...shopProofWords(milestone) };
  }
  return null;
}

function proofAction(owed: OwedShopProof): SupplierAction {
  return {
    kind: "add_proof",
    label: `Add ${owed.noun} proof`,
    targetState: null,
    primary: true,
    milestoneCode: owed.code,
    proofLabel: owed.label,
    proofHint: owed.hint,
    proofNoun: owed.noun,
  };
}

const ADD_PROGRESS_PHOTO: SupplierAction = {
  kind: "add_progress_photo",
  label: "Add a progress photo",
  targetState: null,
  primary: true,
};

const ADD_PACKING_PHOTO: SupplierAction = {
  kind: "add_packing_photo",
  label: "Add a packing photo",
  targetState: null,
  primary: true,
};

const PACKAGE_FOR_PICKUP: SupplierAction = {
  kind: "ready_for_pickup",
  label: "Package for pickup",
  targetState: "ready_for_dispatch",
  primary: true,
};

/** Package for pickup, disabled with the reason while someone else must act first. */
function packageStep(order: ShopOrder): SupplierAction {
  const blockedReason = packagingBlockedReason(order);
  return blockedReason ? { ...PACKAGE_FOR_PICKUP, blockedReason } : PACKAGE_FOR_PICKUP;
}

const SEND_FINISHED_PHOTOS: SupplierAction = {
  kind: "send_finished_photos",
  label: "Send finished work for review",
  targetState: null,
  primary: true,
};

/** The rider-packs step that replaces Package for pickup: nothing is packed yet. */
const READY_FOR_RIDER_PICKUP: SupplierAction = {
  kind: "ready_for_pickup",
  label: "Ready for rider pickup",
  targetState: "ready_for_dispatch",
  primary: true,
};

/**
 * The shop's steps before a rider is called on a rider-packs job. A claim or
 * a stop keeps the step on the page, disabled with its reason, because the
 * API refuses both the submission and the readiness while it stands.
 */
function riderPacksSteps(order: ShopOrder): SupplierAction[] {
  const step = shopFinishedStep(order);
  const blockedReason = packagingBlockedReason(order);
  const held = (action: SupplierAction) =>
    blockedReason ? { ...action, blockedReason } : action;
  if (step?.stage === "to_send") {
    return [
      held(
        step.sendBack
          ? { ...SEND_FINISHED_PHOTOS, label: "Send new photos for review" }
          : SEND_FINISHED_PHOTOS,
      ),
    ];
  }
  if (step?.stage === "approved") return [held(READY_FOR_RIDER_PICKUP)];
  // GRIDGO is reviewing, or moved the job on itself: nothing is the shop's.
  return [];
}

/**
 * The chip for one job. A refund speaks over a recovery, which speaks over a
 * held deadline, which speaks over a failed counter check. The handover chip
 * and the plain state follow only when none of those has stopped the job.
 */
export function presentSupplierJobStatus(
  order: ShopOrder,
  now: Date = new Date(),
): StatePresentation {
  const refund = refundStatus(order);
  if (refund) return refund;
  const released = shopRelease(order);
  if (released) return released.chip;
  // A decline, a cancel, or an hour that has run out keeps the old state until
  // GRIDGO records the recovery. The chip must not keep reading as an offer.
  if (shopLetJobGo(order) || acceptWindow(order, now).kind === "expired") {
    const status = order.shopAcceptance?.status;
    const label =
      status === "declined"
        ? "Passed on"
        : status === "cancelled"
          ? "Cancelled by you"
          : "Not answered in time";
    return { label, tone: "neutral", icon: "circle-x" };
  }
  if (order.rescheduleRequest?.workHeld) {
    return { label: "Paused", tone: "warning", icon: "clock" };
  }
  if (order.state === "rider_assigned") {
    const check = order.pickupChecklist?.status;
    if (check === "failed_escalated") {
      return { label: "Pickup blocked", tone: "error", icon: "circle-x" };
    }
    if (check === "escalation_resolved") {
      return { label: "Rider will check again", tone: "info", icon: "clock" };
    }
  }
  return shopHandoverChip(order) ?? presentOrderState(order.state);
}

/**
 * Why this job offers the shop nothing, and who resolves it. Null while the
 * job is still the shop's to move. An hour that has just run out is said by
 * the acceptance clock, not here.
 */
export function shopStopNotice(
  order: ShopOrder,
): { title: string; body: string } | null {
  const refund = refundNotice(order, keptShopEarnings(order));
  if (refund) return { title: refund.title, body: refund.body };
  const released = shopRelease(order);
  if (released) return { title: released.title, body: released.body };
  if (order.rescheduleRequest && rescheduleStopped(order.rescheduleRequest)) {
    const notice = rescheduleNotice(order.rescheduleRequest);
    return { title: notice.title, body: notice.body };
  }
  return null;
}

/**
 * True when a refund, a recovery, a held deadline, or an expired answer hour
 * has stopped the job. File uploads and commitments follow this, not the
 * order's old state. A claim payout hold is not one of these stops.
 */
export function shopWorkStopped(order: ShopOrder, now: Date = new Date()): boolean {
  if (refundStanding(order) !== "none") return true;
  if (shopRelease(order)) return true;
  if (rescheduleStopped(order.rescheduleRequest)) return true;
  return acceptWindow(order, now).kind === "expired";
}

/**
 * A missing payout proof leads, and the forward step stays. Proof never
 * replaces a progress photo, a packing photo, a finished-work review, or a
 * packaging hold. A claim hold already makes `nextShopProof` return nothing,
 * so Package for pickup stays the only step and stays disabled.
 */
function withProof(order: ShopOrder, forward: SupplierAction[]): SupplierAction[] {
  const owed = nextShopProof(order);
  if (!owed) return forward;
  const proof = proofAction(owed);
  if (forward.length === 0) return [proof];
  return [proof, ...forward.map((action) => ({ ...action, primary: false }))];
}

export function actionsForJob(order: ShopOrder, now: Date = new Date()): SupplierAction[] {
  // A refund, a job this shop let go, a declined deadline, or an hour that
  // has run out: GRIDGO refuses the next step, so none is offered. A claim
  // hold is not one of these — Package for pickup stays, disabled, below.
  if (shopWorkStopped(order, now)) return [];
  if (shopLetJobGo(order)) return [];

  switch (order.state) {
    case "supplier_assigned":
      return [
        {
          kind: "accept",
          label: "Accept job",
          targetState: "payment_authorized",
          primary: true,
        },
        {
          kind: "decline",
          label: "Decline",
          targetState: "approved_for_matching",
          primary: false,
          destructive: true,
        },
      ];
    case "payment_authorized":
      return [
        {
          kind: "start_production",
          label: "Start production",
          targetState: "production",
          primary: true,
        },
      ];
    case "production":
    case "supplier_self_qc":
      if (ridersPack(order)) return withProof(order, riderPacksSteps(order));
      // A PDF proof, or no proof stage at all: still no picture of the job,
      // and the API refuses to pack it without one.
      if (productionPhotoOwed(order)) return withProof(order, [ADD_PROGRESS_PHOTO]);
      // Then the finished prints, packed: a separate photo of its own.
      if (packingPhotoOwed(order)) return withProof(order, [ADD_PACKING_PHOTO]);
      return withProof(order, [packageStep(order)]);
    default: {
      const owed = nextShopProof(order);
      return owed ? [proofAction(owed)] : [];
    }
  }
}

export function primaryAction(order: ShopOrder, now: Date = new Date()): SupplierAction | null {
  return actionsForJob(order, now).find((a) => a.primary) ?? null;
}

export function needsSupplierAction(order: ShopOrder, now: Date = new Date()): boolean {
  return actionsForJob(order, now).some((a) => a.primary && !a.blockedReason);
}

/**
 * True when a shop proof, the progress photo or the packing photo is still
 * missing, so the job must not leave the floor.
 */
export function shopProofOutstanding(order: ShopOrder): boolean {
  return (
    nextShopProof(order) !== null || productionPhotoOwed(order) || packingPhotoOwed(order)
  );
}

/**
 * What the supplier is waiting on when there is nothing for them to do.
 * Keeps a job page from reading as a dead end.
 */
export function supplierWaitingOn(
  state: string,
  order: Partial<
    Pick<
      Order,
      | "payoutPlanVersion"
      | "payoutMilestones"
      | "shopAcceptance"
      | "shopRecovery"
      | "handoverFlow"
      | "shopHandover"
      | "supplierId"
    >
  > = {},
): string | null {
  const release = shopRelease({ state, ...order });
  if (release) return `${release.title}. ${release.body}`;
  if (shopLetJobGo({ state, shopAcceptance: order.shopAcceptance })) {
    return order.shopAcceptance?.status === "timed_out"
      ? "The hour to answer this offer passed, so GRIDGO is giving it to another shop."
      : "You declined this job. GRIDGO is giving it to another shop.";
  }
  if (ridersPack(order)) {
    const step = shopFinishedStep({ ...order, state });
    if (step?.stage === "in_review") {
      return "GRIDGO is checking your photos of the finished, unpacked work. Your production time is paused until it answers.";
    }
    if (step?.stage === "with_gridgo") {
      return "The GRIDGO Team moved this job on and takes the next step. Nothing for you to do yet.";
    }
    if (state === "ready_for_dispatch") {
      return `Waiting for a rider. ${DO_NOT_PACK_YET}`;
    }
    if (state === "rider_assigned") {
      return "A rider is on the way. They check the items unpacked, you pack them in front of the rider, then you sign on the rider's phone.";
    }
  }
  switch (state) {
    case "awaiting_downpayment":
      return "The client has been told the final price and is sending their payment.";
    case "downpayment_review":
      return "Operations is confirming the client's downpayment. Production starts once it clears.";
    case "ready_for_dispatch":
      return "Waiting for a rider. They will run six pickup checks with you before taking the job.";
    case "rider_assigned":
      return "A rider is on the way. Have the order slip ready — they check documentation at pickup.";
    case "picked_up":
    case "out_for_delivery":
      return "In transit to the client.";
    case "delivered":
    case "issue_window_open":
      // Legacy orders, and a caller that passed no plan, keep the old words.
      return order.payoutMilestones?.length && !isLegacyPayoutPlan(order)
        ? "Delivered. Your last share is released by Operations once the client's complaint window closes with nothing raised."
        : "Delivered. Retention releases once the client's issue window closes with nothing raised.";
    default:
      return null;
  }
}
