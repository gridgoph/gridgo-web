/**
 * An organization's officer of record, newest first (gridgoph/gridgo-client#164).
 *
 * One shared login passes between successive officers, so this is the only
 * record of who answered for the account at a given time. Each entry is a
 * person Operations verified; a handover adds an entry only once approved,
 * and the outgoing officer's entry is closed on that day. Invoices and
 * statements print the officer who was in place when each order was placed.
 */

import { BadgeCheck } from "lucide-react";

import type { OrganizationOfficer } from "@/lib/api/types";
import { formatDate, formatDateTime } from "@/lib/format";

export function OfficerHistory({
  history,
  current,
  emptyText = "No verified officer yet. The first one is recorded when Operations approves the organization's application.",
}: {
  history: readonly OrganizationOfficer[] | null | undefined;
  current?: OrganizationOfficer | null;
  emptyText?: string;
}) {
  const entries = officerEntries(history, current);
  if (!entries.length) {
    return <p className="text-body text-text-secondary m-0">{emptyText}</p>;
  }
  return (
    <ol
      className="m-0 flex list-none flex-col p-0"
      aria-label="Officers of record, newest first"
    >
      {entries.map((officer, index) => {
        const isCurrent = !officer.endedAt;
        const last = index === entries.length - 1;
        return (
          <li key={officer.id} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3">
            <div className="flex flex-col items-center pt-1" aria-hidden>
              <span
                className={
                  isCurrent
                    ? "size-3 shrink-0 rounded-full border-2 border-foreground bg-foreground"
                    : "size-3 shrink-0 rounded-full border-2 border-outline bg-background"
                }
              />
              {!last ? <span className="w-px flex-1 bg-outline-subtle" /> : null}
            </div>
            <div className={last ? "min-w-0" : "min-w-0 pb-4"}>
              <p className="text-body text-text-primary m-0 flex flex-wrap items-center gap-x-2">
                <span style={{ fontFamily: "var(--font-medium)" }}>
                  {officer.fullName}
                </span>
                {isCurrent ? (
                  <span className="text-caption text-success inline-flex items-center gap-1">
                    <BadgeCheck className="size-3.5" aria-hidden />
                    Current officer
                  </span>
                ) : null}
              </p>
              <p className="text-caption text-text-secondary m-0 mt-0.5">
                {officerSpan(officer)}
              </p>
              {officer.verifiedAt ? (
                <p className="text-caption text-text-muted m-0">
                  Verified {formatDateTime(officer.verifiedAt)}
                  {officer.applicationRevision
                    ? `, application revision ${officer.applicationRevision}`
                    : ""}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** History newest first; an API that sent only the current officer still shows them. */
export function officerEntries(
  history: readonly OrganizationOfficer[] | null | undefined,
  current?: OrganizationOfficer | null,
): OrganizationOfficer[] {
  const list = [...(history ?? [])];
  if (current && !list.some((entry) => entry.id === current.id)) list.push(current);
  return list.sort((a, b) =>
    (b.startedAt ?? b.verifiedAt ?? "").localeCompare(a.startedAt ?? a.verifiedAt ?? ""),
  );
}

export function officerSpan(officer: OrganizationOfficer): string {
  const from = officer.startedAt ?? officer.verifiedAt;
  const start = from ? formatDate(from) : "Start not recorded";
  return officer.endedAt
    ? `${start} to ${formatDate(officer.endedAt)}`
    : `Since ${start}`;
}
