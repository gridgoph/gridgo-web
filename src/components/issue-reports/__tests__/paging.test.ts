import { describe, expect, it } from "vitest";

import {
  appendPage,
  hasMoreReports,
  ISSUE_REPORTS_MAX_LIMIT,
  reloadLimit,
  showingLabel,
} from "@/components/issue-reports/paging";
import type { IssueReport } from "@/lib/api/types";

const row = (id: string) => ({ id }) as IssueReport;

describe("issue report paging", () => {
  it("refreshes as many whole pages as are loaded, within the API cap", () => {
    expect(reloadLimit(0)).toBe(25);
    expect(reloadLimit(25)).toBe(25);
    expect(reloadLimit(26)).toBe(50);
    expect(reloadLimit(10_000)).toBe(ISSUE_REPORTS_MAX_LIMIT);
  });

  it("reads more from the view's total, or from a full page without one", () => {
    expect(hasMoreReports(25, 30, { received: 25, requested: 25 })).toBe(true);
    expect(hasMoreReports(30, 30, { received: 5, requested: 25 })).toBe(false);
    expect(hasMoreReports(25, undefined, { received: 25, requested: 25 })).toBe(true);
    expect(hasMoreReports(7, undefined, { received: 7, requested: 25 })).toBe(false);
  });

  it("appends only reports not already listed, and spots an ignored cursor", () => {
    const current = [row("a"), row("b")];
    expect(appendPage(current, [row("c")])).toEqual({ reports: [row("a"), row("b"), row("c")], added: 1, ignoredCursor: false });
    expect(appendPage(current, [row("b"), row("c")]).added).toBe(1);
    expect(appendPage(current, [row("a"), row("b")])).toEqual({ reports: current, added: 0, ignoredCursor: true });
    expect(appendPage(current, []).added).toBe(0);
  });

  it("says how much of the tab is showing", () => {
    expect(showingLabel(25, 61)).toBe("Showing 25 of 61");
    expect(showingLabel(61, 61)).toBe("61 reports");
    expect(showingLabel(1, 1)).toBe("1 report");
    expect(showingLabel(7, undefined)).toBe("7 reports");
  });
});
