import { ArrowRight } from "lucide-react";

import type { AuditEntry } from "@/lib/api/types";
import {
  auditChangeSummary,
  auditFieldLabel,
  presentAuditValue,
  type AuditFieldRow,
  type AuditNames,
} from "@/lib/audit";

/**
 * A field's old value, then its new one. The old value is quieter; the arrow
 * carries the direction, so the change still reads in greyscale.
 */
export function BeforeAfter({ row, names }: { row: AuditFieldRow; names?: AuditNames }) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5">
      <span className="text-text-muted break-words">{presentAuditValue(row.key, row.before, names)}</span>
      <ArrowRight aria-label="changed to" className="text-text-muted size-3.5 shrink-0 self-center" />
      <span className="text-text-primary break-words" style={{ fontFamily: "var(--font-medium)" }}>
        {presentAuditValue(row.key, row.after, names)}
      </span>
    </span>
  );
}

/**
 * The entry's change in a line or two, for list rows: the first fields that
 * changed, or what kind of record it is. The whole record is in the sheet.
 */
export function AuditChangeLine({
  entry,
  names,
  max = 2,
}: {
  entry: Pick<AuditEntry, "action" | "before" | "after">;
  names?: AuditNames;
  max?: number;
}) {
  const summary = auditChangeSummary(entry, max);
  if (summary.line) {
    return <span className="text-body text-text-secondary">{summary.line}</span>;
  }
  if (!summary.rows.length) {
    return <span className="text-body text-text-muted">No values recorded</span>;
  }
  return (
    <ul className="text-body m-0 flex list-none flex-col gap-0.5 p-0">
      {summary.rows.map((row) => (
        <li key={row.path} className="min-w-0">
          <span className="text-text-secondary">{auditFieldLabel(row)}: </span>
          <BeforeAfter row={row} names={names} />
        </li>
      ))}
      {summary.more ? (
        <li className="text-caption text-text-muted">
          {summary.more === 1 ? "1 more change" : `${summary.more} more changes`}
        </li>
      ) : null}
    </ul>
  );
}
