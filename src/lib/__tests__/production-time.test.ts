import { describe, expect, it } from "vitest";

import {
  listingTimeFields,
  readListingTime,
  readServiceLineTime,
  readyAfter,
  readyExampleLine,
  readyInLine,
  sameDay,
  sameDayMaxMinutes,
  singleTimeProblem,
  stepTime,
  timeFields,
  timeLabel,
  timeLadder,
  windowProblem,
  workingDays,
} from "@/lib/production-time";

/** Manila wall clock → instant. The Philippines is UTC+8 all year. */
function manila(iso: string): Date {
  return new Date(`${iso}+08:00`);
}

describe("reading production time (report 39853344)", () => {
  it("prefers working days, keeping their calendar meaning", () => {
    expect(
      readListingTime({ turnaroundDays: 2, turnaroundMinutes: 1200, turnaroundHours: 20 })
        .max,
    ).toEqual(workingDays(2));
  });

  it("reads exact minutes for a same-day time", () => {
    expect(readListingTime({ turnaroundDays: null, turnaroundMinutes: 75 }).max).toEqual(
      sameDay(75),
    );
  });

  it("reads an older API's hours exactly, never rounded up into a day", () => {
    expect(readListingTime({ turnaroundHours: 1 }).max).toEqual(sameDay(60));
    expect(readListingTime({ turnaroundHours: 48 }).max).toEqual(sameDay(2880));
  });

  it("reads a service line's usual time and its standard alias", () => {
    expect(readServiceLineTime({ turnaroundMinutes: 90 })).toEqual(sameDay(90));
    expect(readServiceLineTime({ standardTurnaroundDays: 3 })).toEqual(workingDays(3));
    expect(readServiceLineTime({})).toBeNull();
  });
});

describe("writing production time", () => {
  it("sends only the chosen unit's field", () => {
    expect(timeFields("turnaround", sameDay(60))).toEqual({ turnaroundMinutes: 60 });
    expect(timeFields("turnaround", workingDays(2))).toEqual({ turnaroundDays: 2 });
  });

  it("clears an optional duration with an explicit null", () => {
    expect(listingTimeFields(null, sameDay(120))).toEqual({
      minimumTurnaroundDays: null,
      turnaroundMinutes: 120,
    });
  });
});

describe("words", () => {
  it("names hours, fractions, minutes and working days", () => {
    expect(timeLabel(sameDay(60))).toBe("1 hour");
    expect(timeLabel(sameDay(90))).toBe("1½ hours");
    expect(timeLabel(sameDay(75))).toBe("1¼ hours");
    expect(timeLabel(sameDay(45))).toBe("45 minutes");
    expect(timeLabel(sameDay(130))).toBe("2 h 10 min");
    expect(timeLabel(workingDays(1))).toBe("1 working day");
    expect(timeLabel(workingDays(3))).toBe("3 working days");
  });

  it("says a range once when both ends share a word", () => {
    expect(readyInLine(sameDay(120), sameDay(60))).toBe("Ready in 1–2 hours");
    expect(readyInLine(workingDays(3), workingDays(2))).toBe("Ready in 2–3 working days");
    expect(readyInLine(workingDays(1), sameDay(240))).toBe(
      "Ready in 4 hours to 1 working day",
    );
    expect(readyInLine(workingDays(2), workingDays(2))).toBe("Ready in 2 working days");
    expect(readyInLine(null)).toBe("Ready-in not set");
  });
});

describe("the picker", () => {
  it("steps in half hours to the end of a working day, then in working days", () => {
    const ladder = timeLadder(600);
    expect(ladder[0]).toEqual(sameDay(30));
    expect(ladder[18]).toEqual(sameDay(570));
    expect(ladder[19]).toEqual(workingDays(1));
    expect(stepTime(workingDays(1), -1, 600)).toEqual(sameDay(570));
    expect(stepTime(sameDay(570), 1, 600)).toEqual(workingDays(1));
  });

  it("keeps a held time off the steps exactly, between its neighbours", () => {
    expect(stepTime(sameDay(75), 1)).toEqual(sameDay(90));
    expect(stepTime(sameDay(75), -1)).toEqual(sameDay(60));
  });

  it("stays put at either end", () => {
    expect(stepTime(sameDay(30), -1)).toEqual(sameDay(30));
    expect(stepTime(workingDays(30), 1)).toEqual(workingDays(30));
  });

  it("follows a shorter shop day", () => {
    expect(sameDayMaxMinutes(480)).toBe(450);
    expect(timeLadder(480).filter((step) => step.unit === "hours")).toHaveLength(15);
  });

  it("refuses an hour time that is a working day or longer", () => {
    expect(singleTimeProblem(sameDay(600), 600)).toMatch(/Use working days/);
    expect(singleTimeProblem(sameDay(599), 600)).toBeNull();
    expect(singleTimeProblem(workingDays(31))).toMatch(/at most 30/);
  });

  it("refuses a soonest later than the latest, across units", () => {
    expect(windowProblem(workingDays(1), sameDay(120))).toBe(
      "The soonest can't be later than the latest.",
    );
    expect(windowProblem(sameDay(60), workingDays(1))).toBeNull();
    expect(windowProblem(null, null)).toBe("Set how long this takes.");
  });
});

describe("the ready-time example", () => {
  it("counts an hour past closing into the next working morning", () => {
    expect(readyAfter(sameDay(60), manila("2026-10-15T17:30:00")).toISOString()).toBe(
      manila("2026-10-16T08:30:00").toISOString(),
    );
  });

  it("skips Sunday", () => {
    // Saturday 5 PM + 2 hours: one hour Saturday, one hour Monday.
    expect(readyAfter(sameDay(120), manila("2026-10-17T17:00:00")).toISOString()).toBe(
      manila("2026-10-19T09:00:00").toISOString(),
    );
  });

  it("names the hour for same-day work and the day for working days", () => {
    const now = manila("2026-10-15T10:00:00");
    expect(readyExampleLine(sameDay(60), sameDay(120), now)).toBe(
      "A job that starts now is ready between 11:00 AM and 12:00 PM on Thu 15 Oct.",
    );
    expect(readyExampleLine(workingDays(2), workingDays(2), now)).toBe(
      "A job that starts now is ready by Sat 17 Oct.",
    );
  });
});
