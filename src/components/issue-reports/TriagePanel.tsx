"use client";

import { Plus, Undo2, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  acceptSuggestion,
  aiOutcome,
  checkLabel,
  MAX_LABELS,
  reportReference,
  resolveReportReference,
  TRIAGE_CATEGORIES,
  triageCategoryLabel,
  triageOf,
  VALIDITY,
  VERDICTS,
} from "@/components/issue-reports/triage";
import { withoutGithubLinks } from "@/components/issue-reports/tracker-link";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_ICONS, StatusChip } from "@/components/ui/StatusChip";
import type { IssueReport, IssueReportTriageCategory, IssueReportTriageInput } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONE_TEXT = {
  success: "var(--color-success)",
  error: "var(--color-error)",
  info: "var(--color-info)",
  neutral: "var(--color-text-secondary)",
  warning: "var(--color-warning)",
} as const;

/**
 * The one-press verdict: Valid, Spam or Duplicate, each also on its key
 * (V, S, D). Pressing the verdict a report already has does nothing; Undo
 * puts it back to To review.
 */
export function VerdictBar({
  report,
  disabled,
  onTriage,
}: {
  report: IssueReport;
  disabled: boolean;
  onTriage: (input: IssueReportTriageInput) => void;
}) {
  const current = triageOf(report).validity;
  return (
    <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-3">
      <p id="verdict-label" className="text-caption text-text-secondary m-0 md:w-24 md:shrink-0">
        Is it real?
      </p>
      <div role="group" aria-labelledby="verdict-label" className="flex flex-wrap items-center gap-2">
        {VERDICTS.map(({ validity, key }) => {
          const pressed = current === validity;
          const Icon = STATUS_ICONS[VALIDITY[validity].icon];
          return (
            <Button
              key={validity}
              size="sm"
              aria-pressed={pressed}
              aria-keyshortcuts={key.toUpperCase()}
              disabled={disabled}
              onClick={() => {
                if (!pressed) onTriage({ validity });
              }}
              className={cn(pressed && "bg-muted")}
              style={pressed ? { borderColor: TONE_TEXT[VALIDITY[validity].tone] } : undefined}
            >
              <Icon aria-hidden style={{ color: TONE_TEXT[VALIDITY[validity].tone] }} />
              {pressed ? `Marked ${VALIDITY[validity].label.toLowerCase()}` : VALIDITY[validity].label}
              <kbd className="text-caption text-text-muted ml-1 hidden font-sans lg:inline" aria-hidden>
                {key.toUpperCase()}
              </kbd>
            </Button>
          );
        })}
        {current !== "unreviewed" ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onTriage({ validity: "unreviewed" })}
          >
            <Undo2 aria-hidden />
            Back to To review
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** The AI's suggestion, and whether a person confirmed or overrode it. */
export function AiSuggestion({
  report,
  reports,
  trackerLinks,
  disabled,
  onTriage,
  onOpenReport,
}: {
  report: IssueReport;
  reports: readonly IssueReport[];
  trackerLinks: boolean;
  disabled: boolean;
  onTriage: (input: IssueReportTriageInput) => void;
  onOpenReport: (id: string) => void;
}) {
  const review = report.aiReview;
  if (!review) {
    return (
      <section aria-labelledby="ai-review-heading" className="flex flex-col gap-1">
        <h3 id="ai-review-heading" className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
          AI review
        </h3>
        <p className="text-caption text-text-muted m-0">Not reviewed by AI yet. Your verdict does not wait for it.</p>
      </section>
    );
  }
  const triage = triageOf(report);
  const outcome = aiOutcome(review, triage);
  const suggestion = acceptSuggestion(review, triage);
  const note = review.note && !trackerLinks ? withoutGithubLinks(review.note) : review.note;
  const Sparkles = STATUS_ICONS.sparkles;
  return (
    <section
      aria-labelledby="ai-review-heading"
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-outline p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            id="ai-review-heading"
            className="text-body text-text-primary m-0 inline-flex items-center gap-1.5"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            <Sparkles size={16} aria-hidden style={{ color: "var(--color-info)" }} />
            AI suggestion
          </h3>
          <p className="text-caption text-text-muted m-0">Reviewed {formatDateTime(review.reviewedAt)}</p>
        </div>
        <StatusChip {...outcome} />
      </div>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt className="text-caption text-text-muted">Verdict</dt>
        <dd className="text-caption text-text-primary m-0">{VALIDITY[review.validity].label}</dd>
        {review.category ? (
          <>
            <dt className="text-caption text-text-muted">Category</dt>
            <dd className="text-caption text-text-primary m-0">{triageCategoryLabel(review.category)}</dd>
          </>
        ) : null}
        {review.labels.length ? (
          <>
            <dt className="text-caption text-text-muted">Labels</dt>
            <dd className="text-caption text-text-primary m-0">{review.labels.join(", ")}</dd>
          </>
        ) : null}
        {review.duplicateOf ? (
          <>
            <dt className="text-caption text-text-muted">Repeats</dt>
            <dd className="text-caption text-text-primary m-0">
              <ReportRef id={review.duplicateOf} reports={reports} onOpen={onOpenReport} />
            </dd>
          </>
        ) : null}
      </dl>
      {note ? (
        <p className="text-caption text-text-secondary m-0 whitespace-pre-wrap break-words">“{note}”</p>
      ) : null}
      {review.outcome !== "confirmed" ? (
        <Button size="sm" className="self-start" disabled={disabled} onClick={() => onTriage(suggestion)}>
          Use AI suggestion
        </Button>
      ) : null}
    </section>
  );
}

/** "Report 1A2B3C4D", a button when that report is in the list. */
function ReportRef({
  id,
  reports,
  onOpen,
}: {
  id: string;
  reports: readonly IssueReport[];
  onOpen: (id: string) => void;
}) {
  const label = `report ${reportReference(id)}`;
  return reports.some((report) => report.id === id) ? (
    <Button variant="link" className="text-caption" onClick={() => onOpen(id)}>
      Open {label}
    </Button>
  ) : (
    <span>{label}</span>
  );
}

/**
 * The staff category, labels and (for a duplicate) the report it repeats.
 * Each change saves on its own.
 */
export function TriageDetails({
  report,
  reports,
  labelSuggestions,
  disabled,
  onTriage,
  onOpenReport,
}: {
  report: IssueReport;
  reports: readonly IssueReport[];
  labelSuggestions: readonly string[];
  disabled: boolean;
  onTriage: (input: IssueReportTriageInput) => void;
  onOpenReport: (id: string) => void;
}) {
  const triage = triageOf(report);
  const [labelDraft, setLabelDraft] = useState("");
  const [labelError, setLabelError] = useState<string | null>(null);
  const [repeatDraft, setRepeatDraft] = useState("");
  const [repeatError, setRepeatError] = useState<string | null>(null);
  const suggestions = labelSuggestions.filter((label) => !triage.labels.includes(label));
  const ref = reportReference(report.id);

  function addLabel(event: FormEvent) {
    event.preventDefault();
    const check = checkLabel(labelDraft, triage.labels);
    if (!check.ok) {
      setLabelError(check.error);
      return;
    }
    setLabelDraft("");
    setLabelError(null);
    onTriage({ labels: [...triage.labels, check.label] });
  }

  function saveRepeat(event: FormEvent) {
    event.preventDefault();
    const check = resolveReportReference(repeatDraft, reports, report.id);
    if (!check.ok) {
      setRepeatError(check.error);
      return;
    }
    setRepeatDraft("");
    setRepeatError(null);
    onTriage({ duplicateOf: check.id });
  }

  return (
    <section aria-labelledby="triage-details-heading" className="flex flex-col gap-4">
      <h3
        id="triage-details-heading"
        className="text-body text-text-primary m-0"
        style={{ fontFamily: "var(--font-medium)" }}
      >
        Sort this report
      </h3>

      <Field className="gap-1">
        <FieldLabel htmlFor="triage-category">
          <span className="text-caption text-text-secondary">Category</span>
        </FieldLabel>
        <Select
          value={triage.category ?? "none"}
          disabled={disabled}
          onValueChange={(value) => {
            if (typeof value !== "string") return;
            const next = value === "none" ? null : (value as IssueReportTriageCategory);
            if (next !== triage.category) onTriage({ category: next });
          }}
        >
          <SelectTrigger id="triage-category" className="h-11 w-full" aria-label={`Category of report ${ref}`}>
            <SelectValue>{triageCategoryLabel(triage.category)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {TRIAGE_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {triageCategoryLabel(category)}
                </SelectItem>
              ))}
              <SelectItem value="none">Not set</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>
          <span className="text-caption text-text-muted">Yours to set. The reporter&apos;s own pick stays as sent.</span>
        </FieldDescription>
      </Field>

      <Field data-invalid={labelError ? true : undefined} className="gap-1">
        <FieldLabel htmlFor="triage-label">
          <span className="text-caption text-text-secondary">Labels</span>
        </FieldLabel>
        {triage.labels.length ? (
          <ul aria-label={`Labels on report ${ref}`} className="m-0 flex list-none flex-wrap gap-1 p-0">
            {triage.labels.map((label) => (
              <li key={label} className="inline-flex items-center rounded-[var(--radius-pill)] border border-outline pl-3">
                <span className="text-caption text-text-primary">{label}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="rounded-[var(--radius-pill)]"
                  aria-label={`Remove label ${label}`}
                  disabled={disabled}
                  onClick={() => onTriage({ labels: triage.labels.filter((entry) => entry !== label) })}
                >
                  <X aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {triage.labels.length < MAX_LABELS ? (
          <form className="flex gap-2" onSubmit={addLabel}>
            <Input
              id="triage-label"
              value={labelDraft}
              onChange={(event) => {
                setLabelDraft(event.target.value);
                setLabelError(null);
              }}
              list="triage-label-suggestions"
              placeholder="checkout"
              maxLength={40}
              autoComplete="off"
              aria-invalid={labelError ? true : undefined}
              aria-describedby={labelError ? "triage-label-error" : "triage-label-help"}
              className="min-w-0 flex-1"
            />
            <datalist id="triage-label-suggestions">
              {suggestions.map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
            <Button type="submit" disabled={disabled}>
              <Plus aria-hidden />
              Add label
            </Button>
          </form>
        ) : null}
        {labelError ? (
          <FieldError id="triage-label-error">
            <span className="text-caption text-error">{labelError}</span>
          </FieldError>
        ) : (
          <FieldDescription id="triage-label-help">
            <span className="text-caption text-text-muted">
              {triage.labels.length < MAX_LABELS
                ? "One word or a few joined by hyphens, like checkout or rider-map. Labels already in use are suggested."
                : `This report has the most labels it can hold (${MAX_LABELS}).`}
            </span>
          </FieldDescription>
        )}
      </Field>

      {triage.validity === "duplicate" ? (
        <Field data-invalid={repeatError ? true : undefined} className="gap-1">
          <FieldLabel htmlFor="triage-repeats">
            <span className="text-caption text-text-secondary">Repeats report</span>
          </FieldLabel>
          {triage.duplicateOf ? (
            <p className="text-caption text-text-primary m-0 inline-flex flex-wrap items-center gap-x-2">
              Same as <ReportRef id={triage.duplicateOf} reports={reports} onOpen={onOpenReport} />
            </p>
          ) : null}
          <form className="flex gap-2" onSubmit={saveRepeat}>
            <Input
              id="triage-repeats"
              value={repeatDraft}
              onChange={(event) => {
                setRepeatDraft(event.target.value);
                setRepeatError(null);
              }}
              placeholder="1A2B3C4D"
              maxLength={40}
              autoComplete="off"
              aria-invalid={repeatError ? true : undefined}
              aria-describedby={repeatError ? "triage-repeats-error" : "triage-repeats-help"}
              className="min-w-0 flex-1"
            />
            <Button type="submit" disabled={disabled}>
              {triage.duplicateOf ? "Change" : "Save"}
            </Button>
          </form>
          {repeatError ? (
            <FieldError id="triage-repeats-error">
              <span className="text-caption text-error">{repeatError}</span>
            </FieldError>
          ) : (
            <FieldDescription id="triage-repeats-help">
              <span className="text-caption text-text-muted">
                Optional. The 8-character reference of the earlier report, from the list.
              </span>
            </FieldDescription>
          )}
        </Field>
      ) : null}

      <p className="text-caption text-text-muted m-0">
        {triage.triagedAt
          ? `Last sorted by ${triage.triagedBy?.name || "a teammate"} on ${formatDateTime(triage.triagedAt)}.`
          : "Nobody has sorted this report yet."}
      </p>
    </section>
  );
}
