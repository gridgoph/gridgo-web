/**
 * Client refunds as Operations and Super Admin work them
 * (contract: `gridgo-api/docs/REFUNDS_API.md`, policy `available_funds_v1`).
 *
 * The rules the screens must never blur:
 *
 * - Approval is not payment. An approved refund reserves money and sends none;
 *   nothing reads "refunded" until a person records the wallet transfer.
 * - The wallet screenshot is transfer evidence, never an official receipt.
 * - Money already paid to a shop or earned by a rider is never taken back, and
 *   there is no override for more than the funds still available.
 * - A late filing (after the complaint deadline) is Super Admin's to decide.
 * - Once a payer reserves a transfer, only that payer or Super Admin records
 *   or reconciles it, and an unconfirmed transfer is never sent twice.
 *
 * Pure functions: no React, no fetch.
 */

import type {
  PortalRole,
  RefundAmounts,
  RefundHistoryEntry,
  RefundRequest,
  SupplierSettlementPayout,
} from "@/lib/api/types";
import type { StatePresentation } from "@/lib/order-state";

export const TRANSFER_EVIDENCE_LABEL = "Wallet transfer evidence";
export const SETTLEMENT_PAYOUT_LABEL = "Agreed refund settlement payout";

/** Requests that still hold the order's work and payouts. */
export const ACTIVE_REFUND_STATUSES = new Set([
  "requested",
  "reviewed",
  "approved",
  "destination_review",
  "payment_in_progress",
  "payment_unknown",
]);

export function refundIsActive(refund: Pick<RefundRequest, "status">): boolean {
  return ACTIVE_REFUND_STATUSES.has(refund.status);
}

/** Before a settlement: the request can still be rejected or withdrawn. */
export function refundIsUndecided(refund: Pick<RefundRequest, "status">): boolean {
  return refund.status === "requested" || refund.status === "reviewed";
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export function refundKindLabel(kind: string): string {
  if (kind === "cancellation") return "Cancellation";
  if (kind === "complaint") return "Complaint";
  return "Refund request";
}

/**
 * Status words. "Approved" always says the money has not gone yet, so nobody
 * reads an approval as a refund paid.
 */
export function presentRefundStatus(status: string): StatePresentation {
  switch (status) {
    case "requested":
      return { label: "Waiting for review", tone: "warning", icon: "clock" };
    case "reviewed":
      return { label: "Reviewed, not settled", tone: "info", icon: "circle-dot" };
    case "approved":
      return { label: "Approved, not yet sent", tone: "info", icon: "clock" };
    case "destination_review":
      return { label: "New receiving QR to verify", tone: "warning", icon: "square-pen" };
    case "payment_in_progress":
      return { label: "Transfer reserved", tone: "info", icon: "clock" };
    case "payment_unknown":
      return { label: "Transfer unconfirmed", tone: "error", icon: "triangle-alert" };
    case "paid":
      return { label: "Paid to the client", tone: "success", icon: "circle-check" };
    case "rejected":
      return { label: "Rejected", tone: "neutral", icon: "circle-x" };
    case "withdrawn":
      return { label: "Withdrawn by the client", tone: "neutral", icon: "ban" };
    default:
      return { label: "Unknown status", tone: "neutral", icon: "circle-help" };
  }
}

/** The status chip for a request, which also says when it waits on the client. */
export function presentRefundState(
  refund: Pick<RefundRequest, "status" | "destination">,
): StatePresentation {
  if (refund.status === "requested" && !refund.destination) {
    return { label: "Waiting on the client's QR", tone: "neutral", icon: "clock" };
  }
  return presentRefundStatus(refund.status);
}

/** History rows in plain words. `supplier_paid` reaches staff only. */
export function refundHistoryLabel(entry: Pick<RefundHistoryEntry, "kind">): string {
  switch (entry.kind) {
    case "requested":
      return "Refund requested. Work and payouts paused";
    case "reviewed":
      return "Reviewed";
    case "settled":
      return "Settlement approved. No money sent yet";
    case "destination":
      return "Client replaced their receiving QR";
    case "attempt":
      return "Transfer reserved by one payer";
    case "unknown":
      return "Transfer marked unconfirmed";
    case "failed":
      return "Confirmed no money left the wallet";
    case "paid":
      return "Transfer to the client recorded";
    case "rejected":
      return "Rejected";
    case "withdrawn":
      return "Withdrawn by the client";
    case "supplier_paid":
      return "Shop settlement payout recorded";
    default:
      return "Updated";
  }
}

export const SENDING_WALLET_PROVIDERS: readonly { value: string; label: string }[] = [
  { value: "gcash", label: "GCash" },
  { value: "maya", label: "Maya" },
  { value: "bank", label: "Bank transfer" },
  { value: "other", label: "Other wallet" },
];

export function walletLabel(provider: string | null | undefined): string {
  const found = SENDING_WALLET_PROVIDERS.find((option) => option.value === provider);
  if (found) return found.label;
  return provider ? provider : "Wallet";
}

// ---------------------------------------------------------------------------
// Authority
// ---------------------------------------------------------------------------

export type RefundViewer = { role: PortalRole | string; userId: string | null };

/** A late case is decided by Super Admin only; Operations may read it. */
export function canDecideRefund(
  refund: Pick<RefundRequest, "late">,
  viewer: Pick<RefundViewer, "role">,
): boolean {
  if (viewer.role !== "ops_admin" && viewer.role !== "super_admin") return false;
  return !refund.late || viewer.role === "super_admin";
}

/** The reserved payer or Super Admin records or reconciles a transfer. */
export function canRecordTransfer(
  refund: Pick<RefundRequest, "attempt">,
  viewer: RefundViewer,
): boolean {
  if (!refund.attempt) return false;
  if (viewer.role === "super_admin") return true;
  return viewer.role === "ops_admin" && refund.attempt.payerId === viewer.userId;
}

// ---------------------------------------------------------------------------
// The inbox
// ---------------------------------------------------------------------------

export type RefundInboxGroup =
  | "reconcile"
  | "review"
  | "settle"
  | "pay"
  | "in-progress"
  | "client-qr"
  | "super-admin"
  | "closed";

/**
 * The questions the refund inbox answers, most urgent first. An unconfirmed
 * transfer leads: money may have moved, and nobody should send it again.
 */
export const REFUND_INBOX_GROUPS: readonly {
  id: RefundInboxGroup;
  label: string;
  hint: string;
}[] = [
  {
    id: "reconcile",
    label: "Transfer unconfirmed",
    hint: "Check the wallet history. Record the same transfer, or confirm nothing left. Never send again.",
  },
  {
    id: "review",
    label: "Needs a review",
    hint: "Read the reason and evidence, then check the client's receiving QR.",
  },
  {
    id: "settle",
    label: "Ready to settle",
    hint: "Agree what the shop keeps, preview the refund, then approve it.",
  },
  {
    id: "pay",
    label: "Approved, ready to pay",
    hint: "Reserve the transfer for yourself before you open a wallet.",
  },
  {
    id: "in-progress",
    label: "Transfer reserved",
    hint: "One person is sending this. Only they, or Super Admin, record it.",
  },
  {
    id: "client-qr",
    label: "Waiting on the client's QR",
    hint: "Only the client can add their receiving QR, in the GRIDGO app.",
  },
  {
    id: "super-admin",
    label: "Late, with Super Admin",
    hint: "Filed after the complaint deadline. Super Admin decides these.",
  },
  {
    id: "closed",
    label: "Closed",
    hint: "Paid, rejected or withdrawn. Kept for the record.",
  },
];

export function refundInboxGroup(
  refund: Pick<RefundRequest, "status" | "late" | "destination">,
  role: PortalRole | string,
): RefundInboxGroup {
  switch (refund.status) {
    case "payment_unknown":
      return "reconcile";
    case "payment_in_progress":
      return "in-progress";
    case "approved":
      return "pay";
    case "destination_review":
      return "review";
    case "requested":
    case "reviewed":
      if (refund.late && role !== "super_admin") return "super-admin";
      if (refund.status === "reviewed") return "settle";
      return refund.destination ? "review" : "client-qr";
    default:
      return "closed";
  }
}

/**
 * Requests waiting on this desk, for the rail's count: a transfer to
 * reconcile, a review, a settlement or a payment to reserve. A transfer
 * already reserved, a missing client QR and (for Operations) a late case are
 * waiting on someone else.
 */
export function refundNeedsStaff(
  refund: Pick<RefundRequest, "status" | "late" | "destination">,
  role: PortalRole | string,
): boolean {
  const group = refundInboxGroup(refund, role);
  return (
    group === "reconcile" || group === "review" || group === "settle" || group === "pay"
  );
}

/** Pending shop settlement payouts across the inbox, with their request. */
export function pendingShopSettlements(
  refunds: readonly RefundRequest[],
): { refund: RefundRequest; payout: SupplierSettlementPayout }[] {
  return refunds.flatMap((refund) =>
    (refund.supplierSettlementPayouts ?? [])
      .filter(
        (payout) =>
          payout.status === "pending" && payout.settlementId === refund.settlement?.id,
      )
      .map((payout) => ({ refund, payout })),
  );
}

/**
 * One sentence for an inbox row or a case header: what happens next, and who
 * does it. Written from the reader's side of the desk.
 */
export function refundNextStep(refund: RefundRequest, viewer: RefundViewer): string {
  const decides = canDecideRefund(refund, viewer);
  switch (refund.status) {
    case "requested":
      if (!refund.destination) {
        return "Waiting on the client to add their own receiving QR. Nothing can be reviewed before that.";
      }
      return decides
        ? "Review the reason and evidence, and check the client's receiving QR."
        : "Filed late. Super Admin reviews and decides this one.";
    case "reviewed":
      return decides
        ? "Agree what the shop keeps, preview the refund, then approve it."
        : "Filed late. Super Admin settles or rejects this one.";
    case "destination_review":
      return "The client replaced their receiving QR after approval. Verify the new one before anyone pays.";
    case "approved":
      return "Approved. No money has been sent. Reserve the transfer for yourself before you open a wallet.";
    case "payment_in_progress":
      return canRecordTransfer(refund, viewer)
        ? "Reserved for you. Send the exact amount, then record the reference and screenshot."
        : "Reserved by another payer. Only they, or Super Admin, record this transfer.";
    case "payment_unknown":
      return "The wallet did not confirm. Do not send again. Record the same transfer, or confirm no money left.";
    case "paid":
      return "Paid. The wallet transfer and its evidence are on record.";
    case "rejected":
      return "Rejected. The client has the reason.";
    case "withdrawn":
      return "The client withdrew this request.";
    default:
      return "Open the case to see where it stands.";
  }
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export function sumComponents(parts: {
  principalMinor: number;
  feeMinor: number;
  deliveryMinor: number;
}): number {
  return parts.principalMinor + parts.feeMinor + parts.deliveryMinor;
}

/** Total of every earlier settlement on the same order (approved, paid or not). */
export function previousRefundTotal(
  refund: Pick<RefundRequest, "previousRefunds">,
): number {
  return (refund.previousRefunds ?? []).reduce((total, row) => total + row.totalMinor, 0);
}

export type LedgerLine = {
  label: string;
  /** Positive amounts; `sign` says which way they move the line below. */
  minor: number;
  sign: "plus" | "minus" | "total";
  note?: string;
};

/**
 * The settlement as arithmetic anyone can check: verified money in, less what
 * is already spoken for, equals what can go back. Every figure is the
 * server's; this only arranges them.
 */
export function settlementLedger(amounts: RefundAmounts): LedgerLine[] {
  const collected = sumComponents(amounts.collected);
  const previous = sumComponents(amounts.previous);
  const lines: LedgerLine[] = [
    { label: "Verified from the client", minor: collected, sign: "plus" },
  ];
  if (previous > 0) {
    lines.push({ label: "Already refunded or reserved", minor: previous, sign: "minus" });
  }
  if (amounts.releasedMinor > 0) {
    lines.push({
      label: "Already paid to the shop",
      minor: amounts.releasedMinor,
      sign: "minus",
      note: "Never taken back.",
    });
  }
  if (amounts.remainingShopMinor > 0) {
    lines.push({
      label: "Still owed to the shop",
      minor: amounts.remainingShopMinor,
      sign: "minus",
      note: "Paid later as the agreed settlement payout.",
    });
  }
  if (amounts.riderEntitlementMinor > 0) {
    lines.push({
      label: "Rider's earnings",
      minor: amounts.riderEntitlementMinor,
      sign: "minus",
      note: "Protected.",
    });
  }
  const retained =
    collected -
    previous -
    amounts.releasedMinor -
    amounts.remainingShopMinor -
    amounts.riderEntitlementMinor -
    amounts.totalMinor;
  if (retained > 0) {
    lines.push({
      label: "Kept by GRIDGO",
      minor: retained,
      sign: "minus",
      note: "Service fee on the work done, delivery already made, or principal not refunded.",
    });
  }
  lines.push({ label: "Refund to the client", minor: amounts.totalMinor, sign: "total" });
  return lines;
}

/** The refund itself, component by component. */
export function refundComponentLines(
  amounts: Pick<RefundAmounts, "principalMinor" | "feeMinor" | "deliveryMinor">,
): { label: string; minor: number }[] {
  return [
    { label: "Print work", minor: amounts.principalMinor },
    { label: "Service fee on it", minor: amounts.feeMinor },
    { label: "Unused delivery", minor: amounts.deliveryMinor },
  ];
}

/** "2026-09-28T14:05" in the reader's local time, for a datetime-local field. */
export function localDateTimeInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** A datetime-local value back to an ISO instant, or null when empty or invalid. */
export function isoFromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/**
 * The same command, retried, must carry the same key so the server replays
 * its answer instead of acting twice. A different body is a different command.
 */
export function commandKeyCache(create: () => string): (body: unknown) => string {
  const keys = new Map<string, string>();
  return (body) => {
    const signature = JSON.stringify(body);
    const existing = keys.get(signature);
    if (existing) return existing;
    const key = create();
    keys.set(signature, key);
    return key;
  };
}
