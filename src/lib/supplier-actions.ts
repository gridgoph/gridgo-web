/**
 * Supplier-facing state actions for the v2 model.
 * Only the valid actions for a job's current state are offered.
 *
 * Accepting is the one action that carries money: the supplier names its own
 * price, and the API atomically computes the client total, tells the client,
 * and moves the job to awaiting downpayment. The supplier never asks for
 * payment itself, and the retired proof-approval loop has no actions left.
 */

export type SupplierActionKind =
  "accept" | "decline" | "start_production" | "ready_for_pickup";

export type SupplierAction = {
  kind: SupplierActionKind;
  label: string;
  /** The `state` value sent to the transition endpoint. */
  targetState: string;
  primary: boolean;
  destructive?: boolean;
  /** True when the action needs the supplier's own price before it can be sent. */
  needsPrice?: boolean;
};

export function actionsForJob(state: string): SupplierAction[] {
  switch (state) {
    case "supplier_assigned":
      return [
        {
          kind: "accept",
          label: "Accept and set price",
          targetState: "supplier_accepted",
          primary: true,
          needsPrice: true,
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
      // Packed is the shop's last move. Quality and count are checked together
      // with the rider at pickup, so no supplier self-check step sits between.
      return [
        {
          kind: "ready_for_pickup",
          label: "Package for pickup",
          targetState: "ready_for_dispatch",
          primary: true,
        },
      ];
    case "supplier_self_qc":
      return [
        {
          kind: "ready_for_pickup",
          label: "Ready for pickup",
          targetState: "ready_for_dispatch",
          primary: true,
        },
      ];
    default:
      return [];
  }
}

export function primaryAction(state: string): SupplierAction | null {
  return actionsForJob(state).find((a) => a.primary) ?? null;
}

export function needsSupplierAction(state: string): boolean {
  return actionsForJob(state).some((a) => a.primary);
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
