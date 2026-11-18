/**
 * Cash on delivery and rider wallets: the Operations and Super Admin routes
 * (contract `gridgo-api/docs/CASH_ON_DELIVERY_API.md`).
 *
 * Every amount is safe-integer PHP centavos. Every write carries an
 * `Idempotency-Key` (one per body: a retry replays the first answer), and
 * every order write the order's current cash `expectedVersion`.
 */

import { apiRequest } from "@/lib/api/client";
import type { StoredFile } from "@/lib/api/types";

// ---- Reads ----------------------------------------------------------------

/**
 * One rider top-up as the API stores it: the pending journal row, with the
 * decision journal's kind when Operations has decided. Snake case is the
 * API's own shape (`GET /ops/cash/topups` returns journal rows).
 */
export type CashTopupRow = {
  id: string;
  kind: "topup_pending" | (string & {});
  rider_id: string;
  actor_id?: string | null;
  created_at: string;
  evidence: {
    reference: string;
    amountMinor: number;
    screenshotFileId?: string | null;
  };
  /** `topup_confirmed`, `topup_rejected`, or null while waiting. */
  decision: "topup_confirmed" | "topup_rejected" | null | (string & {});
};

export type CashIncident = {
  id: string;
  orderId: string;
  shopId: string;
  riderId: string;
  /** The rider's actual shop advance this claim covers. */
  amountMinor: number;
  resolvedMinor: number;
  remainingMinor: number;
  status: "outstanding" | "resolved" | (string & {});
  incidentVersion: number;
  createdAt: string;
  reason?: string;
  evidenceFileId?: string | null;
};

export type CashJournal = {
  id: string;
  event_key?: string;
  kind: string;
  order_id: string | null;
  rider_id: string | null;
  actor_id?: string | null;
  evidence: Record<string, unknown> & { amountMinor?: number; reference?: string };
  created_at: string;
  sequence?: number | string;
  /** Sum of the journal's entries, as text; "0" when balanced. */
  difference: string;
};

export type CashAccountBalance = {
  /** `wallet:<riderId>`, `held:<orderId>`, `pending_topup:<riderId>`, `gridgo_bank`, … */
  id: string;
  balanceMinor: number | string;
  derivedMinor: number;
};

export type CashOrderCheck = {
  orderId: string;
  ok: boolean;
  errors: string[];
  netByAccount: Record<string, number>;
};

export type CashReconciliation = {
  ok: boolean;
  orderChecks: CashOrderCheck[];
  journalChecks: { journalId: string; ok: boolean }[];
  journals: CashJournal[];
  accounts: CashAccountBalance[];
  invalidReservations: { order_id: string }[];
};

/** Newest first; the latest 100 top-ups, decided ones included. */
export async function listCashTopups(): Promise<CashTopupRow[]> {
  const result = await apiRequest<{ topups: CashTopupRow[] }>("/ops/cash/topups");
  return result.topups ?? [];
}

/** Newest first, at most 100. */
export async function listCashIncidents(
  status?: "outstanding" | "resolved",
): Promise<CashIncident[]> {
  const qs = status ? `?status=${status}` : "";
  const result = await apiRequest<{ incidents: CashIncident[] }>(
    `/ops/cash/incidents${qs}`,
  );
  return result.incidents ?? [];
}

/**
 * One file the staff evidence picker offers for a cash order
 * (`GET /ops/cash/orders/:id/evidence`, gridgo-api#401): evidence already
 * bound to the order (`used`), plus the related rider's unused shop-return and
 * incident photos. `previewUrl` is a short-lived signed image link: keep it in
 * memory only and read the list again once `expiresAt` passes.
 */
export type CashEvidenceFile = {
  fileId: string;
  purpose: string;
  /** The owner's current role, or null. */
  ownerRole: string | null;
  uploadedAt: string;
  used: boolean;
  previewUrl: string | null;
  expiresAt: string | null;
  /** The record exists but its picture cannot be shown. */
  unavailable?: boolean;
  error?: "storage_object_missing" | "storage_object_mismatch" | "minio_unavailable";
};

/** Operations and Super Admin only; newest first. */
export async function listCashEvidence(orderId: string): Promise<CashEvidenceFile[]> {
  const result = await apiRequest<{ files: CashEvidenceFile[] }>(
    `/ops/cash/orders/${encodeURIComponent(orderId)}/evidence`,
  );
  return result.files ?? [];
}

/** The whole ledger, or one order's or one rider's movements. */
export async function getCashReconciliation(
  filters: { orderId?: string | null; riderId?: string | null } = {},
): Promise<CashReconciliation> {
  const params = new URLSearchParams();
  if (filters.orderId) params.set("orderId", filters.orderId);
  if (filters.riderId) params.set("riderId", filters.riderId);
  const qs = params.toString();
  return apiRequest<CashReconciliation>(`/ops/cash/reconciliation${qs ? `?${qs}` : ""}`);
}

// ---- Writes ---------------------------------------------------------------

function command(key: string, body: Record<string, unknown>): RequestInit {
  return {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(body),
  };
}

/** What every order write answers: the new cash version to send next. */
export type CashWriteResult = {
  cash: { version: number; status: string; progress?: Record<string, unknown> };
  incident?: CashIncident;
};

/** Bank verification: credits the rider's wallet exactly once. */
export async function confirmCashTopup(
  topupId: string,
  input: { reason: string },
  key: string,
): Promise<{ topup: { id: string; status: string } }> {
  return apiRequest(
    `/ops/cash/topups/${encodeURIComponent(topupId)}/confirm`,
    command(key, input),
  );
}

/** Closes the pending top-up without any wallet credit. */
export async function rejectCashTopup(
  topupId: string,
  input: { reason: string },
  key: string,
): Promise<{ topup: { id: string; status: string } }> {
  return apiRequest(
    `/ops/cash/topups/${encodeURIComponent(topupId)}/reject`,
    command(key, input),
  );
}

export type CashOrderAction =
  | "approve-no-show"
  | "reject-no-show"
  | "confirm-repayment"
  | "reject-repayment"
  | "confirm-redelivery"
  | "reject-redelivery"
  | "cancel-unpaid"
  | "incident-open"
  | "incident-return"
  | "remedy-reserve"
  | "remedy-pay"
  | "remedy-reconcile";

/**
 * One Operations cash write on an order. `body` always carries
 * `expectedVersion` (the order's `cash.version`); a stale one is
 * `409 cash_stale`.
 */
export async function cashOrderAction(
  orderId: string,
  action: CashOrderAction,
  body: { expectedVersion: number } & Record<string, unknown>,
  key: string,
): Promise<CashWriteResult> {
  return apiRequest<CashWriteResult>(
    `/ops/cash/orders/${encodeURIComponent(orderId)}/${action}`,
    command(key, body),
  );
}

/** Staff-owned cash evidence. JPEG, PNG or WebP, 15 MiB. */
export type StaffCashEvidencePurpose =
  | "cash_return_photo"
  | "cash_incident_photo"
  | "cash_remedy_receipt"
  | "cash_reprint_receipt";

/** Stores the picture; the cash route binds it when its id is sent. */
export async function uploadCashEvidence(
  file: File,
  purpose: StaffCashEvidencePurpose,
): Promise<StoredFile> {
  const body = new FormData();
  body.append("purpose", purpose);
  body.append("file", file);
  const uploaded = await apiRequest<{ file: StoredFile }>("/files", {
    method: "POST",
    body,
  });
  return uploaded.file;
}
