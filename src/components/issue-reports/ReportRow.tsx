"use client";

import { Pin } from "lucide-react";
import type { ReactNode } from "react";

import {
  aiRowLabel,
  reportReference,
  statusLabel,
  suggestionWaiting,
  triageCategoryLabel,
  triageOf,
  VALIDITY,
} from "@/components/issue-reports/triage";
import { withoutGithubLinks } from "@/components/issue-reports/tracker-link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { STATUS_ICONS, StatusChip } from "@/components/ui/StatusChip";
import type { IssueReport } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function firstLine(text: string): string {
  const line = text.split("\n").find((part) => part.trim()) ?? text;
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

/** The staff verdict as a chip: icon, word and tone, never colour alone. */
export function ValidityBadge({ report }: { report: IssueReport }) {
  return <StatusChip {...VALIDITY[triageOf(report).validity]} />;
}

/** "Suggested: Duplicate of 3C7D1234", set apart from the verdict by its glyph. */
export function SuggestionMarker({ report }: { report: IssueReport }) {
  if (!report.aiReview) return null;
  const Sparkles = STATUS_ICONS.sparkles;
  return (
    <span className="text-caption text-text-secondary inline-flex min-w-0 items-center gap-1">
      <Sparkles size={13} aria-hidden className="shrink-0" style={{ color: "var(--color-info)" }} />
      <span className="truncate">{aiRowLabel(report.aiReview)}</span>
    </span>
  );
}

type Props = {
  report: IssueReport;
  active: boolean;
  checked: boolean;
  trackerLinks: boolean;
  disabled: boolean;
  /** Tracked and published chips (Super Admin's carry the GitHub link). */
  statusChips: ReactNode[];
  onOpen: (id: string) => void;
  onCheck: (id: string, checked: boolean, range: boolean) => void;
  onAccept: (report: IssueReport) => void;
};

/**
 * One report in the list: a card on a phone, a row on wider screens. The
 * whole card opens the report; the checkbox and Accept sit above that
 * target, so each keeps its own 44px press.
 */
export function ReportRow({
  report,
  active,
  checked,
  trackerLinks,
  disabled,
  statusChips,
  onOpen,
  onCheck,
  onAccept,
}: Props) {
  const triage = triageOf(report);
  const ref = reportReference(report.id);
  const sorted = [
    triage.category ? triageCategoryLabel(triage.category) : null,
    ...triage.labels.slice(0, 3).map((label) => `#${label}`),
    triage.labels.length > 3 ? `+${triage.labels.length - 3}` : null,
  ].filter(Boolean);
  const meta = [
    ref,
    formatDateTime(report.createdAt),
    report.status === "new" || report.status === "dismissed" ? statusLabel(report.status) : null,
    report.screenshots.length
      ? `${report.screenshots.length} screenshot${report.screenshots.length === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);
  const accept = suggestionWaiting(report);

  return (
    <div
      role="listitem"
      data-report-id={report.id}
      className={cn(
        "relative flex gap-1 rounded-[var(--radius-card)] border border-outline bg-surface pr-3 md:rounded-[var(--radius-field)] md:border-transparent md:bg-transparent",
        active ? "bg-muted md:bg-muted" : "hover:bg-overlay-hover",
        checked && !active && "border-text-primary md:border-transparent md:bg-overlay-hover",
      )}
    >
      {/* The open report also carries a bar, so the choice reads without colour. */}
      {active ? (
        <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[var(--color-text-primary)]" />
      ) : null}
      <label className="relative z-10 flex size-11 shrink-0 cursor-pointer items-center justify-center self-start">
        <Checkbox
          checked={checked}
          disabled={disabled}
          aria-label={`Select report ${ref}`}
          onCheckedChange={(next, details) => {
            const event = details?.event as { shiftKey?: boolean } | undefined;
            onCheck(report.id, next, Boolean(event?.shiftKey));
          }}
        />
      </label>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-2.5">
        <button
          type="button"
          data-open-report
          aria-current={active ? "true" : undefined}
          onClick={() => onOpen(report.id)}
          className="flex w-full flex-col items-start gap-0.5 rounded-[var(--radius-field)] text-left after:absolute after:inset-0 after:rounded-[inherit] after:content-['']"
        >
          {report.priority ? (
            <span className="text-caption text-text-secondary inline-flex items-center gap-1">
              <Pin size={12} aria-hidden /> Priority
            </span>
          ) : null}
          <span
            className={cn("text-body line-clamp-2", triage.validity === "spam" ? "text-text-muted" : "text-text-primary")}
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {firstLine(trackerLinks ? report.issue : withoutGithubLinks(report.issue))}
          </span>
          <span className="text-caption text-text-muted">{meta.join(" · ")}</span>
          {sorted.length ? (
            <span className="text-caption text-text-secondary flex flex-wrap gap-x-2">
              {sorted.map((token) => (
                <span key={token}>{token}</span>
              ))}
            </span>
          ) : null}
        </button>
        {/* Links among the chips (Super Admin's GitHub issue) sit above the card's target. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 [&_a]:relative [&_a]:z-10">
          <ValidityBadge report={report} />
          <SuggestionMarker report={report} />
          {statusChips}
        </div>
      </div>
      {accept ? (
        <Button
          size="sm"
          disabled={disabled}
          className="relative z-10 shrink-0 self-end mb-2"
          aria-label={`Accept suggestion for report ${ref}: ${VALIDITY[report.aiReview!.validity].label}`}
          onClick={() => onAccept(report)}
        >
          Accept
        </Button>
      ) : null}
    </div>
  );
}
