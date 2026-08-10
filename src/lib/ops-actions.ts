/**
 * Operations transitions, from the v2 transition table.
 *
 * Only edges the API accepts for ops_admin / super_admin appear here. Steps the
 * API owns atomically are deliberately absent: confirming a downpayment is the
 * payment route, not a transition; a rider's six checks move the order to
 * `picked_up`; delivery evidence opens the issue window; and only the system
 * closes that window once it has actually expired.
 */

export type OpsAction = {
  label: string;
  targetState: string;
  primary: boolean;
  /** Extra body fields the transition needs. */
  requires?: "supplierId" | "riderId";
  note?: string;
};

/** States that put an order on an Operations queue. */
export const OPS_QUEUE_STATES = new Set([
  "submitted",
  "needs_qa",
  "downpayment_review",
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
          label: "Send artwork to client",
          targetState: "proof_approval",
          primary: false,
          note: "Artwork sent for the client to look at",
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
    case "completed":
      return [
        {
          label: "Close out payout",
          targetState: "payout_released",
          primary: true,
          note: "All four milestones released",
        },
      ];
    default:
      return [];
  }
}

export function primaryOpsAction(state: string): OpsAction | null {
  return actionsForOps(state).find((a) => a.primary) ?? null;
}

/**
 * What Operations owes this order when no transition is available — the step
 * lives on a dedicated surface rather than the transition endpoint.
 */
export type OpsHandoff = {
  label: string;
  href: string;
};

export function opsHandoffForState(state: string): OpsHandoff | null {
  switch (state) {
    case "downpayment_review":
      return { label: "Confirm the downpayment", href: "/ops/payments" };
    case "rider_assigned":
      return { label: "Check for a pickup escalation", href: "/ops/escalations" };
    case "issue_window_open":
      return { label: "Review the open issue", href: "/ops/recovery" };
    default:
      return null;
  }
}
