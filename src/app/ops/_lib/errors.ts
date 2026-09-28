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
  balance_not_required: PLATFORM_CONSTRAINT_COPY.balance_not_required.guidance,
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
  note_required: "Add a note for the record before reinstating this account.",
  service_not_restorable:
    "One of the ticked service lines was not suspended with this account, so reinstating cannot bring it back. Refresh, then review that line on the Service lines tab.",
  escalation_already_resolved:
    "Someone has already given an instruction on this escalation. Refresh to see it.",
  escalation_closed:
    "Someone has already given an instruction on this escalation. Refresh to see it.",
  resolution_required:
    "Write the instruction. The rider is waiting at the shop and this is what they act on.",
  transition_not_allowed:
    "That step is not available from where this order is now. Refresh and take the action the order offers.",
  payment_method_not_allowed:
    "Only digital QR payment exists on this platform. Cash on delivery was withdrawn.",
  payment_route_retired:
    "Pilot Credits can no longer pay for an order. Grants and balances still exist, but the client pays by QR transfer.",
  order_not_found: "That order was not found. Refresh the queue.",
  invalid_rider_commission_rate: RIDER_SHARE_INVALID,
  invalid_downpayment_percent:
    "Checkout takes either the full amount or 75% now and 25% before delivery. Choose one of the two.",
  promise_outside_business_hours:
    "Promise a Monday–Friday time from 8:00 am up to, but not including, 5:00 pm Philippine time.",
  invalid_physical_invoice: "Choose a date and a time for the paper invoice, then set the promise.",
  physical_invoice_not_found:
    "This order no longer has a paper-invoice request. Refresh the order.",
  // Client refunds (gridgo-api/docs/REFUNDS_API.md § Refusals).
  refund_window_closed:
    "The filing window has closed. Super Admin files and decides late refund cases.",
  refund_super_admin_required:
    "This refund was filed after the complaint deadline, so Super Admin decides it.",
  refund_requires_super_admin:
    "That settlement would take back money already paid to the shop or earned by the rider. There is no override. Refer the remedy to Super Admin.",
  refund_exceeds_available_funds:
    "That is more than the money GRIDGO still holds for this order. There is no override. Refer anything larger to Super Admin.",
  refund_no_available_funds:
    "No money is left to return on this order. Refer the client's remedy to Super Admin.",
  refund_amount_mismatch:
    "The figures moved since the preview. Preview the settlement again and approve the new total.",
  refund_collection_reconciliation_required:
    "A payment on this order is not settled yet. Confirm or reject the submitted payment first, then preview again.",
  refund_payment_not_verified:
    "No confirmed payment exists on this order, so there is nothing to refund yet.",
  refund_fulfillment_stopped:
    "This order is stopped for a refund. Resolve the refund before continuing work on it.",
  refund_already_open:
    "This order already has an open refund request. Work that one instead.",
  refund_stale:
    "Someone else changed this refund while you were reading it. Reload it and check again.",
  refund_idempotency_conflict:
    "This action was already sent with different details. Reload the refund and start again.",
  refund_destination_locked:
    "A transfer is reserved or unconfirmed, so the receiving account cannot change now.",
  refund_destination_stale:
    "The client's receiving QR changed. Reload, verify the current one, then reserve again.",
  refund_destination_verification_required:
    "Open the client's receiving QR and confirm the wallet shows the same name before marking it reviewed.",
  refund_complaint_not_substantiated:
    "A complaint needs substantiating evidence before it can be reviewed. If it has none, reject it with a reason.",
  refund_work_stop_required:
    "Confirm that production and delivery have stopped before approving.",
  refund_payment_reserved:
    "Another payer already reserved this transfer. Do not send money. Reload to see who.",
  refund_payer_required:
    "Only the person who reserved this transfer, or Super Admin, can record or reconcile it.",
  refund_payment_attempt_required:
    "Reserve the transfer first. If money was already sent, record that same transfer; never send again.",
  refund_duplicate_transfer:
    "That wallet reference is already recorded against a refund. Reconcile the original transfer; do not send a second one.",
  refund_payment_mismatch:
    "Record the exact reserved transfer and amount. Reload the refund and try again.",
  refund_no_transfer_confirmation_required:
    "Confirm that no money left the wallet before freeing this refund for another attempt.",
  invalid_refund_paid_at: "Enter when the wallet sent the money. It cannot be in the future.",
  invalid_refund_file:
    "Upload the screenshot again. It must be a JPEG, PNG or WebP you uploaded yourself.",
  refund_supplier_payout_not_pending:
    "No shop settlement payout is waiting on this refund. Reload it.",
  refund_supplier_payout_amount_mismatch:
    "Pay the shop exactly the agreed settlement amount. Reload and try again.",
  refund_supplier_destination_verification_required:
    "The shop's receiving QR changed or was not verified. Reload, check the current QR, then record the payment.",
  refund_supplier_transfer_evidence_required:
    "Add the wallet reference and the transfer screenshot. Both are required.",
  refund_supplier_reconciliation_required:
    "This order has no shop to owe a settlement to. Reconcile it with Super Admin before approving.",
  refund_state_conflict:
    "This refund has moved on since you opened it. Reload it and take the step it shows now.",
  refund_settlement_payout_hold:
    "A refund settlement replaced this order's remaining shares. Pay what the shop is still owed as the settlement payout.",
  refund_not_found: "That refund request was not found. Refresh the inbox.",
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
