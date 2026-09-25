/**
 * Supplier-facing state actions for the v2 model.
 * Only the valid actions for a job's current state are offered.
 *
 * Accepting an assigned job is a confirmation. The client already chose the
 * listing, so the price and the date are already on the order. The shop says
 * it can run the work; it does not name a price or a promise date.
 *
 * Once production has started, the shop files evidence before the job can
 * leave the floor. Printing proof, then packaging proof. Filing attaches a
 * photo to one payout milestone; it does not change the order state, and it
 * does not release money. Operations reviews the evidence later. Package for
 * pickup is offered only after both shop proofs are filed.
 */

import type { Order } from "@/lib/api/types";

export type SupplierActionKind =
  | "accept"
  | "decline"
  | "start_production"
  | "ready_for_pickup"
  | "add_proof";

export type ShopProofCode = "printing" | "packaging_qc";

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
};

type ShopOrder = Pick<Order, "state" | "payoutMilestones" | "payoutHold">;

const SHOP_PROOFS: readonly { code: ShopProofCode; label: string; hint: string }[] = [
  {
    code: "printing",
    label: "Printing",
    hint: "Show the finished print on your floor — enough of it to recognise the job, with the colour and the trim readable.",
  },
  {
    code: "packaging_qc",
    label: "Packaging",
    hint: "Show the job boxed or wrapped as the rider will collect it, labelled and ready to move.",
  },
];

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
  return SHOP_PROOFS.find((proof) => proof.code === code)?.hint ?? "";
}

export function shopProofLabel(code: ShopProofCode): string {
  return SHOP_PROOFS.find((proof) => proof.code === code)?.label ?? "";
}

/**
 * The first shop milestone that is reached, not held, and still waiting on
 * evidence. Delivered and retention are never the shop's to file.
 */
export function nextShopProof(
  order: ShopOrder,
): { code: ShopProofCode; label: string } | null {
  if (order.payoutHold === true) return null;
  if (!PROOF_REACHED.has(order.state)) return null;
  const milestones = order.payoutMilestones ?? [];
  for (const proof of SHOP_PROOFS) {
    const milestone = milestones.find((item) => item.code === proof.code);
    if (!milestone) continue;
    if (milestone.status !== "pending_pof") continue;
    return { code: proof.code, label: proof.label };
  }
  return null;
}

function proofAction(owed: { code: ShopProofCode; label: string }): SupplierAction {
  return {
    kind: "add_proof",
    label: `Add ${owed.label.toLowerCase()} proof`,
    targetState: null,
    primary: true,
    milestoneCode: owed.code,
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
export function supplierWaitingOn(state: string): string | null {
  switch (state) {
    case "awaiting_downpayment":
      return "The client has been told the final price and is sending the 75% downpayment.";
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
      return "Delivered. Retention releases once the client's issue window closes with nothing raised.";
    default:
      return null;
  }
}
