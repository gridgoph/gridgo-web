import type { AuditEntry } from "@/lib/api/types";

export type AuditPageFilters = {
  actor: string;
  action: string;
  orderId: string;
  from: string;
  to: string;
};

const COLUMNS = [
  "when",
  "who",
  "role",
  "where",
  "action",
  "item",
  "old",
  "new",
  "reason",
  "order",
] as const;

function cell(value: unknown): string {
  const text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function whereOf(entry: AuditEntry): string {
  const source = entry.source;
  if (!source) return "";
  return [source.app, source.device].filter(Boolean).join(" · ");
}

export function itemOf(entry: AuditEntry): string {
  return [entry.entityType, entry.entityId].filter(Boolean).join(" ");
}

/** The same rows the audit page is showing, as CSV. */
export function auditCsv(entries: readonly AuditEntry[]): string {
  const lines = [COLUMNS.join(",")];
  for (const entry of entries) {
    lines.push(
      [
        entry.at,
        entry.actorName || entry.actorId || "",
        entry.actorRole || "",
        whereOf(entry),
        entry.action,
        itemOf(entry),
        entry.previous ?? "",
        entry.current ?? "",
        entry.reason || "",
        entry.orderId || "",
      ]
        .map(cell)
        .join(","),
    );
  }
  return lines.join("\n");
}
