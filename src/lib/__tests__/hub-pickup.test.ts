import { describe, expect, it } from "vitest";

import {
  clockLabel,
  hubChangeReason,
  hubDraft,
  minutesToTime,
  parseHubDraft,
  scheduleLines,
  timeToMinutes,
} from "@/lib/hub-pickup";

const week = [
  { weekday: 1, opensMinute: 540, closesMinute: 1020 },
  { weekday: 3, opensMinute: 540, closesMinute: 1020 },
  { weekday: 5, opensMinute: 540, closesMinute: 1020 },
];

describe("times", () => {
  it("round-trips minutes and reads a closing midnight as the end of the day", () => {
    expect(minutesToTime(540)).toBe("09:00");
    expect(timeToMinutes("09:00")).toBe(540);
    expect(minutesToTime(1440)).toBe("00:00");
    expect(timeToMinutes("00:00", true)).toBe(1440);
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("25:00")).toBeNull();
    expect(clockLabel(540)).toBe("9:00 AM");
    expect(clockLabel(1020)).toBe("5:00 PM");
    expect(clockLabel(1440)).toBe("midnight");
  });
});

describe("hub draft", () => {
  it("keeps unset hours unset and the default fee at zero", () => {
    const draft = hubDraft({ schedule: null, feeMinor: 0 });
    expect(draft.configured).toBe(false);
    expect(draft.fee).toBe("0.00");
    expect(parseHubDraft(draft)).toEqual({ value: { schedule: null, feeMinor: 0 } });
  });

  it("sends the complete schedule back in the API's shape", () => {
    const draft = hubDraft({
      schedule: { utcOffsetMinutes: 480, week, closures: [{ startDay: "2026-12-25", endDay: "2026-12-26" }] },
      feeMinor: 5000,
    });
    expect(parseHubDraft(draft)).toEqual({
      value: {
        feeMinor: 5000,
        schedule: {
          utcOffsetMinutes: 480,
          week,
          closures: [{ startDay: "2026-12-25", endDay: "2026-12-26" }],
        },
      },
    });
  });

  it("explains the API's refusals before saving", () => {
    const draft = hubDraft({ schedule: { utcOffsetMinutes: 480, week, closures: [] }, feeMinor: 0 });
    expect(parseHubDraft({ ...draft, fee: "-1" })).toMatchObject({ field: "fee" });
    expect(
      parseHubDraft({ ...draft, days: { ...draft.days, 1: [{ opens: "17:00", closes: "09:00" }] } }),
    ).toMatchObject({ problem: "Monday: closing time must be after opening time." });
    expect(
      parseHubDraft({
        ...draft,
        days: {
          ...draft.days,
          1: [
            { opens: "09:00", closes: "12:00" },
            { opens: "11:00", closes: "15:00" },
          ],
        },
      }),
    ).toMatchObject({ problem: "Monday: two opening hours overlap." });
    expect(
      parseHubDraft({ ...draft, days: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] } }),
    ).toMatchObject({ field: "week" });
    expect(
      parseHubDraft({ ...draft, closures: [{ startDay: "2026-12-26", endDay: "2026-12-25" }] }),
    ).toMatchObject({ problem: "A closure cannot end before it starts." });
  });
});

describe("reading the schedule", () => {
  it("runs days with the same hours together", () => {
    expect(scheduleLines({ utcOffsetMinutes: 480, week })).toEqual([
      "Mon, Wed, Fri: 9:00 AM to 5:00 PM",
    ]);
    expect(scheduleLines(null)).toEqual([]);
  });

  it("names what moved in the audited reason", () => {
    expect(
      hubChangeReason(
        { schedule: null, feeMinor: 0 },
        { schedule: { utcOffsetMinutes: 480, week }, feeMinor: 2000 },
      ),
    ).toBe("Hub pick-up: fee ₱0.00 to ₱20.00; opening hours updated");
  });
});
