/**
 * Super Admin Tracker rules: the captain's sheet sections and statuses, the
 * filters, and the decision-form limits the API enforces (so the page can say
 * no before the upload, not after). Pure on purpose — no React, no fetching.
 *
 * Contract: gridgo-api docs/TRACKER_API.md. GitHub issues are the source of
 * truth; only an item's status is editable here.
 */

import { isApiError } from "@/lib/api/client";
import type { TrackerItem, TrackerStatus } from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

/** The sheet's sections in report order, titled exactly as the sheet titles them. */
export const TRACKER_SECTIONS: readonly { key: string; title: string }[] = [
  { key: "general", title: "GENERAL & ADMIN / SYSTEM-WIDE" },
  { key: "supplier", title: "GRIDGO SUPPLIER" },
  { key: "step-01", title: "STEP 01 — ONBOARDING" },
  { key: "step-02", title: "STEP 02 — NEW REQUEST & UPLOAD ARTWORK" },
  { key: "step-03", title: "STEP 03 — PAY CHECKOUT" },
  { key: "step-04-05", title: "STEP 04 & 05 — OPERATIONS FILE CHECKING & SUPPLIER HANDOVER" },
  { key: "step-06", title: "STEP 06 — SUPPLIER PROGRESSION & PRODUCTION" },
  { key: "step-07", title: "STEP 07 — RIDER DISPATCH & DELIVERY" },
  { key: "step-08", title: "STEP 08 — ISSUE WINDOW, FINANCE & PAYOUTS" },
];

export type TrackerStatusMeta = {
  value: TrackerStatus;
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
  /** What the status means, in the report's words. */
  meaning: string;
};

/** The six statuses, in the order work moves through them. */
export const TRACKER_STATUSES: readonly TrackerStatusMeta[] = [
  {
    value: "open",
    label: "Open",
    tone: "neutral",
    icon: "circle-dashed",
    meaning: "Ready for work; no fix has started.",
  },
  {
    value: "in-review",
    label: "In review",
    tone: "info",
    icon: "git-pull-request",
    meaning: "A fix pull request is open and being reviewed.",
  },
  {
    value: "merged-dev",
    label: "Merged (dev)",
    tone: "info",
    icon: "git-merge",
    meaning: "Merged into dev. Users get it when dev is promoted to production.",
  },
  {
    value: "live",
    label: "Live (prod)",
    tone: "success",
    icon: "circle-check",
    meaning: "Fixed and on production.",
  },
  {
    value: "needs-decision",
    label: "Needs decision",
    tone: "warning",
    icon: "circle-help",
    meaning: "Waiting on your call before work can start.",
  },
  {
    value: "blocked",
    label: "Blocked",
    tone: "error",
    icon: "ban",
    meaning: "Needs something from outside the team first.",
  },
];

const STATUS_BY_VALUE = new Map(TRACKER_STATUSES.map((meta) => [meta.value, meta]));

export function trackerStatusMeta(status: TrackerStatus): TrackerStatusMeta {
  return (
    STATUS_BY_VALUE.get(status) ?? {
      value: status,
      label: status,
      tone: "neutral",
      icon: "circle-dashed",
      meaning: "",
    }
  );
}

/**
 * The sheet's ID repeats across sections (each step restarts its numbering),
 * so a control's accessible name carries the requirement too.
 */
export function trackerItemName(item: Pick<TrackerItem, "ref" | "requirement">): string {
  return `${item.ref} ${item.requirement}`;
}

export function isTrackerStatus(value: unknown): value is TrackerStatus {
  return typeof value === "string" && STATUS_BY_VALUE.has(value as TrackerStatus);
}

/**
 * Where an item can go after a decision. Needs decision is left out: a saved
 * decision is the answer to that wait. Open ("ready for work") is the default.
 */
export const AFTER_DECISION_STATUSES: readonly TrackerStatusMeta[] = TRACKER_STATUSES.filter(
  (meta) => meta.value !== "needs-decision",
);

/** What the change does to the GitHub issue, said before the change is confirmed. */
export function githubEffect(to: TrackerStatus): string {
  if (to === "live") return "The GitHub issue is closed as completed.";
  if (to === "needs-decision") {
    return "The GitHub issue gets the needs-decision label and is reopened if it was closed.";
  }
  return "The GitHub issue is reopened if it was closed.";
}

export type TrackerSectionGroup = {
  key: string;
  title: string;
  items: TrackerItem[];
};

/**
 * Items under their sheet section, sections in report order, items in sheet
 * order. A section the page does not know yet still shows, last, under its key.
 */
export function groupBySection(items: readonly TrackerItem[]): TrackerSectionGroup[] {
  const buckets = new Map<string, TrackerItem[]>();
  for (const item of items) {
    const bucket = buckets.get(item.section);
    if (bucket) bucket.push(item);
    else buckets.set(item.section, [item]);
  }
  const known = TRACKER_SECTIONS.filter((section) => buckets.has(section.key)).map(
    (section) => ({ key: section.key, title: section.title, items: buckets.get(section.key)! }),
  );
  const knownKeys = new Set(TRACKER_SECTIONS.map((section) => section.key));
  const unknown = [...buckets.keys()]
    .filter((key) => !knownKeys.has(key))
    .sort()
    .map((key) => ({ key, title: key.toUpperCase(), items: buckets.get(key)! }));
  return [...known, ...unknown].map((group) => ({
    ...group,
    items: [...group.items].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key)),
  }));
}

export type TrackerFilters = {
  status: TrackerStatus | "all";
  developer: string | "all";
  query: string;
};

export const NO_TRACKER_FILTERS: TrackerFilters = { status: "all", developer: "all", query: "" };

function matchesQuery(item: TrackerItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [item.ref, item.key, item.module, item.requirement, item.category, item.developer]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

/** Developer and search narrow the counts; status then picks one count. */
export function filterByDeveloperAndQuery(
  items: readonly TrackerItem[],
  filters: Pick<TrackerFilters, "developer" | "query">,
): TrackerItem[] {
  return items.filter(
    (item) =>
      (filters.developer === "all" || item.developer === filters.developer) &&
      matchesQuery(item, filters.query),
  );
}

export function filterTrackerItems(
  items: readonly TrackerItem[],
  filters: TrackerFilters,
): TrackerItem[] {
  return filterByDeveloperAndQuery(items, filters).filter(
    (item) => filters.status === "all" || item.status === filters.status,
  );
}

export function statusCounts(items: readonly TrackerItem[]): Record<TrackerStatus, number> {
  const counts = Object.fromEntries(TRACKER_STATUSES.map((meta) => [meta.value, 0])) as Record<
    TrackerStatus,
    number
  >;
  for (const item of items) if (item.status in counts) counts[item.status] += 1;
  return counts;
}

export function needsDecisionCount(items: readonly TrackerItem[]): number {
  return items.filter((item) => item.status === "needs-decision").length;
}

/** Developers present on the sheet, in a stable order. */
export function trackerDevelopers(items: readonly TrackerItem[]): string[] {
  return [...new Set(items.map((item) => item.developer).filter(Boolean))].sort();
}

// ---- Decisions ----

export const DECISION_TEXT_MAX = 5000;
export const ATTACHMENT_MAX_COUNT = 6;
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
];
/** For the file picker's `accept`. */
export const ATTACHMENT_ACCEPT = ATTACHMENT_TYPES.join(",");

export function isImageAttachment(contentType: string): boolean {
  return contentType.startsWith("image/");
}

/** Null when the decision text can be saved. */
export function decisionTextError(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return "Write the decision before saving it.";
  if (trimmed.length > DECISION_TEXT_MAX) {
    return `Keep the decision to ${DECISION_TEXT_MAX.toLocaleString("en-PH")} characters; it is ${trimmed.length.toLocaleString("en-PH")} now.`;
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Which picked files fit the decision. Wrong types and oversized files are
 * named one by one; files past the sixth are counted once.
 */
export function admitAttachments(
  alreadyAttached: number,
  picked: readonly File[],
): { accepted: File[]; problems: string[] } {
  const accepted: File[] = [];
  const problems: string[] = [];
  let leftOut = 0;
  for (const file of picked) {
    if (!ATTACHMENT_TYPES.includes(file.type)) {
      problems.push(`${file.name} is not a PNG, JPEG, WebP or PDF.`);
      continue;
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      problems.push(`${file.name} is larger than 10 MB (${formatFileSize(file.size)}).`);
      continue;
    }
    if (alreadyAttached + accepted.length >= ATTACHMENT_MAX_COUNT) {
      leftOut += 1;
      continue;
    }
    accepted.push(file);
  }
  if (leftOut) {
    problems.push(
      `A decision holds ${ATTACHMENT_MAX_COUNT} files at most, so ${leftOut} ${leftOut === 1 ? "was" : "were"} left out.`,
    );
  }
  return { accepted, problems };
}

// ---- Errors ----

export function isTrackerNotConfigured(err: unknown): boolean {
  return isApiError(err) && err.code === "tracker_not_configured";
}

type TrackerAction = "load" | "status" | "decision" | "upload" | "attachment";

const FALLBACK: Record<TrackerAction, string> = {
  load: "The tracker did not load. Check your connection, then try again.",
  status: "The status did not change. Try again.",
  decision: "The decision was not saved. Try again.",
  upload: "The file did not upload. Nothing was saved; try again.",
  attachment: "The file link did not open. Try again.",
};

/** Plain recovery copy for a failed tracker call. Never a raw code alone. */
export function trackerErrorMessage(err: unknown, action: TrackerAction): string {
  if (!isApiError(err)) return FALLBACK[action];
  if (err.code === "tracker_not_configured") {
    return "The tracker is not connected to GitHub yet, so nothing was changed.";
  }
  switch (err.kind) {
    case "unauthorized":
      return "Your session expired. Sign in again as Super Admin.";
    case "forbidden":
      return "The tracker is for Super Admin only.";
    case "not_found":
      return action === "attachment"
        ? "That file is no longer stored. Refresh to see the decision as it stands."
        : "That GitHub issue was not found. Refresh the tracker; it may have been moved or deleted.";
    case "conflict":
      return action === "decision"
        ? "This item is no longer waiting on a decision. Refresh to see its current status."
        : "The issue changed on GitHub since this page loaded. Refresh and try again.";
    case "validation":
      if (action === "upload") {
        return "That file was refused. Use a PNG, JPEG, WebP or PDF of 10 MB or less.";
      }
      if (action === "decision") {
        return "The decision was refused. Check the text (up to 5,000 characters) and the files (up to 6).";
      }
      return "That status was refused. Pick one of the six statuses and try again.";
    case "server":
      return err.status === 502 || err.status === 503 || err.status === 504
        ? "GitHub did not answer in time. Nothing was changed; try again in a minute."
        : "The API failed while handling this. Try again in a minute.";
    default:
      return FALLBACK[action];
  }
}
