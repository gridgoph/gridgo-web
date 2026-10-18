import type {
  ApprovalMethod,
  ApprovalProofRecordSummary,
  ApprovalRequirement,
  ApprovalSnapshot,
  ApprovalSnapshotItem,
  OrderApprovalProofSummary,
} from "@/lib/api/types";
import { orderedSizeLabel } from "@/lib/artwork-guidance";
import { formatDateTime } from "@/lib/format";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

/**
 * What the client approved (gridgo-api `docs/APPROVAL_PROOF_API.md`), worded
 * for Operations. Records are append-only and frozen; a `legacy_unrecorded`
 * record means no approval was collected and is never shown as signed.
 */

export function methodLabel(method: ApprovalMethod | null): string {
  if (method === "drawn") return "Drawn signature";
  if (method === "one_tap") return "One-tap approval";
  return "No approval";
}

export function phaseLabel(phase: ApprovalProofRecordSummary["phase"]): string {
  return phase === "sample" ? "Sample approval" : "Checkout approval";
}

/** What the API asks of this order, snapshotted when it was placed. */
export function requirementLine(requirement: ApprovalRequirement | null): string {
  if (!requirement) {
    return "This order was placed before approval records began, so none was asked for.";
  }
  const method = requirement.method === "drawn" ? "a drawn signature" : "a one-tap approval";
  return requirement.required
    ? `Required before the order proceeds: ${method}.`
    : `Not required when this order was placed (approval was still being rolled out). Its product type calls for ${method}.`;
}

export function recordStatusChip(record: Pick<ApprovalProofRecordSummary, "status">): {
  tone: StatusTone;
  icon: StatusIconName;
  label: string;
} {
  return record.status === "approved"
    ? { tone: "success", icon: "circle-check", label: "Approved by the client" }
    : { tone: "neutral", icon: "circle-dashed", label: "No approval collected" };
}

/** The workspace row is shown when there is a record, or a policy asking for one. */
export function approvalRowVisible(summary: OrderApprovalProofSummary | null | undefined): boolean {
  return Boolean(summary && (summary.requirement || summary.records.length));
}

export function latestApproval(
  summary: Pick<OrderApprovalProofSummary, "records">,
): ApprovalProofRecordSummary | null {
  const approved = summary.records.filter((record) => record.status === "approved");
  return approved.at(-1) ?? null;
}

/** One line for the closed row. */
export function approvalRowSummary(summary: OrderApprovalProofSummary): string {
  const latest = latestApproval(summary);
  if (latest) {
    const more = summary.records.length > 1 ? ` · ${summary.records.length} records` : "";
    const sample = latest.phase === "sample" ? "Sample approved" : methodLabel(latest.method);
    return `${sample}, ${formatDateTime(latest.at)}${more}`;
  }
  if (summary.records.length) return "No approval collected (recorded before approvals were required)";
  if (summary.requirement?.required) {
    return `Not approved yet · ${methodLabel(summary.requirement.method).toLowerCase()} required`;
  }
  return "No approval recorded";
}

export type ApprovalRowTone = "approved" | "waiting" | "quiet";

export function approvalRowTone(summary: OrderApprovalProofSummary): ApprovalRowTone {
  if (latestApproval(summary)) return "approved";
  if (summary.requirement?.required && !summary.records.length) return "waiting";
  return "quiet";
}

/** "Size: A5 · Paper: Matte 150gsm". */
export function optionsLine(item: ApprovalSnapshotItem): string | null {
  const parts = (item.options ?? [])
    .map((option) => {
      const name = option.groupNameSnapshot?.trim();
      const value = option.optionLabelSnapshot?.trim();
      if (!value) return null;
      return name ? `${name}: ${value}` : value;
    })
    .filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : null;
}

export function itemSizeLine(item: ApprovalSnapshotItem): string | null {
  const m = item.measurement;
  if (!m) return null;
  if (m.widthMilli && m.heightMilli) {
    return orderedSizeLabel({ widthMilli: m.widthMilli, heightMilli: m.heightMilli });
  }
  if (m.lengthMilli) return `${Math.round(m.lengthMilli / 1000)} mm long`;
  if (m.pages) return m.pages === 1 ? "1 page" : `${m.pages} pages`;
  return null;
}

/** The first 12 characters of a SHA-256, enough to compare two records by eye. */
export function shortDigest(sha256: string | null | undefined): string | null {
  if (!sha256) return null;
  return sha256.slice(0, 12);
}

export function fileSizeLabel(bytes: number | null | undefined): string | null {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Older quoted orders keep their agreed spec on the order, not on lines. */
export function snapshotSpecLines(snapshot: ApprovalSnapshot): string[] {
  const spec = snapshot.specification;
  if (!spec) return [];
  return [
    spec.title ? `Title: ${spec.title}` : null,
    typeof spec.quantity === "number" ? `Quantity: ${spec.quantity}` : null,
    spec.size ? `Size: ${spec.size}` : null,
    spec.material ? `Material: ${spec.material}` : null,
    spec.finish ? `Finish: ${spec.finish}` : null,
  ].filter((line): line is string => Boolean(line));
}

export const APPROVAL_PROOF_FILENAME = (orderId: string) =>
  `gridgo-approval-proof-${orderId}.pdf`;
