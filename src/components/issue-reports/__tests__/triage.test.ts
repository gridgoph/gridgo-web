import { describe, expect, it } from "vitest";

import {
  acceptSuggestion,
  activeFilters,
  aiOutcome,
  aiRowLabel,
  checkLabel,
  clearFilters,
  DEFAULT_VIEW,
  filterQuery,
  knownTotal,
  matchesSearch,
  matchesView,
  resolveReportReference,
  searchFromView,
  suggestionLabel,
  tabCount,
  triageOf,
  triageSummary,
  viewFromSearch,
  withoutFilter,
  type DeskView,
} from "@/components/issue-reports/triage";
import type { IssueReport, IssueReportAiReview, IssueReportTriage, IssueReportTriageCounts } from "@/lib/api/types";

const triage: IssueReportTriage = {
  validity: "unreviewed",
  category: null,
  labels: [],
  duplicateOf: null,
  triagedBy: null,
  triagedAt: null,
};

const report: IssueReport = {
  id: "50d4f603-c50a-4e95-93f8-107a1cd8cf91",
  issue: "Orders need a manual refresh.",
  category: "bug",
  status: "new",
  publishedIn: null,
  createdAt: "2026-09-24T09:37:12.000Z",
  updatedAt: "2026-09-24T09:37:12.000Z",
  screenshots: [],
  triage,
  aiReview: null,
};

const ai: IssueReportAiReview = {
  reviewedAt: "2026-10-23T15:00:00.000Z",
  validity: "spam",
  category: "other",
  labels: ["promo"],
  duplicateOf: null,
  note: "Advertising.",
  outcome: "pending",
};

const counts = (spam: number): IssueReportTriageCounts => ({
  validity: { unreviewed: 4, valid: 2, spam, duplicate: 0 },
  aiReviewed: 3,
  aiAwaitingHuman: 2,
  labels: [],
});

describe("tabs and counts", () => {
  it("counts each tab from the triage totals, and All as their sum", () => {
    expect(tabCount("review", counts(1))).toBe(4);
    expect(tabCount("spam", counts(1))).toBe(1);
    expect(tabCount("all", counts(1))).toBe(7);
    expect(tabCount("all", null)).toBeUndefined();
  });

  it("knows the view's total only while the API's counts can say", () => {
    const status = { new: 5, tracked: 1, published: 0, dismissed: 1, priorities: 2 };
    expect(knownTotal(DEFAULT_VIEW, status, counts(1))).toBe(4);
    expect(knownTotal({ ...DEFAULT_VIEW, tab: "all", status: "new" }, status, counts(1))).toBe(5);
    expect(knownTotal({ ...DEFAULT_VIEW, tab: "all", priority: true }, status, counts(1))).toBe(2);
    expect(knownTotal({ ...DEFAULT_VIEW, status: "new" }, status, counts(1))).toBeUndefined();
    expect(knownTotal({ ...DEFAULT_VIEW, label: "map" }, status, counts(1))).toBeUndefined();
  });
});

describe("filterQuery", () => {
  it("asks for the tab's verdict and nothing else by default", () => {
    expect(filterQuery(DEFAULT_VIEW)).toEqual({ validity: ["unreviewed"] });
    expect(filterQuery({ ...DEFAULT_VIEW, tab: "all" })).toEqual({});
  });

  it("sends category, label, suggestion, priority and the received window", () => {
    const view: DeskView = {
      ...DEFAULT_VIEW,
      tab: "spam",
      category: "none",
      label: "checkout",
      ai: "not_reviewed",
      priority: true,
      received: "week",
      q: "ignored by the API",
    };
    expect(filterQuery(view, Date.parse("2026-10-27T00:00:00.000Z"))).toEqual({
      validity: ["spam"],
      triageCategory: ["none"],
      label: "checkout",
      aiReviewed: false,
      priority: true,
      since: "2026-10-20T00:00:00.000Z",
    });
  });
});

describe("the view in the URL", () => {
  it("round-trips every filter and the open report, leaving defaults off", () => {
    const view: DeskView = {
      tab: "duplicate",
      status: "tracked",
      priority: true,
      category: "bug",
      label: "rider-map",
      received: "month",
      ai: "reviewed",
      q: "checkout",
    };
    const query = searchFromView(view, report.id);
    expect(viewFromSearch(new URLSearchParams(query))).toEqual(view);
    expect(new URLSearchParams(query).get("report")).toBe(report.id);
    expect(searchFromView(DEFAULT_VIEW)).toBe("");
  });

  it("falls back on anything it does not know", () => {
    expect(viewFromSearch(new URLSearchParams("tab=bogus&status=x&label=NO!&received=year"))).toEqual(DEFAULT_VIEW);
    expect(viewFromSearch(null)).toEqual(DEFAULT_VIEW);
  });
});

describe("filter chips", () => {
  const view: DeskView = { ...DEFAULT_VIEW, tab: "valid", status: "new", label: "map", q: "rider", priority: true };

  it("lists each filter in force, in toolbar order", () => {
    expect(activeFilters(view).map((chip) => chip.label)).toEqual([
      "Search: “rider”",
      "Status: New",
      "Label: map",
      "Priority only",
    ]);
    expect(activeFilters(DEFAULT_VIEW)).toEqual([]);
  });

  it("removes one, or clears all while keeping the tab", () => {
    expect(withoutFilter(view, "label").label).toBeNull();
    expect(clearFilters(view)).toEqual({ ...DEFAULT_VIEW, tab: "valid" });
  });
});

describe("matchesView", () => {
  it("drops a report that left the tab", () => {
    expect(matchesView(report, DEFAULT_VIEW)).toBe(true);
    expect(matchesView({ ...report, triage: { ...triage, validity: "spam" } }, DEFAULT_VIEW)).toBe(false);
    expect(matchesView({ ...report, triage: { ...triage, validity: "spam" } }, { ...DEFAULT_VIEW, tab: "all" })).toBe(true);
  });

  it("checks status, priority, category, label and suggestion", () => {
    const sorted = { ...report, priority: true, triage: { ...triage, category: "bug" as const, labels: ["map"] }, aiReview: ai };
    expect(
      matchesView(sorted, { ...DEFAULT_VIEW, status: "new", priority: true, category: "bug", label: "map", ai: "reviewed" }),
    ).toBe(true);
    expect(matchesView(sorted, { ...DEFAULT_VIEW, status: "tracked" })).toBe(false);
    expect(matchesView(report, { ...DEFAULT_VIEW, priority: true })).toBe(false);
    expect(matchesView(sorted, { ...DEFAULT_VIEW, category: "none" })).toBe(false);
    expect(matchesView(report, { ...DEFAULT_VIEW, category: "none" })).toBe(true);
    expect(matchesView(sorted, { ...DEFAULT_VIEW, label: "checkout" })).toBe(false);
    expect(matchesView(sorted, { ...DEFAULT_VIEW, ai: "not_reviewed" })).toBe(false);
  });

  it("reads a report from an API before triage as needing review", () => {
    const old = { ...report, triage: undefined, aiReview: undefined };
    expect(triageOf(old).validity).toBe("unreviewed");
    expect(matchesView(old, DEFAULT_VIEW)).toBe(true);
  });
});

describe("matchesSearch", () => {
  it("finds every word in the text, reference, labels or suggestion note", () => {
    const labelled = { ...report, triage: { ...triage, labels: ["rider-map"] }, aiReview: ai };
    expect(matchesSearch(labelled, "manual REFRESH")).toBe(true);
    expect(matchesSearch(labelled, "50d4f603")).toBe(true);
    expect(matchesSearch(labelled, "rider-map promo")).toBe(true);
    expect(matchesSearch(labelled, "advertising")).toBe(true);
    expect(matchesSearch(labelled, "refresh missing")).toBe(false);
    expect(matchesSearch(labelled, "  ")).toBe(true);
  });

  it("searches only the text the reader may see", () => {
    const linked = { ...report, issue: "See https://github.com/gridgoph/gridgo-api/issues/9" };
    expect(matchesSearch(linked, "github", () => "See [link hidden]")).toBe(false);
  });
});

describe("checkLabel", () => {
  it("stores what the API stores", () => {
    expect(checkLabel("  Rider Map ", [])).toEqual({ ok: true, label: "rider-map" });
    expect(checkLabel("#checkout", [])).toEqual({ ok: true, label: "checkout" });
  });

  it.each([
    ["", "Type a label first."],
    ["-map", "Use lowercase letters"],
    ["map!", "Use lowercase letters"],
    ["a".repeat(33), "Use lowercase letters"],
    ["map", "already has"],
  ])("refuses %j", (input, message) => {
    const check = checkLabel(input, ["map"]);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toContain(message);
  });

  it("refuses an eleventh label", () => {
    const ten = Array.from({ length: 10 }, (_, index) => `l${index}`);
    expect(checkLabel("one-more", ten)).toEqual({ ok: false, error: "A report holds up to 10 labels." });
  });
});

describe("resolveReportReference", () => {
  const other = { ...report, id: "aaaa0002-0000-4000-8000-000000000002" };

  it("finds a loaded report by its reference, or takes a full id", () => {
    expect(resolveReportReference("aaaa0002", [report, other], report.id)).toEqual({ ok: true, id: other.id });
    expect(resolveReportReference("AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE", [], report.id)).toEqual({
      ok: true,
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });
  });

  it("refuses an unknown reference and the report itself", () => {
    expect(resolveReportReference("12345678", [report], report.id).ok).toBe(false);
    expect(resolveReportReference("50D4F603", [report], report.id)).toEqual({
      ok: false,
      error: "A report cannot repeat itself.",
    });
  });
});

describe("AI review", () => {
  it("names who confirmed or overrode it", () => {
    const by = { ...triage, triagedBy: { id: "u1", name: "Ana" } };
    expect(aiOutcome(ai, by).label).toBe("Waiting for a person");
    expect(aiOutcome({ ...ai, outcome: "confirmed" }, by).label).toBe("Confirmed by Ana");
    expect(aiOutcome({ ...ai, outcome: "overridden" }, { ...by, triagedBy: { id: "u1", name: null } }).label).toBe(
      "Overridden by a teammate",
    );
    expect(aiRowLabel(ai)).toBe("Suggested: Spam");
    expect(aiRowLabel({ ...ai, outcome: "confirmed" })).toBe("Matches the suggestion");
    expect(aiRowLabel({ ...ai, outcome: "overridden" })).toBe("Suggested: Spam, overruled");
  });

  it("names the report a suggested duplicate repeats", () => {
    expect(suggestionLabel({ ...ai, validity: "duplicate", duplicateOf: "3c7d1e2f-0000-4000-8000-000000000001" })).toBe(
      "Suggested: Duplicate of 3C7D1E2F",
    );
    expect(suggestionLabel({ ...ai, validity: "valid" })).toBe("Suggested: Valid");
  });

  it("takes the suggestion, adding its labels to the person's", () => {
    expect(acceptSuggestion(ai, { ...triage, labels: ["map"] })).toEqual({
      validity: "spam",
      category: "other",
      labels: ["map", "promo"],
    });
    const duplicate = { ...ai, validity: "duplicate" as const, category: null, labels: [], duplicateOf: "x" };
    expect(acceptSuggestion(duplicate, triage)).toEqual({ validity: "duplicate", duplicateOf: "x" });
  });
});

describe("triageSummary", () => {
  it("says how many reports wait for a verdict across every tab", () => {
    expect(triageSummary(counts(0))).toBe("4 reports wait for a verdict, 2 with an AI suggestion.");
    expect(triageSummary({ ...counts(0), validity: { unreviewed: 1, valid: 0, spam: 0, duplicate: 0 }, aiAwaitingHuman: 0 })).toBe(
      "1 report waits for a verdict.",
    );
    expect(triageSummary({ ...counts(0), validity: { unreviewed: 0, valid: 0, spam: 0, duplicate: 0 } })).toBe(
      "Every report has a verdict.",
    );
  });
});
