"use client";

import { Plus, Sparkles, Undo2, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  acceptSuggestion,
  aiOutcome,
  canAcceptSuggestion,
  checkLabel,
  MAX_LABELS,
  reportReference,
  resolveReportReference,
  suggestionLabel,
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
import { STATUS_ICONS, StatusChip, StatusMark } from "@/components/ui/StatusChip";
import type { IssueReport, IssueReportTriageCategory, IssueReportTriageInput } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Each tone's colour, for an icon outside a chip. */
export const TONE_COLOR = {
  success: "var(--color-success)",
  error: "var(--color-error)",
  info: "var(--color-info)",
  neutral: "var(--color-text-secondary)",
  warning: "var(--color-warning)",
} as const;

/**
 * The one-press verdict: Accept suggestion (A) while the suggestion is not
 * yet the verdict, then Valid, Spam or Duplicate (V, S, D). Pressing the
 * verdict a report already has does nothing; the last button puts it back to
 * Needs review. Accept is the panel's one yellow button while it shows.
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
  const review = report.aiReview;
  const accept = review && canAcceptSuggestion(report) ? acceptSuggestion(review, triageOf(report)) : null;
  return (
    <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-3">
      <p id="verdict-label" className="text-caption text-text-secondary m-0 md:w-24 md:shrink-0">
        Is it real?
      </p>
      <div role="group" aria-labelledby="verdict-label" className="flex flex-wrap items-center gap-2">
        {accept && review ? (
          // Default size: `sm` carries a type class that merges away the yellow's text colour.
          <Button
            variant="primary"
            aria-keyshortcuts="A"
            aria-label={`Accept suggestion: ${suggestionLabel(review).replace(/^Suggested: /, "")}`}
            disabled={disabled}
            onClick={() => onTriage(accept)}
          >
            <Sparkles aria-hidden />
            Accept suggestion
            <kbd className="text-caption ml-1 hidden font-sans opacity-70 lg:inline" aria-hidden>
              A
            </kbd>
          </Button>
        ) : null}
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
              style={pressed ? { borderColor: TONE_COLOR[VALIDITY[validity].tone] } : undefined}
            >
              <Icon aria-hidden style={{ color: TONE_COLOR[VALIDITY[validity].tone] }} />
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
            Back to Needs review
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The AI's suggestion, kept apart from the staff verdict: what it suggests,
 * why, and whether a person confirmed or overrode it. Accepting it is the
 * verdict bar's job, so the button stays in one place.
 */
export function AiSuggestion({
  report,
  trackerLinks,
  reportHref,
  onOpenReport,
}: {
  report: IssueReport;
  trackerLinks: boolean;
  reportHref: (id: string) => string;
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
  const note = review.note && !trackerLinks ? withoutGithubLinks(review.note) : review.note;
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
          <p className="text-caption text-text-muted m-0">
            Reviewed {formatDateTime(review.reviewedAt)}. Only staff set the verdict.
          </p>
        </div>
        <StatusChip {...outcome} />
      </div>
      <p className="text-body text-text-primary m-0 inline-flex flex-wrap items-center gap-x-1.5">
        <StatusMark {...VALIDITY[review.validity]} label={`Suggested: ${VALIDITY[review.validity].label}`} />
        {review.validity === "duplicate" && review.duplicateOf ? (
          <>
            <span>of</span>
            <ReportRef id={review.duplicateOf} href={reportHref(review.duplicateOf)} onOpen={onOpenReport} />
          </>
        ) : null}
      </p>
      {review.category || review.labels.length ? (
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
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
        </dl>
      ) : null}
      {note ? (
        <p className="text-caption text-text-secondary m-0 whitespace-pre-wrap break-words">“{note}”</p>
      ) : null}
    </section>
  );
}

/**
 * "Report 1A2B3C4D", a real link to that report on this desk: a plain press
 * opens it in place, wherever it is filed; a modified one follows the link.
 */
export function ReportRef({
  id,
  href,
  onOpen,
}: {
  id: string;
  href: string;
  onOpen: (id: string) => void;
}) {
  return (
    <a
      href={href}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        onOpen(id);
      }}
      className="inline-flex min-h-11 items-center text-[var(--color-brand)] underline underline-offset-4"
    >
      Report {reportReference(id)}
    </a>
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
  reportHref,
  onOpenReport,
}: {
  report: IssueReport;
  reports: readonly IssueReport[];
  labelSuggestions: readonly string[];
  disabled: boolean;
  onTriage: (input: IssueReportTriageInput) => void;
  reportHref: (id: string) => string;
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
          <SelectTrigger id="triage-category" className="min-h-11 w-full" aria-label={`Category of report ${ref}`}>
            <SelectValue>{triageCategoryLabel(triage.category)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {TRIAGE_CATEGORIES.map((category) => (
                <SelectItem className="min-h-11" key={category} value={category}>
                  {triageCategoryLabel(category)}
                </SelectItem>
              ))}
              <SelectItem className="min-h-11" value="none">Not set</SelectItem>
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
              Same as <ReportRef id={triage.duplicateOf} href={reportHref(triage.duplicateOf)} onOpen={onOpenReport} />
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
