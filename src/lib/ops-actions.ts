/**
 * Operations actions derived from the demo API state machine.
 * Only transitions the API allows for ops_admin / super_admin.
 */

export type OpsAction = {
  label: string;
  targetState: string;
  primary: boolean;
  /** Extra body fields (e.g. supplierId, riderId). */
  requires?: "supplierId" | "riderId";
  note?: string;
};

/** States that belong on the Operations QA / action queue. */
export const OPS_QUEUE_STATES = new Set([
  "submitted",
  "needs_qa",
  "approved_for_matching",
  "ready_for_dispatch",
  "issue_window_open",
  "completed",
]);

export function isOpsQueueState(state: string): boolean {
  return OPS_QUEUE_STATES.has(state);
}

/**
 * Actions Operations may take from the current state.
 * Primary is the single yellow CTA; others are secondary.
 */
export function actionsForOps(state: string): OpsAction[] {
  switch (state) {
    case "submitted":
      return [
        {
          label: "Open for QA",
          targetState: "needs_qa",
          primary: true,
          note: "Moved into QA review",
        },
      ];
    case "needs_qa":
      return [
        {
          label: "Approve for matching",
          targetState: "approved_for_matching",
          primary: true,
          note: "QA approved — ready to match",
        },
        {
          label: "Send proof to client",
          targetState: "proof_approval",
          primary: false,
          note: "Proof sent for client decision",
        },
        {
          label: "Request correction",
          targetState: "client_correction",
          primary: false,
          note: "Client must correct artwork or specs",
        },
      ];
    case "approved_for_matching":
      return [
        {
          label: "Assign supplier",
          targetState: "supplier_assigned",
          primary: true,
          requires: "supplierId",
          note: "Supplier assigned",
        },
      ];
    case "supplier_accepted":
      return [
        {
          label: "Send for payment",
          targetState: "awaiting_payment",
          primary: true,
          note: "Payment requested",
        },
      ];
    case "awaiting_payment":
      return [
        {
          label: "Mark payment authorized",
          targetState: "payment_authorized",
          primary: true,
          note: "Payment authorized by Operations",
        },
      ];
    case "ready_for_dispatch":
      return [
        {
          label: "Assign rider",
          targetState: "rider_assigned",
          primary: true,
          requires: "riderId",
          note: "Rider assigned for pickup",
        },
      ];
    case "issue_window_open":
      return [
        {
          label: "Close as completed",
          targetState: "completed",
          primary: true,
          note: "Issue window closed — order completed",
        },
      ];
    case "completed":
      return [
        {
          label: "Release payout",
          targetState: "payout_released",
          primary: true,
          note: "Supplier payout released",
        },
      ];
    default:
      return [];
  }
}

export function primaryOpsAction(state: string): OpsAction | null {
  return actionsForOps(state).find((a) => a.primary) ?? null;
}
