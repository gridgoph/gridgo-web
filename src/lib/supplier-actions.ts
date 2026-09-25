/**
 * Supplier-facing state actions for the v2 model.
 * Only the valid actions for a job's current state are offered.
 *
 * Accepting an assigned job is a confirmation. The client already chose the
 * listing, so the price and the date are already on the order. The shop says
 * it can run the work; it does not name a price or a promise date.
 *
 * Once production has started, the shop files evidence before the job can
 * leave the floor: every stage of the order's own payout plan that waits on the
 * shop's proof, in the plan's order. On the escrow plan that is one photo, the
 * start of production; a legacy four-stage order still asks for printing, then
 * packaging. Filing attaches a photo to one payout milestone; it does not
 * change the order state, and it does not release money. Operations reviews
 * the evidence later. Package for pickup is offered only after every shop
 * proof is filed.
 */

import type { Order, PayoutMilestone } from "@/lib/api/types";
import { milestoneName } from "@/lib/order-state";
import { isLegacyPayoutPlan, shopProofStages } from "@/lib/payout-plan";

export type SupplierActionKind =
  | "accept"
  | "decline"
  | "start_production"
  | "ready_for_pickup"
  | "add_proof";

/** A stage the shop files its own proof for. The order's plan decides which. */
export type ShopProofCode = "production_started" | "printing" | "packaging_qc" | (string & {});

export type SupplierAction = {
  kind: SupplierActionKind;
  label: string;
  /**
   * The `state` value sent to the transition endpoint.
   * Null when the step is not a transition — filing proof does not move the job.
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
};

type ShopOrder = Pick<Order, "state" | "payoutMilestones" | "payoutHold"> &
  Partial<Pick<Order, "payoutPlanVersion">>;

type ShopProofWords = { label: string; noun: string; hint: string };
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

function shopProofWords(
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

const PACKAGE_FOR_PICKUP: SupplierAction = {
  kind: "ready_for_pickup",
  label: "Package for pickup",
  targetState: "ready_for_dispatch",
  primary: true,
};

export function actionsForJob(order: ShopOrder): SupplierAction[] {
  const owed = nextShopProof(order);

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
      // While a shop proof is still empty, that is the only step. Packaging
      // the job for a rider before the photo exists is the bug this blocks.
      return owed ? [proofAction(owed)] : [PACKAGE_FOR_PICKUP];
    default:
      return owed ? [proofAction(owed)] : [];
  }
}

export function primaryAction(order: ShopOrder): SupplierAction | null {
  return actionsForJob(order).find((a) => a.primary) ?? null;
}

export function needsSupplierAction(order: ShopOrder): boolean {
  return actionsForJob(order).some((a) => a.primary);
}

/** True when a shop proof is still unfiled, so the job must not leave the floor. */
export function shopProofOutstanding(order: ShopOrder): boolean {
  return nextShopProof(order) !== null;
}

/**
 * What the supplier is waiting on when there is nothing for them to do.
 * Keeps a job page from reading as a dead end.
 */
export function supplierWaitingOn(
  state: string,
  order: Partial<Pick<Order, "payoutPlanVersion" | "payoutMilestones">> = {},
): string | null {
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
