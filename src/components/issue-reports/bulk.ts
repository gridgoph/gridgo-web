/**
 * Changing many reports at once from the desk's selection. There is no bulk
 * endpoint: every report is its own `PATCH /ops/issue-reports/:id`, one at a
 * time, so each one succeeds or fails on its own and the desk can say which.
 */

import { acceptSuggestion, reportReference, statusLabel, triageOf, VALIDITY } from "@/components/issue-reports/triage";
import { isApiError } from "@/lib/api/client";
import type { IssueReport, IssueReportStatus, IssueReportTriageInput, IssueReportValidity } from "@/lib/api/types";

export type BulkAction =
  | { kind: "accept" }
  | { kind: "verdict"; validity: Exclude<IssueReportValidity, "duplicate"> }
  | { kind: "duplicate"; of: string }
  | { kind: "status"; status: IssueReportStatus; publishedIn?: string | null };

/** One report's write; triage and workflow are separate PATCH bodies. */
export type BulkWrite =
  | { triage: IssueReportTriageInput }
  | { status: IssueReportStatus; publishedIn: string | null };

export type BulkStep = { report: IssueReport; write: BulkWrite };
export type BulkSkip = { report: IssueReport; reason: string };

export type BulkPlan = { steps: BulkStep[]; skipped: BulkSkip[] };

/**
 * What an action does to each selected report, and which it leaves alone
 * (already so, or nothing to take). Status writes never carry a tracker
 * link, so a Super Admin's stored link is kept and Operations never sends one.
 */
export function planBulk(action: BulkAction, reports: readonly IssueReport[]): BulkPlan {
  const steps: BulkStep[] = [];
  const skipped: BulkSkip[] = [];
  for (const report of reports) {
    const triage = triageOf(report);
    if (action.kind === "accept") {
      if (!report.aiReview) skipped.push({ report, reason: "No suggestion yet" });
      else if (report.aiReview.outcome === "confirmed") skipped.push({ report, reason: "Already matches the suggestion" });
      else steps.push({ report, write: { triage: acceptSuggestion(report.aiReview, triage) } });
    } else if (action.kind === "verdict") {
      if (triage.validity === action.validity) {
        skipped.push({ report, reason: `Already ${VALIDITY[action.validity].label.toLowerCase()}` });
      } else steps.push({ report, write: { triage: { validity: action.validity } } });
    } else if (action.kind === "duplicate") {
      if (report.id === action.of) skipped.push({ report, reason: "It is the report the others repeat" });
      else if (triage.validity === "duplicate" && triage.duplicateOf === action.of) {
        skipped.push({ report, reason: `Already a duplicate of ${reportReference(action.of)}` });
      } else steps.push({ report, write: { triage: { validity: "duplicate", duplicateOf: action.of } } });
    } else {
      const publishedIn = action.status === "published" ? (action.publishedIn ?? null) : null;
      if (report.status === action.status && (action.status !== "published" || (report.publishedIn ?? null) === publishedIn)) {
        skipped.push({ report, reason: `Already ${statusLabel(action.status).toLowerCase()}` });
      } else steps.push({ report, write: { status: action.status, publishedIn } });
    }
  }
  return { steps, skipped };
}

/** "Mark 12 reports valid", the confirm button and progress heading. */
export function actionTitle(action: BulkAction, count: number): string {
  const reports = count === 1 ? "1 report" : `${count} reports`;
  if (action.kind === "accept") return count === 1 ? "Accept 1 suggestion" : `Accept ${count} suggestions`;
  if (action.kind === "verdict") {
    return action.validity === "unreviewed"
      ? `Put ${reports} back to Needs review`
      : `Mark ${reports} ${VALIDITY[action.validity].label.toLowerCase()}`;
  }
  if (action.kind === "duplicate") return `Mark ${reports} duplicate of ${reportReference(action.of)}`;
  return `Move ${reports} to ${statusLabel(action.status)}`;
}

/** For accepting suggestions: what the verdicts will be, e.g. "9 valid, 2 duplicate". */
export function acceptBreakdown(steps: readonly BulkStep[]): string {
  const tally = new Map<IssueReportValidity, number>();
  for (const step of steps) {
    const validity = "triage" in step.write ? step.write.triage.validity : undefined;
    if (validity) tally.set(validity, (tally.get(validity) ?? 0) + 1);
  }
  return [...tally.entries()].map(([validity, count]) => `${count} ${VALIDITY[validity].label.toLowerCase()}`).join(", ");
}

/** Plain words for a refused write, the same on one report or many. */
export function writeErrorCopy(err: unknown): string {
  if (isApiError(err) && err.code === "issue_report_not_found") return "This report no longer exists.";
  if (isApiError(err) && err.code === "tracker_issue_url_forbidden") return "Only Super Admin can change a GitHub link.";
  if (isApiError(err) && err.kind === "forbidden") return "Your account cannot change issue reports.";
  if (isApiError(err) && err.kind === "validation") return "The server refused this change.";
  return "Could not save. Check your connection.";
}

export type BulkFailure = { report: IssueReport; message: string };

export type BulkOutcome = {
  saved: IssueReport[];
  failed: BulkFailure[];
  /** Not tried, because the run was stopped first. */
  untouched: IssueReport[];
};

/**
 * Runs the steps one at a time, in order. A failure never stops the run; a
 * stop request ends it before the next report. `onProgress` hears each
 * report as it lands, saved (with the API's copy) or not.
 */
export async function runBulk(
  steps: readonly BulkStep[],
  write: (id: string, write: BulkWrite) => Promise<IssueReport>,
  options: {
    onProgress?: (done: number, result: { report: IssueReport; updated?: IssueReport; error?: string }) => void;
    stopped?: () => boolean;
  } = {},
): Promise<BulkOutcome> {
  const outcome: BulkOutcome = { saved: [], failed: [], untouched: [] };
  for (const [index, step] of steps.entries()) {
    if (options.stopped?.()) {
      outcome.untouched = steps.slice(index).map((entry) => entry.report);
      break;
    }
    try {
      const updated = await write(step.report.id, step.write);
      outcome.saved.push(updated);
      options.onProgress?.(index + 1, { report: step.report, updated });
    } catch (err) {
      const message = writeErrorCopy(err);
      outcome.failed.push({ report: step.report, message });
      options.onProgress?.(index + 1, { report: step.report, error: message });
    }
  }
  return outcome;
}

/** "11 saved. 1 could not be saved." Never a bare success when one failed. */
export function outcomeSummary(outcome: BulkOutcome, skipped: number): string {
  const parts = [`${outcome.saved.length} saved.`];
  if (outcome.failed.length) parts.push(`${outcome.failed.length} could not be saved.`);
  if (outcome.untouched.length) parts.push(`Stopped before ${outcome.untouched.length} more.`);
  if (skipped) parts.push(`${skipped} left as they were.`);
  return parts.join(" ");
}
