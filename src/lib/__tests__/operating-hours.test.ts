import { describe, expect, it } from "vitest";

import type { OperatingHours } from "@/lib/api/types";
import {
  LAUNCH_OPERATING_HOURS,
  addOpeningMs,
  closureDayCount,
  closureLabel,
  durationWords,
  isOpenAt,
  manilaWhen,
  openingMsBetween,
  operatingDraft,
  operatingHoursChanges,
  operatingHoursReason,
  operatingStatusLine,
  parseOperatingDraft,
  reviewTimingAt,
  weekSummary,
} from "@/lib/operating-hours";

const at = (iso: string) => Date.parse(iso);

/** Operating hours as an API without the same-day promise margin returns them. */
function withoutMargin(): OperatingHours {
  const older: OperatingHours = { ...LAUNCH_OPERATING_HOURS };
  delete older.sameDayPromiseAllowanceMinutes;
  return older;
}

function withClosures(...closures: { startDay: string; endDay: string }[]): OperatingHours {
  return {
    ...LAUNCH_OPERATING_HOURS,
    schedule: { ...LAUNCH_OPERATING_HOURS.schedule, closures },
  };
}

describe("operating hours draft", () => {
  it("reads the launch week back unchanged", () => {
    const parsed = parseOperatingDraft(operatingDraft(LAUNCH_OPERATING_HOURS));
    expect(parsed).toEqual({ value: LAUNCH_OPERATING_HOURS });
  });

  it("keeps a closed day's hours so switching it back on restores them", () => {
    const draft = operatingDraft(LAUNCH_OPERATING_HOURS);
    draft.days[6] = { ...draft.days[6], open: false };
    const parsed = parseOperatingDraft(draft);
    expect("value" in parsed && parsed.value.schedule.week.map((w) => w.weekday)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(draft.days[6].opens).toBe("08:00");
  });

  it("explains each refusal the API would give", () => {
    const base = () => operatingDraft(LAUNCH_OPERATING_HOURS);

    const none = base();
    for (const day of [0, 1, 2, 3, 4, 5, 6]) none.days[day].open = false;
    expect(parseOperatingDraft(none)).toMatchObject({ field: "week" });

    const backwards = base();
    backwards.days[2] = { open: true, opens: "17:00", closes: "08:00" };
    expect(parseOperatingDraft(backwards)).toMatchObject({ field: "day-2" });

    for (const review of ["0", "541", "1.5", ""]) {
      const draft = base();
      draft.review = review;
      expect(parseOperatingDraft(draft)).toMatchObject({ field: "review" });
    }

    const badDate = base();
    badDate.closures = [{ startDay: "2026-02-30", endDay: "2026-02-30" }];
    expect(parseOperatingDraft(badDate)).toMatchObject({ field: "closure-0" });

    const reversed = base();
    reversed.closures = [{ startDay: "2026-12-26", endDay: "2026-12-25" }];
    expect(parseOperatingDraft(reversed)).toMatchObject({ field: "closure-0" });

    const tooMany = base();
    tooMany.closures = [
      { startDay: "2026-01-01", endDay: "2026-02-28" },
      { startDay: "2026-06-01", endDay: "2026-07-05" },
    ];
    expect(closureDayCount(tooMany.closures)).toBe(94);
    expect(parseOperatingDraft(tooMany)).toMatchObject({ field: "closures" });
  });

  it("accepts closing at midnight as the end of the day", () => {
    const draft = operatingDraft(LAUNCH_OPERATING_HOURS);
    draft.days[0] = { open: true, opens: "18:00", closes: "00:00" };
    const parsed = parseOperatingDraft(draft);
    expect("value" in parsed && parsed.value.schedule.week.find((w) => w.weekday === 0))
      .toEqual({ weekday: 0, opensMinute: 1080, closesMinute: 1440 });
  });

  it("reads the same-day promise margin as hours and minutes and sends whole minutes", () => {
    const draft = operatingDraft({
      ...LAUNCH_OPERATING_HOURS,
      sameDayPromiseAllowanceMinutes: 90,
    });
    expect(draft.margin).toEqual({ hours: "1", minutes: "30" });

    draft.margin = { hours: "0", minutes: "45" };
    expect(parseOperatingDraft(draft)).toMatchObject({
      value: { sameDayPromiseAllowanceMinutes: 45 },
    });
    draft.margin = { hours: "10", minutes: "" };
    expect(parseOperatingDraft(draft)).toMatchObject({
      value: { sameDayPromiseAllowanceMinutes: 600 },
    });
    draft.margin = { hours: "0", minutes: "0" };
    expect(parseOperatingDraft(draft)).toMatchObject({
      value: { sameDayPromiseAllowanceMinutes: 0 },
    });

    for (const margin of [
      { hours: "10", minutes: "1" },
      { hours: "", minutes: "" },
      { hours: "1.5", minutes: "0" },
      { hours: "1", minutes: "60" },
      { hours: "-1", minutes: "0" },
    ]) {
      draft.margin = margin;
      expect(parseOperatingDraft(draft)).toMatchObject({ field: "margin" });
    }
  });

  it("leaves the margin out against an API that does not offer it", () => {
    const older = withoutMargin();
    const draft = operatingDraft(older);
    expect(draft.margin).toBeNull();
    const parsed = parseOperatingDraft(draft);
    expect("value" in parsed && "sameDayPromiseAllowanceMinutes" in parsed.value).toBe(false);
  });

  it("counts overlapping closure dates once", () => {
    expect(
      closureDayCount([
        { startDay: "2026-12-24", endDay: "2026-12-26" },
        { startDay: "2026-12-25", endDay: "2026-12-27" },
      ]),
    ).toBe(4);
  });
});

describe("the calendar walk", () => {
  it("matches the contract's worked example", () => {
    // Saturday 16:30:15 Manila, Monday closed: the one-hour review finishes
    // Tuesday 08:30:15.
    const hours = withClosures({ startDay: "2026-10-12", endDay: "2026-10-12" });
    const placed = at("2026-10-10T16:30:15+08:00");
    expect(new Date(addOpeningMs(hours.schedule, placed, 60 * 60_000)!).toISOString()).toBe(
      "2026-10-13T00:30:15.000Z",
    );
    const timing = reviewTimingAt(hours, placed)!;
    expect(timing.isOpenNow).toBe(true);
    expect(timing.reviewDelayed).toBe(true);
  });

  it("moves a closed moment to the next opening", () => {
    const friday9pm = at("2026-10-09T21:00:00+08:00");
    expect(isOpenAt(LAUNCH_OPERATING_HOURS.schedule, friday9pm)).toBe(false);
    const timing = reviewTimingAt(LAUNCH_OPERATING_HOURS, friday9pm)!;
    expect(new Date(timing.scheduledReviewAt).toISOString()).toBe("2026-10-10T00:00:00.000Z");
    expect(new Date(timing.reviewCompletesAt).toISOString()).toBe("2026-10-10T01:00:00.000Z");
    expect(timing.reviewDelayed).toBe(false);
  });

  it("skips Sunday and counts only open time between two instants", () => {
    const saturday4pm = at("2026-10-10T16:00:00+08:00");
    const monday9am = at("2026-10-12T09:00:00+08:00");
    expect(openingMsBetween(LAUNCH_OPERATING_HOURS.schedule, saturday4pm, monday9am)).toBe(
      2 * 60 * 60_000,
    );
  });

  it("treats closing as exclusive", () => {
    expect(isOpenAt(LAUNCH_OPERATING_HOURS.schedule, at("2026-10-09T16:59:59+08:00"))).toBe(
      true,
    );
    expect(isOpenAt(LAUNCH_OPERATING_HOURS.schedule, at("2026-10-09T17:00:00+08:00"))).toBe(
      false,
    );
  });
});

describe("words", () => {
  it("summarises runs of days with the same hours", () => {
    expect(weekSummary(LAUNCH_OPERATING_HOURS.schedule.week)).toEqual([
      "Mon to Sat: 8:00 AM to 5:00 PM",
    ]);
    const saturdayHalf = [
      ...LAUNCH_OPERATING_HOURS.schedule.week.filter((w) => w.weekday !== 6),
      { weekday: 6, opensMinute: 480, closesMinute: 720 },
    ];
    expect(weekSummary(saturdayHalf)).toEqual([
      "Mon to Fri: 8:00 AM to 5:00 PM",
      "Sat: 8:00 AM to noon",
    ]);
  });

  it("says when GRIDGO is open until, or when it opens", () => {
    const now = at("2026-10-09T10:00:00+08:00");
    expect(
      operatingStatusLine(
        LAUNCH_OPERATING_HOURS,
        { isOpenNow: true, scheduledReviewAt: new Date(now).toISOString() },
        now,
      ),
    ).toMatch(/^Open now, until 5:00\sPM$/);
    const night = at("2026-10-09T21:00:00+08:00");
    expect(
      operatingStatusLine(
        LAUNCH_OPERATING_HOURS,
        { isOpenNow: false, scheduledReviewAt: "2026-10-10T00:00:00.000Z" },
        night,
      ),
    ).toMatch(/^Closed\. Opens tomorrow, 8:00\sAM$/);
  });

  it("names every change for the audit log", () => {
    const next: OperatingHours = {
      ...LAUNCH_OPERATING_HOURS,
      schedule: {
        ...LAUNCH_OPERATING_HOURS.schedule,
        week: LAUNCH_OPERATING_HOURS.schedule.week.filter((w) => w.weekday !== 6),
        closures: [{ startDay: "2026-12-25", endDay: "2026-12-26" }],
      },
      artworkReviewMinutes: 90,
    };
    const changes = operatingHoursChanges(LAUNCH_OPERATING_HOURS, next);
    expect(changes[0]).toBe("Saturday closed");
    expect(changes[1]).toBe("review time 1 hour to 1 hour 30 minutes");
    expect(changes[2]).toMatch(/^closed .*(25 Dec|Dec 25) to .*(26 Dec|Dec 26),? 2026$/);
    expect(operatingHoursReason(LAUNCH_OPERATING_HOURS, next, " Christmas ")).toMatch(
      /^Operating hours: Saturday closed; .*\. Christmas$/,
    );
    expect(operatingHoursReason(LAUNCH_OPERATING_HOURS, LAUNCH_OPERATING_HOURS, "")).toBe(
      "Operating hours: saved unchanged",
    );
  });

  it("names a margin change, reading a row without one as the two-hour default", () => {
    const next = { ...LAUNCH_OPERATING_HOURS, sameDayPromiseAllowanceMinutes: 45 };
    expect(operatingHoursChanges(LAUNCH_OPERATING_HOURS, next)).toEqual([
      "same-day promise margin 2 hours to 45 minutes",
    ]);
    const older = withoutMargin();
    expect(operatingHoursChanges(older, next)).toEqual([
      "same-day promise margin 2 hours to 45 minutes",
    ]);
    expect(operatingHoursChanges(older, LAUNCH_OPERATING_HOURS)).toEqual([]);
    expect(operatingHoursChanges(next, older)).toEqual([]);
  });

  it("formats in Philippine time whatever the reader's zone", () => {
    expect(manilaWhen("2026-10-12T00:00:00.000Z")).toMatch(/Monday.*(12 Oct|Oct 12).*8:00\sAM/);
    expect(closureLabel({ startDay: "2026-12-25", endDay: "2026-12-25" })).toMatch(
      /Fri.*(25 Dec|Dec 25).*2026/,
    );
    expect(durationWords(540)).toBe("9 hours");
    expect(durationWords(45)).toBe("45 minutes");
  });
});
