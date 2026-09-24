/**
 * Plain recovery copy from API errors for Operations screens.
 * Branch on `kind` / `code` — never string-match the server's message.
 */

import { isApiError } from "@/lib/api/client";
import { PLATFORM_CONSTRAINT_COPY } from "@/lib/api/constraints";
import { RIDER_SHARE_INVALID } from "@/lib/delivery-split";

/** Codes worth naming precisely, because each has a different way out. */
const CODE_COPY: Record<string, string> = {
  payment_not_pending: PLATFORM_CONSTRAINT_COPY.payment_not_pending.guidance,
  payment_rejection_reason_required:
    "Say what was wrong with the payment. The client only gets your reason to work from.",
  payment_already_confirmed:
    "This installment was already confirmed, and confirmed money cannot be reversed here. Reconcile it with the wallet by hand instead.",
  assignment_notification_required:
    PLATFORM_CONSTRAINT_COPY.assignment_notification_required.guidance,
  payout_held: PLATFORM_CONSTRAINT_COPY.payout_held.guidance,
  pof_required: PLATFORM_CONSTRAINT_COPY.pof_required.guidance,
  milestone_not_reached:
    PLATFORM_CONSTRAINT_COPY.milestone_not_reached.guidance,
  issue_window_closed: PLATFORM_CONSTRAINT_COPY.issue_window_closed.guidance,
  pickup_escalation_open:
    PLATFORM_CONSTRAINT_COPY.pickup_escalation_open.guidance,
  verification_not_approved:
    PLATFORM_CONSTRAINT_COPY.verification_not_approved.guidance,
  supplier_not_approved:
    PLATFORM_CONSTRAINT_COPY.verification_not_approved.guidance,
  rider_not_approved: PLATFORM_CONSTRAINT_COPY.verification_not_approved.guidance,
  rider_documents_incomplete:
    "This rider still needs a current driver's licence on file before they can be approved.",
  document_expired:
    "This rider's driver's licence has expired. They need to replace it before you can approve.",
  approval_state_conflict:
    "This rider has not finished sending their application. Ask them to submit it from the rider app, then try again.",
  approval_case_stale:
    "This approval was updated. Refresh and review it again.",
  escalation_already_resolved:
    "Someone has already given an instruction on this escalation. Refresh to see it.",
  transition_not_allowed:
    "That step is not available from where this order is now. Refresh and take the action the order offers.",
  payment_method_not_allowed:
    "Only digital QR payment exists on this platform. Cash on delivery was withdrawn.",
  payment_route_retired:
    "Pilot Credits can no longer pay for an order. Grants and balances still exist, but the client pays by QR transfer.",
  order_not_found: "That order was not found. Refresh the queue.",
  invalid_rider_commission_rate: RIDER_SHARE_INVALID,
};

export function opsErrorMessage(err: unknown, fallback: string): string {
  if (!isApiError(err)) return fallback;

  const specific = CODE_COPY[err.code];
  if (specific) return specific;

  switch (err.kind) {
    case "unauthorized":
      return "Your session expired. Sign in again to carry on.";
    case "forbidden":
      return "This action is restricted to Operations and Super Admin.";
    case "not_found":
      return "That record was not found. Refresh and try again.";
    case "conflict":
      return "The platform refused this change because the record moved on. Refresh and review where it stands now.";
    case "validation":
      return "Check the details you entered and try again.";
    case "server":
      return "The API failed processing this request. Retry in a moment.";
    default:
      return fallback;
  }
}
