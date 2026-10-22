/** A problem report, posted as its own Operations conversation. */

export const PROBLEM_REPORT_MAX = 1500;
export const PROBLEM_REPORT_HEADING = "Problem report";

export function problemReportIssue(what: string): string | null {
  if (!what.trim()) return "Say what went wrong before you send it.";
  if (what.trim().length > PROBLEM_REPORT_MAX) {
    return `Keep it under ${PROBLEM_REPORT_MAX} characters. Operations can ask for more in the chat.`;
  }
  return null;
}

export type ProblemReportContext = { appVersion: string; browser: string };

export function composeProblemReport(input: {
  what: string;
  job?: { orderId: string; title?: string | null } | null;
  context: ProblemReportContext;
}): string {
  const lines = [PROBLEM_REPORT_HEADING];
  const title = input.job?.title?.trim();
  if (title) lines.push(`Job: ${title}`);
  if (input.job?.orderId) lines.push(`Order ${input.job.orderId}`);
  lines.push("", input.what.replace(/\r\n/g, "\n").trim(), "");
  lines.push(`App: GRIDGO Supplier ${input.context.appVersion}`);
  lines.push(`Browser: ${input.context.browser}`);
  return lines.join("\n");
}

export function readBrowserContext(): ProblemReportContext {
  const browser = typeof navigator === "undefined" ? "unknown browser" : navigator.userAgent || "unknown browser";
  return { appVersion: "web", browser };
}
