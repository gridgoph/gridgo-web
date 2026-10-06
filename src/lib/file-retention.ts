/**
 * File retention and early deletion (gridgo-api#131; contract
 * `gridgo-api/docs/STORAGE_API.md`, "DELETE /files/:fileId" and "Retention and
 * daily cleanup").
 *
 * The API owns every rule here. This module only mirrors what the screen must
 * say before the server refuses (a written reason, at most 2,000 characters),
 * names each file type in plain words, and reads the deletion record back out
 * of the audit log, because a deleted file's own metadata answers 404.
 */

import { isApiError } from "@/lib/api/client";
import type { AuditEntry, Order, StoredFile } from "@/lib/api/types";

export type { FileRetentionReport } from "@/lib/api/types";

export const FILE_EARLY_DELETE_ACTION = "file.early_delete";
export const FILE_RETENTION_DELETE_ACTION = "file.retention_delete";

/** Mirrors `400 reason_too_long`. */
export const EARLY_DELETE_REASON_MAX = 2000;

/**
 * The retention classes, in the order the screen lists them. Periods are the
 * captain's decision of 4 Oct 2026 as written in STORAGE_API.md; the API does
 * not return them, so they are read-only words here, never a rule the
 * dashboard applies.
 */
export type RetentionClass = {
  id: "artwork" | "money" | "photos" | "verification" | "unused";
  label: string;
  keptFor: string;
  purposes: readonly string[];
};

export const RETENTION_CLASSES: readonly RetentionClass[] = [
  {
    id: "artwork",
    label: "Artwork and design files",
    keptFor: "30 days after the order is completed",
    purposes: ["artwork", "mockup"],
  },
  {
    id: "money",
    label: "Money proof",
    keptFor: "5 years after the order closes",
    purposes: ["payment_proof", "payout_receipt", "refund_receipt", "refund_qr", "refund_evidence"],
  },
  {
    id: "photos",
    label: "Production and delivery photos, signatures",
    keptFor: "1 year after the order closes",
    purposes: ["production_photo", "fulfilment_proof", "delivery_photo", "handoff_signature"],
  },
  {
    id: "verification",
    label: "ID and verification documents",
    keptFor: "while the account is active, then 1 year after it closes or the application is rejected",
    purposes: ["verification_document", "rider_verification_document"],
  },
  {
    id: "unused",
    label: "Uploads nothing uses",
    keptFor: "1 day after upload, once nothing uses them",
    purposes: [
      "catalog_item_photo",
      "service_image",
      "supplier_shop_image",
      "supplier_payout_qr",
      "payment_qr",
      "announcement_image",
      "tracker_decision",
    ],
  },
];

const PURPOSE_LABELS: Record<string, string> = {
  artwork: "Artwork",
  mockup: "Mockup",
  payment_proof: "Payment screenshot",
  payout_receipt: "Payout receipt",
  refund_receipt: "Refund receipt",
  refund_qr: "Client refund QR",
  refund_evidence: "Refund evidence",
  production_photo: "Production photo",
  fulfilment_proof: "Shop or rider proof",
  order_photo: "Order photo",
  delivery_photo: "Delivery photo",
  handoff_signature: "Handoff signature",
  verification_document: "Shop verification document",
  rider_verification_document: "Rider verification document",
  catalog_item_photo: "Listing photo",
  service_image: "Service line image",
  supplier_shop_image: "Shop photo",
  supplier_payout_qr: "Shop receiving QR",
  payment_qr: "Checkout QR",
  announcement_image: "Announcement image",
  tracker_decision: "Tracker decision attachment",
  support_chat_image: "Chat photo",
};

/** Plain words for a file `purpose`; an unknown one reads as words, never snake_case. */
export function filePurposeLabel(purpose: string | null | undefined): string {
  if (!purpose) return "File";
  const known = PURPOSE_LABELS[purpose];
  if (known) return known;
  const words = purpose.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "File";
}

export type RetentionRow = { purpose: string; label: string; count: number };
export type RetentionGroup = RetentionClass & { rows: RetentionRow[]; count: number };

/**
 * Every class with every one of its file types (absent purposes count zero),
 * plus any purpose the API counted that this list does not know yet, under
 * "Uploads nothing uses" — the only class an unclassified file can reach.
 */
export function retentionGroups(byPurpose: Record<string, number> | null | undefined): RetentionGroup[] {
  const counts = byPurpose ?? {};
  const known = new Set(RETENTION_CLASSES.flatMap((group) => group.purposes));
  const extra = Object.keys(counts)
    .filter((purpose) => !known.has(purpose))
    .sort();
  return RETENTION_CLASSES.map((group) => {
    const purposes = group.id === "unused" ? [...group.purposes, ...extra] : group.purposes;
    const rows = purposes.map((purpose) => ({
      purpose,
      label: filePurposeLabel(purpose),
      count: safeCount(counts[purpose]),
    }));
    return { ...group, rows, count: rows.reduce((sum, row) => sum + row.count, 0) };
  });
}

function safeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Inline mirror of `400 reason_required` / `reason_too_long`. */
export function earlyDeleteReasonError(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) return "Write why this file is being deleted. The reason is kept in the audit log.";
  if (trimmed.length > EARLY_DELETE_REASON_MAX) {
    return `Keep the reason to ${EARLY_DELETE_REASON_MAX.toLocaleString("en-PH")} characters or fewer.`;
  }
  return null;
}

/** Recovery copy for a refused `DELETE /files/:id`. */
export function earlyDeleteErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    switch (err.code) {
      case "file_retention_hold":
        return "An open issue, claim, refund, dispute or pickup escalation holds this file. Nobody can delete it until that case is closed.";
      case "reason_required":
        return "Write why this file is being deleted.";
      case "reason_too_long":
        return `Keep the reason to ${EARLY_DELETE_REASON_MAX.toLocaleString("en-PH")} characters or fewer.`;
      case "file_state_conflict":
        return "This file is still uploading or already being deleted. Refresh the page.";
      case "file_not_found":
        return "This file is already gone. Refresh the page.";
    }
    switch (err.kind) {
      case "forbidden":
        return "Only Super Admin can delete a file early.";
      case "unauthorized":
        return "Your session expired. Sign in again as Super Admin.";
      case "not_found":
        return "This file is already gone. Refresh the page.";
      case "server":
        return "The file could not be deleted right now. Nothing was removed. Try again in a moment.";
    }
  }
  return "The file could not be deleted. Nothing was removed. Try again.";
}

/** A file's deletion, as the audit log recorded it. */
export type FileDeletionRecord = {
  fileId: string;
  kind: "early" | "retention";
  at: string;
  actorId: string | null;
  actorRole: string | null;
  reason: string | null;
  purpose: string | null;
};

function isDeletionAction(action: string): boolean {
  return action === FILE_EARLY_DELETE_ACTION || action === FILE_RETENTION_DELETE_ACTION;
}

function toRecord(entry: AuditEntry): FileDeletionRecord {
  const purpose = entry.detail?.purpose;
  return {
    fileId: entry.entityId as string,
    kind: entry.action === FILE_EARLY_DELETE_ACTION ? "early" : "retention",
    at: entry.at,
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    reason: entry.reason?.trim() || null,
    purpose: typeof purpose === "string" ? purpose : null,
  };
}

/** The newest deletion entry for one file, or null when the log has none. */
export function fileDeletionRecord(
  entries: AuditEntry[] | null | undefined,
  fileId: string,
): FileDeletionRecord | null {
  const found = (entries ?? [])
    .filter((entry) => entry.entityId === fileId && isDeletionAction(entry.action))
    .sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  return found ? toRecord(found) : null;
}

/** Deletion entries for the files this order carries, newest first, one per file. */
export function orderFileDeletions(
  entries: AuditEntry[] | null | undefined,
  order: Order | null | undefined,
): FileDeletionRecord[] {
  if (!order) return [];
  const ids = new Set(orderFileIds(order));
  const seen = new Set<string>();
  return (entries ?? [])
    .filter((entry) => entry.entityId && ids.has(entry.entityId) && isDeletionAction(entry.action))
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .filter((entry) => {
      if (seen.has(entry.entityId as string)) return false;
      seen.add(entry.entityId as string);
      return true;
    })
    .map(toRecord);
}

/**
 * Every file id the order names, wherever it names it. The API keeps file ids
 * on the order after deletion ("references and domain snapshots remain"), and
 * every such field is named `…FileId` or `…FileIds`, so the walk follows the
 * field names rather than guessing at id shapes.
 */
export function orderFileIds(order: unknown): string[] {
  const out = new Set<string>();
  const walk = (value: unknown, depth: number) => {
    if (depth > 6 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (/FileId$/.test(key) && typeof child === "string" && child) out.add(child);
      else if (/FileIds$/.test(key) && Array.isArray(child)) {
        for (const id of child) if (typeof id === "string" && id) out.add(id);
      } else walk(child, depth + 1);
    }
  };
  walk(order, 0);
  return [...out];
}

/** "Used by order ord_…" lines for the confirmation, from the file's references. */
export function fileOrderReferences(file: Pick<StoredFile, "references">): string[] {
  const ids = new Set<string>();
  for (const reference of file.references ?? []) {
    if (reference.type === "order" && reference.id) ids.add(reference.id);
  }
  return [...ids];
}

/** A missing file reads as gone, not as a network fault to retry. */
export function fileIsGone(err: unknown): boolean {
  return isApiError(err) && err.status === 404;
}
