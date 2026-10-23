/**
 * Manual triage of issue reports (gridgo-api docs/ISSUE_REPORTS_API.md,
 * "Triage and AI review"): a person's verdict (valid, spam, duplicate), their
 * own category and labels, and the AI's separate suggestion. None of it
 * changes the workflow status, priority or tracker link.
 */

import type {
  IssueReport,
  IssueReportAiReview,
  IssueReportListFilters,
  IssueReportTriage,
  IssueReportTriageCategory,
  IssueReportTriageCounts,
  IssueReportTriageInput,
  IssueReportValidity,
} from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

export const VALIDITIES: readonly IssueReportValidity[] = ["unreviewed", "valid", "duplicate", "spam"];

/** The desk's starting view: everything except spam. */
export const NOT_SPAM: readonly IssueReportValidity[] = ["unreviewed", "valid", "duplicate"];

export const VALIDITY: Record<
  IssueReportValidity,
  { label: string; tone: StatusTone; icon: StatusIconName }
> = {
  unreviewed: { label: "To review", tone: "neutral", icon: "circle-dashed" },
  valid: { label: "Valid", tone: "success", icon: "circle-check" },
  duplicate: { label: "Duplicate", tone: "info", icon: "copy" },
  spam: { label: "Spam", tone: "error", icon: "ban" },
};

/** The one-press verdicts, with the key that sets each on the desk. */
export const VERDICTS: readonly { validity: Exclude<IssueReportValidity, "unreviewed">; key: string }[] = [
  { validity: "valid", key: "v" },
  { validity: "spam", key: "s" },
  { validity: "duplicate", key: "d" },
];

export const TRIAGE_CATEGORIES: readonly IssueReportTriageCategory[] = [
  "bug",
  "feature",
  "question",
  "feedback",
  "other",
];

export function triageCategoryLabel(category: IssueReportTriageCategory | null): string {
  if (category === "bug") return "Bug";
  if (category === "feature") return "Feature request";
  if (category === "question") return "Question";
  if (category === "feedback") return "Feedback";
  if (category === "other") return "Other";
  return "Not set";
}

export const MAX_LABELS = 10;
const LABEL_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

const UNREVIEWED: IssueReportTriage = {
  validity: "unreviewed",
  category: null,
  labels: [],
  duplicateOf: null,
  triagedBy: null,
  triagedAt: null,
};

/** A report's triage; an API from before triage reads as not reviewed yet. */
export function triageOf(report: IssueReport): IssueReportTriage {
  return report.triage ?? UNREVIEWED;
}

/** The reference the reporter was shown on the landing page. */
export function reportReference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export type LabelCheck = { ok: true; label: string } | { ok: false; error: string };

/**
 * A typed label, as the API will store it: trimmed, lowercased, spaces and
 * underscores turned into hyphens.
 */
export function checkLabel(input: string, current: readonly string[]): LabelCheck {
  const label = input
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[\s_]+/g, "-");
  if (!label) return { ok: false, error: "Type a label first." };
  if (!LABEL_RE.test(label)) {
    return {
      ok: false,
      error: "Use lowercase letters, numbers and hyphens, up to 32 characters, starting with a letter or number.",
    };
  }
  if (current.includes(label)) return { ok: false, error: `This report already has “${label}”.` };
  if (current.length >= MAX_LABELS) return { ok: false, error: `A report holds up to ${MAX_LABELS} labels.` };
  return { ok: true, label };
}

/**
 * A pasted "same as" report: its reference (as shown on the list) among the
 * loaded reports, or a full report id.
 */
export function resolveReportReference(
  input: string,
  reports: readonly IssueReport[],
  selfId: string,
): { ok: true; id: string } | { ok: false; error: string } {
  const typed = input.trim();
  if (!typed) return { ok: false, error: "Type the reference of the report this repeats." };
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(typed)
    ? typed.toLowerCase()
    : reports.find((report) => reportReference(report.id) === typed.toUpperCase())?.id;
  if (!id) {
    return {
      ok: false,
      error: "No report in this list has that reference. Show the list that holds it, or paste its full id.",
    };
  }
  if (id === selfId) return { ok: false, error: "A report cannot repeat itself." };
  return { ok: true, id };
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export type AiFilter = "any" | "reviewed" | "not_reviewed";

export type TriageFilters = {
  /** Never empty; every validity means no narrowing. */
  validity: IssueReportValidity[];
  category: IssueReportTriageCategory | "none" | "any";
  label: string | null;
  ai: AiFilter;
};

export const DEFAULT_FILTERS: TriageFilters = {
  validity: [...NOT_SPAM],
  category: "any",
  label: null,
  ai: "any",
};

/** Validities in a stable order, so the query and the toggles agree. */
export function orderedValidities(values: readonly IssueReportValidity[]): IssueReportValidity[] {
  return VALIDITIES.filter((value) => values.includes(value));
}

/** The API query for these filters. Every validity sends none. */
export function filterQuery(filters: TriageFilters): IssueReportListFilters {
  const query: IssueReportListFilters = {};
  const validity = orderedValidities(filters.validity);
  if (validity.length && validity.length < VALIDITIES.length) query.validity = validity;
  if (filters.category !== "any") query.triageCategory = [filters.category];
  if (filters.label) query.label = filters.label;
  if (filters.ai !== "any") query.aiReviewed = filters.ai === "reviewed";
  return query;
}

/** How many of the filters behind "More filters" are set. */
export function moreFilterCount(filters: TriageFilters): number {
  return (filters.category !== "any" ? 1 : 0) + (filters.label ? 1 : 0) + (filters.ai !== "any" ? 1 : 0);
}

export function isDefaultFilters(filters: TriageFilters): boolean {
  return (
    moreFilterCount(filters) === 0 &&
    orderedValidities(filters.validity).join() === orderedValidities(DEFAULT_FILTERS.validity).join()
  );
}

/**
 * Whether the list holds every report of its status, so the API's per-status
 * `counts` still say how many there are. Hiding spam narrows nothing while
 * nobody has marked any.
 */
export function listIsWhole(filters: TriageFilters, triageCounts: IssueReportTriageCounts | null | undefined): boolean {
  if (moreFilterCount(filters)) return false;
  const missing = VALIDITIES.filter((value) => !filters.validity.includes(value));
  return missing.every((value) => !triageCounts || (triageCounts.validity?.[value] ?? 0) === 0);
}

/** Whether a report still belongs in the list after a triage change. */
export function matchesFilters(report: IssueReport, filters: TriageFilters): boolean {
  const triage = triageOf(report);
  if (!filters.validity.includes(triage.validity)) return false;
  if (filters.category === "none" ? triage.category !== null : filters.category !== "any" && triage.category !== filters.category) {
    return false;
  }
  if (filters.label && !triage.labels.includes(filters.label)) return false;
  if (filters.ai !== "any" && Boolean(report.aiReview) !== (filters.ai === "reviewed")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// AI review
// ---------------------------------------------------------------------------

/** The person's standing against the AI suggestion, as a chip. */
export function aiOutcome(
  review: IssueReportAiReview,
  triage: IssueReportTriage,
): { label: string; tone: StatusTone; icon: StatusIconName } {
  const who = triage.triagedBy?.name || "a teammate";
  if (review.outcome === "confirmed") return { label: `Confirmed by ${who}`, tone: "success", icon: "circle-check" };
  if (review.outcome === "overridden") return { label: `Overridden by ${who}`, tone: "neutral", icon: "square-pen" };
  return { label: "Waiting for a person", tone: "warning", icon: "clock" };
}

/** The short AI marker on a list row. */
export function aiRowLabel(review: IssueReportAiReview): string {
  if (review.outcome === "confirmed") return "Agrees with AI";
  if (review.outcome === "overridden") return "Overrules AI";
  return `AI suggests ${VALIDITY[review.validity].label.toLowerCase()}`;
}

/**
 * The triage write that takes the AI's suggestion: its verdict, its category
 * and duplicate where it named them, and its labels added to the person's.
 */
export function acceptSuggestion(review: IssueReportAiReview, triage: IssueReportTriage): IssueReportTriageInput {
  const input: IssueReportTriageInput = { validity: review.validity };
  if (review.category) input.category = review.category;
  const labels = [...triage.labels, ...review.labels.filter((label) => !triage.labels.includes(label))].slice(
    0,
    MAX_LABELS,
  );
  if (labels.length !== triage.labels.length) input.labels = labels;
  if (review.validity === "duplicate" && review.duplicateOf) input.duplicateOf = review.duplicateOf;
  return input;
}
