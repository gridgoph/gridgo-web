import type { IssueReport, IssueReportCounts, IssueReportStatus } from "@/lib/api/types";

/** Reports fetched per page of the desk's list. */
export const ISSUE_REPORTS_PAGE_SIZE = 25;
/** The API's `limit` cap on one list call. */
export const ISSUE_REPORTS_MAX_LIMIT = 500;

/**
 * How many reports a refresh asks for, so a refresh (live ping, Refresh, after
 * marking one) keeps the pages already loaded instead of folding the list back
 * to its first page.
 */
export function reloadLimit(loaded: number): number {
  const pages = Math.max(1, Math.ceil(loaded / ISSUE_REPORTS_PAGE_SIZE));
  return Math.min(pages * ISSUE_REPORTS_PAGE_SIZE, ISSUE_REPORTS_MAX_LIMIT);
}

/**
 * Whether the tab has reports beyond those loaded. `counts` are the API's
 * totals per status, so they decide; an API without a `tracked` count falls
 * back to "the last page came back full".
 */
export function hasMoreReports(
  loaded: number,
  counts: IssueReportCounts | null,
  status: IssueReportStatus,
  lastPage: { received: number; requested: number },
): boolean {
  const total = counts?.[status];
  if (typeof total === "number") return loaded < total;
  return lastPage.received >= lastPage.requested;
}

/**
 * Appends the next page, dropping any report already listed (a report that
 * moved while paging). `ignoredCursor` is an API that predates `before` and
 * answered with the first page again; the desk then grows the first page.
 */
export function appendPage(
  current: IssueReport[],
  page: IssueReport[],
): { reports: IssueReport[]; added: number; ignoredCursor: boolean } {
  const ignoredCursor = page.length > 0 && current.length > 0 && page[0].id === current[0].id;
  const seen = new Set(current.map((report) => report.id));
  const fresh = page.filter((report) => !seen.has(report.id));
  return { reports: fresh.length ? [...current, ...fresh] : current, added: fresh.length, ignoredCursor };
}

/** "Showing 25 of 61". */
export function showingLabel(loaded: number, total: number | undefined): string {
  if (typeof total !== "number" || total <= loaded) {
    return loaded === 1 ? "1 report" : `${loaded} reports`;
  }
  return `Showing ${loaded} of ${total}`;
}
