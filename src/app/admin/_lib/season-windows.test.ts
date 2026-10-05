import { describe, expect, it } from "vitest";

import {
  EMPTY_DRAFT,
  addDays,
  bannerHeadline,
  bannerIntervalFor,
  bannerTiming,
  changedFields,
  daysBetween,
  groupSeasons,
  inputFromDraft,
  isDayKey,
  noticeLine,
  seasonErrorMessage,
  seasonErrorNeedsReload,
  seasonFieldError,
  seasonLength,
  seasonRange,
  validateSeasonDraft,
  type SeasonDraft,
} from "@/app/admin/_lib/season-windows";
import { ApiError } from "@/lib/api/client";
import type { SeasonWindow } from "@/lib/api/types";

function season(overrides: Partial<SeasonWindow> = {}): SeasonWindow {
  return {
    id: "sea_a",
    name: "School season",
    startDate: "2026-11-13",
    endDate: "2026-11-30",
    demandLevel: "Peak",
    message: "Plan your printing early.",
    status: "upcoming",
    banner: { startDate: "2026-10-02", endDate: "2026-10-16", active: true },
    version: 1,
    noticeQueuedAt: null,
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
    ...overrides,
  };
}

const valid: SeasonDraft = {
  name: "  Graduation season ",
  startDate: "2027-03-22",
  endDate: "2027-04-10",
  demandLevel: "Peak",
  message: " Order early. ",
};

describe("calendar days", () => {
  it("accepts only real dates", () => {
    expect(isDayKey("2026-02-28")).toBe(true);
    expect(isDayKey("2028-02-29")).toBe(true);
    expect(isDayKey("2026-02-29")).toBe(false);
    expect(isDayKey("2026-13-01")).toBe(false);
    expect(isDayKey("2026-1-1")).toBe(false);
    expect(isDayKey("")).toBe(false);
  });

  it("shifts and counts across month and year ends", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(seasonLength("2026-11-13", "2026-11-30")).toBe(18);
    expect(seasonLength("2026-11-13", "2026-11-13")).toBe(1);
  });

  it("computes the banner the API computes: 42 through 28 days before start", () => {
    // The contract's own example.
    expect(bannerIntervalFor("2026-11-13")).toEqual({
      startDate: "2026-10-02",
      endDate: "2026-10-16",
    });
    expect(bannerIntervalFor("2027-01-05")).toEqual({
      startDate: "2026-11-24",
      endDate: "2026-12-08",
    });
  });

  it("words ranges without repeating what both ends share", () => {
    expect(seasonRange("2026-11-13", "2026-11-30")).toBe("13–30 Nov 2026");
    expect(seasonRange("2027-03-28", "2027-04-05")).toBe("28 Mar – 5 Apr 2027");
    expect(seasonRange("2026-12-30", "2027-01-03")).toBe("30 Dec 2026 – 3 Jan 2027");
    expect(seasonRange("2026-11-13", "2026-11-13")).toBe("13 Nov 2026");
  });

  it("words the client headline the way the client app does", () => {
    expect(bannerHeadline("School season", "2026-11-13", "2026-10-02")).toBe(
      "School season starts in 6 weeks",
    );
    expect(bannerHeadline("School season", "2026-11-13", "2026-10-03")).toBe(
      "School season starts in 41 days",
    );
    expect(bannerHeadline("School season", "2026-11-13", "2026-11-12")).toBe(
      "School season starts tomorrow",
    );
    expect(bannerHeadline("School season", "2026-11-13", "2026-11-13")).toBe(
      "School season has started",
    );
  });
});

describe("bannerTiming", () => {
  const interval = { startDate: "2026-10-02", endDate: "2026-10-16" };

  it("says when the banner will start, counted from today", () => {
    const t = bannerTiming(interval, "2026-09-20");
    expect(t.phase).toBe("ahead");
    expect(t.headline).toBe("Banner shows 2–16 Oct 2026");
    expect(t.chip).toBe("Banner in 12 days");
    expect(t.detail).toContain("in 12 days");
  });

  it("is showing on both inclusive ends", () => {
    expect(bannerTiming(interval, "2026-10-02").phase).toBe("showing");
    const last = bannerTiming(interval, "2026-10-16");
    expect(last.phase).toBe("showing");
    expect(last.detail).toBe("Today is its last day on the client home screen.");
  });

  it("warns that a new season too close to its start gets no banner", () => {
    const t = bannerTiming(interval, "2026-10-17", { isNew: true });
    expect(t.phase).toBe("missed");
    expect(t.tone).toBe("warning");
    expect(t.detail).toContain("only see this season on their deadline calendar");
    expect(bannerTiming(interval, "2026-10-17").phase).toBe("over");
  });
});

describe("noticeLine", () => {
  const dueDry = {
    id: "sea_a",
    name: "School season",
    banner: { startDate: "2026-10-02", endDate: "2026-10-16", active: true },
    noticeQueuedAt: null,
    due: true,
    wouldNotifyClients: 24,
    wouldNotifyDevices: 30,
  };

  it("holds a due notice while the switch is off, with the prospective reach", () => {
    const line = noticeLine(season(), dueDry, false, "showing");
    expect(line.label).toBe("Notice held");
    expect(line.detail).toContain("24 clients on 30 phones");
  });

  it("says a due notice is going out when the switch is on", () => {
    expect(noticeLine(season(), dueDry, true, "showing").label).toBe("Notice sending");
  });

  it("never offers to send twice", () => {
    const line = noticeLine(
      season({ noticeQueuedAt: "2026-10-02T00:00:30.000Z" }),
      { ...dueDry, due: false },
      true,
      "showing",
    );
    expect(line.label).toBe("Notice sent");
    expect(line.detail).toContain("never sends twice");
  });

  it("explains that nothing is sent after the banner interval", () => {
    expect(noticeLine(season({ status: "past" }), undefined, true, "over").label).toBe(
      "No notice",
    );
  });

  it("is scheduled ahead only when the switch is on", () => {
    expect(noticeLine(season(), undefined, true, "ahead").label).toBe("Notice scheduled");
    expect(noticeLine(season(), undefined, false, "ahead").detail).toContain("Notices are off");
  });
});

describe("validateSeasonDraft", () => {
  it("passes a complete draft and trims what it sends", () => {
    expect(validateSeasonDraft(valid)).toEqual({});
    expect(inputFromDraft(valid)).toEqual({
      name: "Graduation season",
      startDate: "2027-03-22",
      endDate: "2027-04-10",
      demandLevel: "Peak",
      message: "Order early.",
    });
  });

  it("names every missing field on an empty form", () => {
    expect(Object.keys(validateSeasonDraft(EMPTY_DRAFT)).sort()).toEqual([
      "demandLevel",
      "endDate",
      "message",
      "name",
      "startDate",
    ]);
  });

  it("refuses an end before the start, but allows a one-day season", () => {
    expect(validateSeasonDraft({ ...valid, endDate: "2027-03-21" }).endDate).toBe(
      "The last day can't be before the first day.",
    );
    expect(validateSeasonDraft({ ...valid, endDate: valid.startDate })).toEqual({});
  });

  it("treats a whitespace-only message as empty", () => {
    expect(validateSeasonDraft({ ...valid, message: "   " }).message).toContain(
      "can't be empty",
    );
  });

  it("enforces the API's length limits after trimming", () => {
    expect(validateSeasonDraft({ ...valid, name: "x".repeat(121) }).name).toContain("120");
    expect(validateSeasonDraft({ ...valid, name: ` ${"x".repeat(120)} ` })).toEqual({});
    expect(validateSeasonDraft({ ...valid, message: "x".repeat(501) }).message).toContain(
      "500",
    );
  });
});

describe("changedFields", () => {
  it("sends only what changed", () => {
    const w = season();
    expect(
      changedFields(w, {
        name: w.name,
        startDate: w.startDate,
        endDate: "2026-12-02",
        demandLevel: w.demandLevel,
        message: "New words.",
      }),
    ).toEqual({ endDate: "2026-12-02", message: "New words." });
  });
});

describe("groupSeasons", () => {
  it("orders current and upcoming soonest first, past most recent first", () => {
    const groups = groupSeasons([
      season({ id: "b", startDate: "2027-03-01", status: "upcoming" }),
      season({ id: "a", startDate: "2026-12-01", status: "upcoming" }),
      season({ id: "old", startDate: "2025-03-01", status: "past" }),
      season({ id: "older", startDate: "2024-03-01", status: "past" }),
      season({ id: "now", startDate: "2026-10-01", status: "current" }),
    ]);
    expect(groups.current.map((w) => w.id)).toEqual(["now"]);
    expect(groups.upcoming.map((w) => w.id)).toEqual(["a", "b"]);
    expect(groups.past.map((w) => w.id)).toEqual(["old", "older"]);
  });
});

describe("errors", () => {
  it("pins a 400 to the field the server named", () => {
    const err = new ApiError(400, { error: "invalid_season_window", field: "endDate" });
    expect(seasonFieldError(err)?.field).toBe("endDate");
    expect(seasonFieldError(new ApiError(400, { error: "other" }))).toBeNull();
  });

  it("reloads on a stale version or a vanished window", () => {
    const stale = new ApiError(409, { error: "season_window_version_conflict", version: 3 });
    expect(seasonErrorNeedsReload(stale)).toBe(true);
    expect(seasonErrorMessage(stale, "x")).toContain("changed this season");
    expect(seasonErrorNeedsReload(new ApiError(404, { error: "season_window_not_found" }))).toBe(
      true,
    );
    expect(seasonErrorNeedsReload(new ApiError(500, { error: "boom" }))).toBe(false);
  });

  it("asks for a reason when the switch refuses an empty one", () => {
    expect(
      seasonErrorMessage(new ApiError(400, { error: "season_push_reason_required" }), "x"),
    ).toContain("audit log");
  });
});
