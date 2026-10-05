import { describe, expect, it } from "vitest";

import {
  describeCalendarDate,
  describePeriod,
  isPlainId,
  manilaMonthStart,
  manilaToday,
  presentOrganizationStanding,
  statementErrorMessage,
  statementFileName,
  statementPeriod,
} from "@/lib/statements";

describe("statementPeriod", () => {
  it("asks for a preset as it is", () => {
    expect(statementPeriod("this_quarter", "", "")).toEqual({
      period: { period: "this_quarter" },
    });
  });

  it("asks for custom dates, both ends included", () => {
    expect(statementPeriod("custom", "2026-10-01", "2026-10-01")).toEqual({
      period: { period: "custom", from: "2026-10-01", to: "2026-10-01" },
    });
  });

  it("refuses dates out of order, impossible dates and periods over 366 days", () => {
    expect(statementPeriod("custom", "2026-10-02", "2026-10-01")).toEqual({
      problem: "The end date is before the start date.",
    });
    expect(statementPeriod("custom", "2026-02-30", "2026-03-01")).toEqual({
      problem: "Choose a start and an end date.",
    });
    expect(statementPeriod("custom", "2025-01-01", "2026-01-02")).toEqual({
      problem: "A statement covers at most 366 days. Shorten the range.",
    });
    // 366 days, both ends included, is the longest the API takes.
    expect("period" in statementPeriod("custom", "2025-01-01", "2026-01-01")).toBe(true);
  });
});

describe("Manila dates", () => {
  it("counts the day in Manila, eight hours ahead of UTC", () => {
    const lateUtc = new Date("2026-10-31T17:00:00Z");
    expect(manilaToday(lateUtc)).toBe("2026-11-01");
    expect(manilaMonthStart(lateUtc)).toBe("2026-11-01");
  });

  it("describes a period in words", () => {
    expect(describePeriod({ from: "2026-10-01", to: "2026-10-31" })).toBe(
      "1 Oct – 31 Oct 2026",
    );
  });

  it("describes a statement row's closing date the same way", () => {
    expect(describeCalendarDate("2026-10-04")).toBe("4 Oct 2026");
    expect(describeCalendarDate("not a date")).toBe("not a date");
  });
});

it("names an export as the API does", () => {
  expect(statementFileName({ from: "2026-10-01", to: "2026-10-31" }, "csv")).toBe(
    "organization-statement-2026-10-01-2026-10-31.csv",
  );
});

it("explains why a statement was refused", () => {
  expect(statementErrorMessage("organization_approval_required")).toMatch(
    /only kept for organizations Operations has approved/,
  );
  expect(presentOrganizationStanding("approved").label).toBe("Approved");
  expect(presentOrganizationStanding(null).label).toBe("No application");
});

it("lets only a plain user id into a request path", () => {
  expect(isPlainId("user_2c32057e640c")).toBe(true);
  expect(isPlainId("../orders")).toBe(false);
  expect(isPlainId("a/b")).toBe(false);
  expect(isPlainId("")).toBe(false);
});
