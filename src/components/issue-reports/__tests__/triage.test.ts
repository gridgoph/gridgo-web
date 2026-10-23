import { describe, expect, it } from "vitest";

import { triageSummary } from "@/components/issue-reports/TriageFilters";
import {
  acceptSuggestion,
  aiOutcome,
  aiRowLabel,
  checkLabel,
  DEFAULT_FILTERS,
  filterQuery,
  isDefaultFilters,
  listIsWhole,
  matchesFilters,
  moreFilterCount,
  resolveReportReference,
  triageOf,
  type TriageFilters,
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

describe("filterQuery", () => {
  it("starts with spam hidden and nothing else narrowed", () => {
    expect(filterQuery(DEFAULT_FILTERS)).toEqual({ validity: ["unreviewed", "valid", "duplicate"] });
    expect(isDefaultFilters(DEFAULT_FILTERS)).toBe(true);
  });

  it("sends no validity when every verdict is on", () => {
    expect(filterQuery({ ...DEFAULT_FILTERS, validity: ["spam", "valid", "unreviewed", "duplicate"] })).toEqual({});
  });

  it("sends the category, label and AI review the desk narrows by", () => {
    const filters: TriageFilters = { validity: ["spam"], category: "none", label: "checkout", ai: "not_reviewed" };
    expect(filterQuery(filters)).toEqual({
      validity: ["spam"],
      triageCategory: ["none"],
      label: "checkout",
      aiReviewed: false,
    });
    expect(moreFilterCount(filters)).toBe(3);
    expect(isDefaultFilters(filters)).toBe(false);
  });
});

describe("listIsWhole", () => {
  it("lets the status counts total the list while no spam exists", () => {
    expect(listIsWhole(DEFAULT_FILTERS, counts(0))).toBe(true);
    expect(listIsWhole(DEFAULT_FILTERS, null)).toBe(true);
  });

  it("stops trusting them once spam is hidden or another filter is set", () => {
    expect(listIsWhole(DEFAULT_FILTERS, counts(1))).toBe(false);
    expect(listIsWhole({ ...DEFAULT_FILTERS, validity: ["unreviewed", "valid", "duplicate", "spam"], ai: "reviewed" }, counts(0))).toBe(false);
  });
});

describe("matchesFilters", () => {
  it("drops a report marked spam from the default view", () => {
    expect(matchesFilters(report, DEFAULT_FILTERS)).toBe(true);
    expect(matchesFilters({ ...report, triage: { ...triage, validity: "spam" } }, DEFAULT_FILTERS)).toBe(false);
  });

  it("checks category, label and AI review", () => {
    const sorted = { ...report, triage: { ...triage, category: "bug" as const, labels: ["map"] }, aiReview: ai };
    expect(matchesFilters(sorted, { ...DEFAULT_FILTERS, category: "bug", label: "map", ai: "reviewed" })).toBe(true);
    expect(matchesFilters(sorted, { ...DEFAULT_FILTERS, category: "none" })).toBe(false);
    expect(matchesFilters(report, { ...DEFAULT_FILTERS, category: "none" })).toBe(true);
    expect(matchesFilters(sorted, { ...DEFAULT_FILTERS, label: "checkout" })).toBe(false);
    expect(matchesFilters(sorted, { ...DEFAULT_FILTERS, ai: "not_reviewed" })).toBe(false);
  });

  it("reads a report from an API before triage as To review", () => {
    const old = { ...report, triage: undefined, aiReview: undefined };
    expect(triageOf(old).validity).toBe("unreviewed");
    expect(matchesFilters(old, DEFAULT_FILTERS)).toBe(true);
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
    expect(aiRowLabel(ai)).toBe("AI suggests spam");
    expect(aiRowLabel({ ...ai, outcome: "confirmed" })).toBe("Agrees with AI");
    expect(aiRowLabel({ ...ai, outcome: "overridden" })).toBe("Overrules AI");
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
