import type { IssueReport } from "@/lib/api/types";

/** The client app's report opens with this heading, then "What happened:" (gridgo-client `lib/bugReport.ts`). */
const APP_REPORT_HEADING = /^Bug report from the .+ app$/i;
const WHAT_HAPPENED = "What happened:";
/** The app's note that the pictures are in the chat. */
const SCREENSHOTS_IN_THREAD = /^Screenshots: \d+, in that thread$/;

/**
 * The report as a person reads it. The app ends its text with the chat thread's
 * id and a screenshot count, which the Open chat action and the screenshots now
 * show. Each line goes only while the desk shows what it stood for: a thread the
 * API could not resolve keeps its id, and a count with no pictures left stays.
 */
export function reportBodyText(report: Pick<IssueReport, "issue" | "supportThreadId" | "screenshots">): string {
  const threadId = report.supportThreadId;
  if (!threadId) return report.issue;
  const threadLine = `support chat thread: ${threadId}`.toLowerCase();
  const kept = report.issue.split(/\r?\n/).filter((line) => {
    const text = line.trim();
    if (text.toLowerCase() === threadLine) return false;
    return !(report.screenshots.length > 0 && SCREENSHOTS_IN_THREAD.test(text));
  });
  return kept.join("\n").trimEnd();
}

/**
 * The line that names a report in the list. Every app report opens with the same
 * heading, so it is named by what the reporter said happened.
 */
export function reportTitleLine(issue: string): string {
  const lines = issue
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines[2] && APP_REPORT_HEADING.test(lines[0]) && lines[1] === WHAT_HAPPENED) return lines[2];
  return lines[0] ?? issue;
}
