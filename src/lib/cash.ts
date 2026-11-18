/**
 * Cash on delivery for Operations and Super Admin: what each queue holds,
 * where a rider's wallet stands, and the plain words for every ledger fact
 * (contract `gridgo-api/docs/CASH_ON_DELIVERY_API.md`).
 *
 * Amounts stay integer centavos here; screens format them with `formatPhp`.
 */

import { isApiError } from "@/lib/api/client";
import type { CashJournal, CashReconciliation, CashTopupRow } from "@/lib/api/cash";
import type { FaultDecision, Issue, Order } from "@/lib/api/types";
import { FAULT_APPROVAL_LIMIT_MINOR } from "@/lib/problem-reports";

/** The API trims and upper-cases decision reasons and refuses more than 120 characters. */
export const CASH_REASON_MAX = 120;
/** A shop-cash claim's reason may be longer. */
export const CASH_INCIDENT_REASON_MAX = 2_000;
/** The API's "low balance" line: available below PHP 100. */
export const CASH_LOW_BALANCE_MINOR = 10_000;
/** Above this much GRIDGO funding a remedy needs Super Admin's approval. */
export const CASH_REMEDY_APPROVAL_MINOR = FAULT_APPROVAL_LIMIT_MINOR;

// ---- Desk tabs ------------------------------------------------------------

export type CashTab = "topups" | "incidents" | "ledger";
export const CASH_TABS: { value: CashTab; label: string }[] = [
  { value: "topups", label: "Top-ups" },
  { value: "incidents", label: "Incidents" },
  { value: "ledger", label: "Wallets and ledger" },
];

export function tabFromSearch(value: string | null): CashTab {
  return value === "incidents" || value === "ledger" ? value : "topups";
}

// ---- Top-ups --------------------------------------------------------------

export type TopupStatus = "waiting" | "confirmed" | "rejected";

export function topupStatus(row: CashTopupRow): TopupStatus {
  if (row.decision === "topup_confirmed") return "confirmed";
  if (row.decision === "topup_rejected") return "rejected";
  return "waiting";
}

/** Waiting first, oldest waiting at the top (first in, first checked); then decided, newest first. */
export function sortTopups(rows: CashTopupRow[]): CashTopupRow[] {
  return [...rows].sort((a, b) => {
    const aw = topupStatus(a) === "waiting";
    const bw = topupStatus(b) === "waiting";
    if (aw !== bw) return aw ? -1 : 1;
    const diff = Date.parse(a.created_at) - Date.parse(b.created_at);
    return aw ? diff : -diff;
  });
}

export function waitingTopups(rows: CashTopupRow[]): number {
  return rows.filter((row) => topupStatus(row) === "waiting").length;
}

/** The first waiting top-up that quotes this reference, other than `id`. */
export function sameReferenceTopups(
  rows: CashTopupRow[],
  row: CashTopupRow,
): CashTopupRow[] {
  const ref = row.evidence.reference.trim().toUpperCase();
  return rows.filter(
    (other) =>
      other.id !== row.id && other.evidence.reference.trim().toUpperCase() === ref,
  );
}

// ---- Order queues ---------------------------------------------------------

const FINISHED = new Set(["cancelled", "delivered", "completed", "closed"]);

export const isCashOrder = (order: Order): boolean => Boolean(order.cash);

/** A rider's no-show report waiting for Operations. */
export function noShowWaiting(order: Order): boolean {
  const p = order.cashProgress;
  return Boolean(p?.noShowReportedAt && !p.noShowApprovedAt && !p.collectedAt);
}

/** The client's online repayment of a no-show, waiting for a bank check. */
export function repaymentWaiting(order: Order): boolean {
  const p = order.cashProgress;
  return Boolean(p?.noShowApprovedAt && p.repayment && !p.repaymentConfirmedAt);
}

/** A paid redelivery waiting for a bank check. */
export function redeliveryWaiting(order: Order): boolean {
  const leg = order.cashProgress?.redelivery;
  return Boolean(leg?.payment && !leg.paidAt);
}

export type ShopFailurePath = "cancel_unpaid" | "open_claim";

/**
 * What Operations can do when the shop cannot produce a cash order before
 * the client paid: cancel outright while no cash has moved, or open a claim
 * on the rider's shop advance once it has. Null when neither applies.
 */
export function shopFailurePath(order: Order): ShopFailurePath | null {
  const p = order.cashProgress ?? {};
  if (!order.cash || FINISHED.has(order.state)) return null;
  if (p.collectedAt || p.noShowApprovedAt || p.repaymentConfirmedAt || p.incident)
    return null;
  if (!p.shopPaidAt) return "cancel_unpaid";
  return ["rider_assigned", "picked_up", "out_for_delivery"].includes(order.state)
    ? "open_claim"
    : null;
}

// ---- Remedies -------------------------------------------------------------

const REMEDIES = new Set(["partial_refund", "full_refund", "reprint", "replacement"]);

export const isRefundRemedy = (remedy: string): boolean =>
  remedy === "partial_refund" || remedy === "full_refund";

export type RemedyStage =
  "needs_super_admin" | "waiting_destination" | "ready" | "reserved" | "unknown" | "paid";

export type CashRemedyCase = {
  order: Order;
  issue: Issue;
  decision: FaultDecision;
  stage: RemedyStage;
};

/**
 * A cash order's paid-for remedies: an evidence-backed, non-client-fault
 * decision on a collected (or repaid) order. Refunds wait for the client's
 * receiving QR; above PHP 1,000 of GRIDGO funding the decision waits for
 * Super Admin in the problem report.
 */
/** Whether a remedy's stage still allows the step a dialog was opened for. */
export function remedyStepOpen(
  remedy: CashRemedyCase,
  step: "reserve" | "pay" | "reconcile",
): boolean {
  if (step === "reserve") return remedy.stage === "ready";
  return remedy.stage === "reserved" || remedy.stage === "unknown";
}

export function remedyCases(orders: Order[], issues: Issue[]): CashRemedyCase[] {
  const byId = new Map(orders.map((order) => [order.id, order]));
  const cases: CashRemedyCase[] = [];
  for (const issue of issues) {
    const order = byId.get(issue.orderId);
    const decision = issue.faultDecision;
    if (!order?.cash || !decision) continue;
    if (!REMEDIES.has(decision.remedy) || decision.fault === "client") continue;
    const p = order.cashProgress ?? {};
    if (!p.collectedAt && !p.repaymentConfirmedAt) continue;
    cases.push({ order, issue, decision, stage: remedyStage(order, decision) });
  }
  return cases;
}

export function remedyStage(order: Order, decision: FaultDecision): RemedyStage {
  const p = order.cashProgress ?? {};
  const live = p.remedy?.decisionId === decision.id ? p.remedy : null;
  if (live?.status === "paid") return "paid";
  if (live?.status === "reserved") return "reserved";
  if (live?.status === "unknown") return "unknown";
  if (
    decision.status !== "approved" ||
    ((decision.gridgoCostMinor ?? 0) > CASH_REMEDY_APPROVAL_MINOR && !decision.approvedBy)
  ) {
    return "needs_super_admin";
  }
  if (isRefundRemedy(decision.remedy) && !p.remedyDestination)
    return "waiting_destination";
  return "ready";
}

export const REMEDY_LABEL: Record<string, string> = {
  partial_refund: "Partial refund",
  full_refund: "Full refund",
  reprint: "Reprint",
  replacement: "Replacement",
};

export const REMEDY_STAGE_COPY: Record<RemedyStage, string> = {
  needs_super_admin: "Waiting for Super Admin to approve the decision",
  waiting_destination: "Waiting for the client's receiving QR",
  ready: "Ready to reserve the transfer",
  reserved: "Transfer reserved, not yet recorded",
  unknown: "Transfer outcome unknown",
  paid: "Paid",
};

// ---- Wallets and ledger ---------------------------------------------------

const amount = (value: number | string | null | undefined): number => Number(value ?? 0);

export type RiderWalletRow = {
  riderId: string;
  /** Spendable: what covers the next cash offer. */
  availableMinor: number;
  /** Held for accepted cash orders. */
  reservedMinor: number;
  balanceMinor: number;
  /** Submitted top-ups not yet confirmed; never spendable. */
  pendingTopupMinor: number;
  lowBalance: boolean;
  /** Every one of the rider's accounts matches its journal entries. */
  ok: boolean;
};

/**
 * Wallets as the ledger derives them. `wallet:<rider>` is available funds,
 * each `held:<order>` belongs to the rider who reserved it, and
 * `pending_topup:<rider>` carries submitted top-ups as a credit.
 */
/** Which rider each held order balance belongs to, from its reservation journal. */
function holdersOf(recon: CashReconciliation): Map<string, string> {
  const holder = new Map<string, string>();
  for (const journal of recon.journals) {
    if (journal.kind === "wallet_reserved" && journal.order_id && journal.rider_id) {
      holder.set(journal.order_id, journal.rider_id);
    }
  }
  return holder;
}

/**
 * Rider wallets from the ledger. Pass only the WHOLE reconciliation (no rider
 * or order filter): the API narrows journals by the filter but not every
 * account, so a filtered read drops reservations and pending top-ups and the
 * figures would no longer be the wallet's.
 */
export function walletsFromLedger(recon: CashReconciliation): RiderWalletRow[] {
  const holder = holdersOf(recon);
  const rows = new Map<string, RiderWalletRow>();
  const row = (riderId: string) => {
    let current = rows.get(riderId);
    if (!current) {
      current = {
        riderId,
        availableMinor: 0,
        reservedMinor: 0,
        balanceMinor: 0,
        pendingTopupMinor: 0,
        lowBalance: false,
        ok: true,
      };
      rows.set(riderId, current);
    }
    return current;
  };
  for (const account of recon.accounts) {
    const [kind, owner] = splitAccount(account.id);
    const balance = amount(account.balanceMinor);
    const matches = balance === amount(account.derivedMinor);
    let target: RiderWalletRow | null = null;
    if (kind === "wallet" && owner) {
      target = row(owner);
      target.availableMinor += balance;
    } else if (kind === "held" && owner) {
      const rider = holder.get(owner);
      if (!rider) continue;
      target = row(rider);
      target.reservedMinor += balance;
    } else if (kind === "pending_topup" && owner) {
      target = row(owner);
      target.pendingTopupMinor += -balance;
    }
    if (target && !matches) target.ok = false;
  }
  return [...rows.values()]
    .map((wallet) => ({
      ...wallet,
      balanceMinor: wallet.availableMinor + wallet.reservedMinor,
      lowBalance: wallet.availableMinor < CASH_LOW_BALANCE_MINOR,
    }))
    .sort(
      (a, b) => a.availableMinor - b.availableMinor || a.riderId.localeCompare(b.riderId),
    );
}

/**
 * Money held for an order whose reservation names no rider. It cannot be put in
 * any wallet, so the desk says so instead of leaving it out of every total.
 */
export function unattributedHeldMinor(recon: CashReconciliation): number {
  const holder = holdersOf(recon);
  return recon.accounts.reduce((total, account) => {
    const [kind, owner] = splitAccount(account.id);
    if (kind !== "held" || !owner || holder.has(owner)) return total;
    return total + amount(account.balanceMinor);
  }, 0);
}

function splitAccount(id: string): [string, string | null] {
  const at = id.indexOf(":");
  return at < 0 ? [id, null] : [id.slice(0, at), id.slice(at + 1)];
}

export const JOURNAL_LABEL: Record<string, string> = {
  topup_pending: "Top-up submitted",
  topup_confirmed: "Top-up confirmed",
  topup_rejected: "Top-up rejected",
  wallet_reserved: "GRIDGO share reserved",
  wallet_released: "Reservation released",
  gridgo_share_debited: "GRIDGO share taken",
  shop_paid: "Shop paid in cash",
  cash_collected: "Cash collected from client",
  voucher_funded: "Voucher credited to rider",
  no_show_returned: "No-show: shop advance reimbursed",
  no_show_repaid: "No-show: client repaid online",
  redelivery_paid: "Redelivery paid online",
  redelivery_settled: "Redelivery fare settled",
  cash_incident_opened: "Shop-cash claim opened",
  cash_incident_resolution: "Shop returned cash",
  remedy_paid: "Remedy paid",
  shop_recovery_created: "Shop receivable recorded",
};

export function journalLabel(kind: string): string {
  return JOURNAL_LABEL[kind] ?? "Other cash movement";
}

/**
 * What a journal moved. Reservations carry no amount in their evidence, so
 * they read it from the order's GRIDGO share; null when unknown.
 */
export function journalAmount(
  journal: CashJournal,
  orders: Map<string, Order>,
): number | null {
  const stated = journal.evidence?.amountMinor;
  if (typeof stated === "number") return stated;
  if (
    ["wallet_reserved", "wallet_released", "gridgo_share_debited"].includes(journal.kind)
  ) {
    const order = journal.order_id ? orders.get(journal.order_id) : undefined;
    return order?.cashAmounts?.gridgoMinor ?? null;
  }
  return null;
}

export const journalBalanced = (journal: CashJournal): boolean =>
  journal.difference === "0" || Number(journal.difference) === 0;

/** Newest first, by the ledger's own sequence where it has one. */
export function sortJournals(journals: CashJournal[]): CashJournal[] {
  return [...journals].sort((a, b) => {
    const t = Date.parse(b.created_at) - Date.parse(a.created_at);
    if (t) return t;
    return Number(b.sequence ?? 0) - Number(a.sequence ?? 0);
  });
}

const CHECK_COPY: Record<string, string> = {
  amount_mismatch: "an entry does not match the order's cash amounts",
  unapproved_remedy: "a remedy was paid without a matching approved decision",
  unbacked_recovery: "a shop receivable has no remedy behind it",
  unsupported_incident_resolution: "a claim was settled by an unsupported resolution",
  unexpected_order_movement: "an unexpected movement is booked to the order",
  duplicate: "the same movement is booked twice",
  collection_and_no_show: "the order is both collected and a no-show",
  shop_payment_without_reservation:
    "the shop was paid without a GRIDGO-share reservation",
  collection_without_shop_payment: "cash was collected without a shop payment",
  refunds_exceed_collection: "refunds exceed the cash collected",
  remedy_fee_funding_exceeded: "remedies used more fee than the order kept",
  incident_balance_mismatch: "the shop-cash claim does not match its returns",
  incident_closure_mismatch: "a settled claim did not cancel the order",
  incident_conflicts_with_client_collection:
    "a shop-cash claim exists on a collected order",
  shop_payment_state_mismatch: "the order and ledger disagree on the shop payment",
  collection_state_mismatch: "the order and ledger disagree on collection",
  no_show_state_mismatch: "the order and ledger disagree on the no-show",
  repayment_state_mismatch: "the order and ledger disagree on the repayment",
  gridgo_share_not_debited: "the GRIDGO share was not taken at collection",
  no_show_reservation_not_released: "the reservation was not released after the no-show",
  redelivery_state_mismatch: "the order and ledger disagree on the redelivery",
};

/** `"cash_…:amount_mismatch"` or `"shop_paid:duplicate"` → plain words. */
export function checkErrorCopy(error: string): string {
  const code = error.includes(":") ? error.slice(error.lastIndexOf(":") + 1) : error;
  return CHECK_COPY[code] ?? "a movement does not reconcile";
}

/** How many separate problems the reconciliation found. */
export function reconciliationProblems(recon: CashReconciliation): number {
  return (
    recon.journals.filter((journal) => !journalBalanced(journal)).length +
    recon.journalChecks.filter((check) => !check.ok).length +
    recon.accounts.filter((a) => amount(a.balanceMinor) !== amount(a.derivedMinor))
      .length +
    recon.invalidReservations.length +
    recon.orderChecks.filter((check) => !check.ok).length
  );
}

// ---- Errors ---------------------------------------------------------------

const ERROR_COPY: Record<string, string> = {
  cash_stale:
    "Someone else changed this cash order a moment ago. The latest is loaded; check it before trying again.",
  cash_idempotency_conflict:
    "This exact request was already sent with different details. Close and start again.",
  cash_reference_required: "Write a reason of up to 120 characters.",
  cash_topup_already_decided:
    "Someone already decided this top-up. The list is refreshed.",
  cash_topup_not_found: "This top-up is no longer on record. The list is refreshed.",
  cash_transfer_duplicate:
    "That reference was already confirmed for another transfer. Check the bank record before confirming.",
  cash_evidence_required:
    "The photo was not accepted. Use a JPEG, PNG or WebP picture uploaded for this step.",
  cash_evidence_already_bound:
    "That picture is already attached to another record. Upload a new one.",
  cash_no_show_not_pending: "This no-show is no longer waiting. The order is refreshed.",
  cash_repayment_not_pending:
    "This repayment is no longer waiting. The order is refreshed.",
  cash_redelivery_payment_not_pending:
    "This redelivery payment is no longer waiting. The order is refreshed.",
  cash_unpaid_cancellation_not_available:
    "This order can no longer be cancelled without a cash return: cash has already moved or the order is closed.",
  cash_incident_not_available:
    "A shop-cash claim can only be opened after the shop was paid and before the client paid.",
  cash_incident_reason_required: "Write what happened, up to 2,000 characters.",
  cash_shop_payment_reconciliation_required:
    "The shop payment on record does not match the order. Check the ledger before opening a claim.",
  cash_incident_not_outstanding: "This claim is already settled. The list is refreshed.",
  cash_return_amount_invalid:
    "The amount must be more than zero and no more than what is still owed.",
  cash_counter_return_confirmation_required:
    "Confirm the rider has the returned cash in hand.",
  cash_resolution_not_enabled: "Only a shop cash return can settle a claim for now.",
  cash_incident_hold:
    "A shop-cash claim is open on this order. Settle the claim before anything else.",
  cash_funded_remedy_not_authorized:
    "The decision does not allow a cash remedy: it must be approved, cite evidence and not be the client's fault.",
  cash_remedy_destination_verification_required:
    "The receiving account changed or is not verified. Reload and check it again.",
  cash_remedy_payer_reserved: "Someone else already reserved this transfer.",
  cash_remedy_already_paid: "This decision was already paid.",
  cash_remedy_exceeds_collection: "This refund would be more than the cash collected.",
  cash_remedy_funding_shortfall:
    "The order kept too little service fee to fund this. Check the decision's GRIDGO amount.",
  cash_remedy_payer_required:
    "Only the person who reserved this transfer, or Super Admin, can finish it.",
  cash_remedy_amount_mismatch: "The amount must be exactly the reserved amount.",
  cash_remedy_reconciliation_required: "Choose what happened to the transfer.",
  cash_disabled: "Cash on delivery is off.",
  forbidden: "Your role cannot do this.",
  order_not_found: "This cash order is no longer on record.",
};

export function cashErrorMessage(err: unknown, fallback: string): string {
  if (!isApiError(err)) return fallback;
  return (
    ERROR_COPY[err.code] ??
    (err.kind === "unauthorized"
      ? "Your session expired. Sign in again to carry on."
      : fallback)
  );
}

/** Errors after which the screen should reload what it shows. */
export function cashErrorNeedsReload(err: unknown): boolean {
  return (
    isApiError(err) &&
    [
      "cash_stale",
      "cash_topup_already_decided",
      "cash_topup_not_found",
      "cash_no_show_not_pending",
      "cash_repayment_not_pending",
      "cash_redelivery_payment_not_pending",
      "cash_incident_not_outstanding",
      "cash_unpaid_cancellation_not_available",
      "cash_incident_not_available",
      "cash_remedy_destination_verification_required",
      "cash_remedy_payer_reserved",
      "cash_remedy_already_paid",
    ].includes(err.code)
  );
}

/** "10 minutes", "1 hour 30 minutes". */
export function formatWait(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} ${h === 1 ? "hour" : "hours"}`);
  if (m || !h) parts.push(`${m} ${m === 1 ? "minute" : "minutes"}`);
  return parts.join(" ");
}
