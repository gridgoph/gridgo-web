/**
 * Manual triage of issue reports (gridgo-api docs/ISSUE_REPORTS_API.md,
 * "Triage and AI review"): a person's verdict (valid, spam, duplicate), their
 * own category and labels, and the AI's separate suggestion. None of it
 * changes the workflow status, priority or tracker link.
 */

import type {
  IssueReport,
  IssueReportAiReview,
  IssueReportCounts,
  IssueReportListFilters,
  IssueReportStatus,
  IssueReportTriage,
  IssueReportTriageCategory,
  IssueReportTriageCounts,
  IssueReportTriageInput,
  IssueReportValidity,
} from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

export const VALIDITIES: readonly IssueReportValidity[] = ["unreviewed", "valid", "duplicate", "spam"];

export const VALIDITY: Record<
  IssueReportValidity,
  { label: string; tone: StatusTone; icon: StatusIconName }
> = {
  unreviewed: { label: "Needs review", tone: "neutral", icon: "circle-dashed" },
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
// The desk's view: a validity tab and the filters beside it
// ---------------------------------------------------------------------------

export type ValidityTab = "review" | "valid" | "duplicate" | "spam" | "all";

/** The tabs across the top of the desk, in order. `short` fits a phone. */
export const VALIDITY_TABS: readonly {
  value: ValidityTab;
  label: string;
  short: string;
  validity: IssueReportValidity | null;
}[] = [
  { value: "review", label: "Needs review", short: "Review", validity: "unreviewed" },
  { value: "valid", label: "Valid", short: "Valid", validity: "valid" },
  { value: "duplicate", label: "Duplicate", short: "Duplicate", validity: "duplicate" },
  { value: "spam", label: "Spam", short: "Spam", validity: "spam" },
  { value: "all", label: "All", short: "All", validity: null },
];

export function tabValidity(tab: ValidityTab): IssueReportValidity | null {
  return VALIDITY_TABS.find((entry) => entry.value === tab)?.validity ?? null;
}

/** A tab's total from the API's triage counts, which ignore every filter. */
export function tabCount(tab: ValidityTab, counts: IssueReportTriageCounts | null | undefined): number | undefined {
  if (!counts?.validity) return undefined;
  const validity = tabValidity(tab);
  if (validity) return counts.validity[validity] ?? 0;
  return VALIDITIES.reduce((sum, value) => sum + (counts.validity[value] ?? 0), 0);
}

export type AiFilter = "any" | "reviewed" | "not_reviewed";
export type ReceivedWindow = "any" | "day" | "week" | "month";
export type StatusFilter = IssueReportStatus | "any";

export type DeskView = {
  tab: ValidityTab;
  status: StatusFilter;
  /** Pinned reports only. */
  priority: boolean;
  category: IssueReportTriageCategory | "none" | "any";
  label: string | null;
  received: ReceivedWindow;
  ai: AiFilter;
  /** Searched in the browser over the reports the view loaded. */
  q: string;
};

export const DEFAULT_VIEW: DeskView = {
  tab: "review",
  status: "any",
  priority: false,
  category: "any",
  label: null,
  received: "any",
  ai: "any",
  q: "",
};

export const STATUS_CHOICES: readonly { value: IssueReportStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "tracked", label: "Tracked" },
  { value: "published", label: "Published" },
  { value: "dismissed", label: "Dismissed" },
];

export const RECEIVED_CHOICES: readonly { value: ReceivedWindow; label: string; hours: number }[] = [
  { value: "any", label: "Any time", hours: 0 },
  { value: "day", label: "Last 24 hours", hours: 24 },
  { value: "week", label: "Last 7 days", hours: 24 * 7 },
  { value: "month", label: "Last 30 days", hours: 24 * 30 },
];

export const AI_CHOICES: readonly { value: AiFilter; label: string }[] = [
  { value: "any", label: "Any suggestion" },
  { value: "reviewed", label: "Has a suggestion" },
  { value: "not_reviewed", label: "No suggestion yet" },
];

export function statusLabel(status: IssueReportStatus): string {
  return STATUS_CHOICES.find((choice) => choice.value === status)?.label ?? status;
}

export function categoryFilterLabel(category: DeskView["category"]): string {
  if (category === "any") return "Any category";
  if (category === "none") return "No category yet";
  return triageCategoryLabel(category);
}

const TABS = VALIDITY_TABS.map((entry) => entry.value);
const STATUSES = STATUS_CHOICES.map((choice) => choice.value);
const CATEGORY_FILTERS = [...TRIAGE_CATEGORIES, "none"] as const;
const WINDOWS = RECEIVED_CHOICES.map((choice) => choice.value);
const AI_FILTERS = AI_CHOICES.map((choice) => choice.value);

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** The view a shared or reloaded URL asks for; anything unknown falls back. */
export function viewFromSearch(params: { get(name: string): string | null } | null): DeskView {
  if (!params) return DEFAULT_VIEW;
  const label = params.get("label")?.trim().toLowerCase() || null;
  return {
    tab: oneOf(params.get("tab"), TABS, DEFAULT_VIEW.tab),
    status: oneOf(params.get("status"), STATUSES, "any" as StatusFilter),
    priority: params.get("priority") === "1",
    category: oneOf(params.get("category"), CATEGORY_FILTERS, "any" as DeskView["category"]),
    label: label && LABEL_RE.test(label) ? label : null,
    received: oneOf(params.get("received"), WINDOWS, DEFAULT_VIEW.received),
    ai: oneOf(params.get("ai"), AI_FILTERS, DEFAULT_VIEW.ai),
    q: (params.get("q") ?? "").slice(0, 200),
  };
}

/** The query string for a view and its open report; defaults are left off. */
export function searchFromView(view: DeskView, reportId: string | null = null): string {
  const params = new URLSearchParams();
  if (view.tab !== DEFAULT_VIEW.tab) params.set("tab", view.tab);
  if (view.status !== "any") params.set("status", view.status);
  if (view.priority) params.set("priority", "1");
  if (view.category !== "any") params.set("category", view.category);
  if (view.label) params.set("label", view.label);
  if (view.received !== "any") params.set("received", view.received);
  if (view.ai !== "any") params.set("ai", view.ai);
  if (view.q.trim()) params.set("q", view.q.trim());
  if (reportId) params.set("report", reportId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The API query for a view. `now` dates the Received window. */
export function filterQuery(view: DeskView, now: number = Date.now()): IssueReportListFilters {
  const query: IssueReportListFilters = {};
  const validity = tabValidity(view.tab);
  if (validity) query.validity = [validity];
  if (view.category !== "any") query.triageCategory = [view.category];
  if (view.label) query.label = view.label;
  if (view.ai !== "any") query.aiReviewed = view.ai === "reviewed";
  if (view.priority) query.priority = true;
  const hours = RECEIVED_CHOICES.find((choice) => choice.value === view.received)?.hours ?? 0;
  if (hours) query.since = new Date(now - hours * 3_600_000).toISOString();
  return query;
}

/** The filters beside the tab, as removable chips, in toolbar order. */
export type FilterChip = { key: Exclude<keyof DeskView, "tab">; label: string };

export function activeFilters(view: DeskView): FilterChip[] {
  const chips: FilterChip[] = [];
  if (view.q.trim()) chips.push({ key: "q", label: `Search: “${view.q.trim()}”` });
  if (view.status !== "any") chips.push({ key: "status", label: `Status: ${statusLabel(view.status)}` });
  if (view.category !== "any") chips.push({ key: "category", label: `Category: ${categoryFilterLabel(view.category)}` });
  if (view.label) chips.push({ key: "label", label: `Label: ${view.label}` });
  if (view.received !== "any") {
    chips.push({
      key: "received",
      label: `Received: ${RECEIVED_CHOICES.find((choice) => choice.value === view.received)?.label.toLowerCase()}`,
    });
  }
  if (view.ai !== "any") chips.push({ key: "ai", label: AI_CHOICES.find((choice) => choice.value === view.ai)!.label });
  if (view.priority) chips.push({ key: "priority", label: "Priority only" });
  return chips;
}

/** The view without one filter (a chip's remove button). */
export function withoutFilter(view: DeskView, key: FilterChip["key"]): DeskView {
  return { ...view, [key]: DEFAULT_VIEW[key] };
}

/** The view with every filter cleared, keeping the tab. */
export function clearFilters(view: DeskView): DeskView {
  return { ...DEFAULT_VIEW, tab: view.tab };
}

/**
 * How many reports this view holds, when the API's counts can say: the tab's
 * triage total with no other filter, a status total on All, or the pinned
 * total on All. Otherwise the last page decides.
 */
export function knownTotal(
  view: DeskView,
  counts: IssueReportCounts | null | undefined,
  triageCounts: IssueReportTriageCounts | null | undefined,
): number | undefined {
  if (view.category !== "any" || view.label || view.ai !== "any" || view.received !== "any") return undefined;
  if (view.priority) return view.status === "any" && view.tab === "all" ? counts?.priorities : undefined;
  if (view.status === "any") return tabCount(view.tab, triageCounts);
  return view.tab === "all" ? counts?.[view.status] : undefined;
}

/** Whether a report still belongs in the view after a change to it. */
export function matchesView(report: IssueReport, view: DeskView): boolean {
  const triage = triageOf(report);
  const validity = tabValidity(view.tab);
  if (validity && triage.validity !== validity) return false;
  if (view.status !== "any" && report.status !== view.status) return false;
  if (view.priority && !report.priority) return false;
  if (view.category === "none" ? triage.category !== null : view.category !== "any" && triage.category !== view.category) {
    return false;
  }
  if (view.label && !triage.labels.includes(view.label)) return false;
  if (view.ai !== "any" && Boolean(report.aiReview) !== (view.ai === "reviewed")) return false;
  return true;
}

/**
 * Whether a report matches the search box: every word appears in its text,
 * reference, labels or the suggestion's note. `text` is the report text as
 * the reader may see it (GitHub links hidden for Operations).
 */
export function matchesSearch(report: IssueReport, q: string, text: (value: string) => string = (value) => value): boolean {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const triage = triageOf(report);
  const haystack = [
    text(report.issue),
    reportReference(report.id),
    report.id,
    ...triage.labels,
    ...(report.aiReview?.labels ?? []),
    report.aiReview?.note ? text(report.aiReview.note) : "",
  ]
    .join("\n")
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
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

/** "Suggested: Duplicate of 3C7D1234": the suggestion, apart from the verdict. */
export function suggestionLabel(review: IssueReportAiReview): string {
  const verdict = VALIDITY[review.validity].label;
  return review.validity === "duplicate" && review.duplicateOf
    ? `Suggested: ${verdict} of ${reportReference(review.duplicateOf)}`
    : `Suggested: ${verdict}`;
}

/** The short suggestion marker on a list row. */
export function aiRowLabel(review: IssueReportAiReview): string {
  if (review.outcome === "confirmed") return "Matches the suggestion";
  if (review.outcome === "overridden") return `${suggestionLabel(review)}, overruled`;
  return suggestionLabel(review);
}

/** Whether taking the suggestion would change the verdict. */
export function canAcceptSuggestion(report: IssueReport): boolean {
  return Boolean(report.aiReview) && report.aiReview?.outcome !== "confirmed";
}

/** A suggestion nobody has answered yet: the report still needs review. */
export function suggestionWaiting(report: IssueReport): boolean {
  return Boolean(report.aiReview) && triageOf(report).validity === "unreviewed";
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

/** "4 reports wait for a verdict, 2 with an AI suggestion." Across every tab. */
export function triageSummary(counts: IssueReportTriageCounts): string {
  const waiting = counts.validity.unreviewed ?? 0;
  if (!waiting) return "Every report has a verdict.";
  const head = waiting === 1 ? "1 report waits for a verdict" : `${waiting} reports wait for a verdict`;
  const ai = counts.aiAwaitingHuman ?? 0;
  return ai ? `${head}, ${ai} with an AI suggestion.` : `${head}.`;
}
