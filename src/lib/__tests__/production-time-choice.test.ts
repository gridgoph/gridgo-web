import { describe, expect, it } from "vitest";

import {
  choiceFromTimes,
  choiceLine,
  choiceProblem,
  expectedVersionsOf,
  normalizePreview,
  PRODUCTION_TIME_REFUSED,
  presentPreviewDay,
  productionTimeSaveError,
  previewErrorMessage,
  previewParams,
  readProductionTimeChoice,
  readProductionTimeReview,
  sameDayHourSteps,
  wholeMinutesOf,
  withDays,
} from "@/lib/production-time-choice";
import { ApiError } from "@/lib/api/client";
import { sameDay, workingDays } from "@/lib/production-time";

describe("production time choice (gridgo-api#292 release 2)", () => {
  it("reads the API's answer, and tells an older API apart from a listing with no time", () => {
    expect(readProductionTimeChoice({ productionTime: { mode: "same_day", hours: 1.5 } })).toEqual({
      mode: "same_day",
      hours: 1.5,
    });
    expect(
      readProductionTimeChoice({ productionTime: { mode: "days", minDays: 1, maxDays: 3 } }),
    ).toEqual({ mode: "days", minDays: 1, maxDays: 3 });
    expect(readProductionTimeChoice({ productionTime: null })).toBeNull();
    expect(readProductionTimeChoice({})).toBeUndefined();
    expect(
      readProductionTimeChoice({ productionTime: { mode: "days", minDays: 3, maxDays: 1 } }),
    ).toBeNull();
  });

  it("reads the reminder and only the reasons the contract names", () => {
    expect(
      readProductionTimeReview({
        productionTimeReview: {
          required: true,
          reasons: ["legacy_one_working_day", "made_up"],
          message: "Check your production time",
        },
      }),
    ).toEqual({ required: true, reasons: ["legacy_one_working_day"] });
    expect(readProductionTimeReview({})).toBeNull();
  });

  it("reads an older listing's duration pair as the same answer", () => {
    expect(choiceFromTimes(workingDays(2), workingDays(4))).toEqual({
      mode: "days",
      minDays: 2,
      maxDays: 4,
    });
    expect(choiceFromTimes(null, sameDay(90))).toEqual({ mode: "same_day", hours: 1.5 });
    expect(choiceFromTimes(null, null)).toBeNull();
  });

  it("keeps From at or under To from either end", () => {
    expect(withDays({ minDays: 1, maxDays: 3 }, "min", 5)).toEqual({
      mode: "days",
      minDays: 5,
      maxDays: 5,
    });
    expect(withDays({ minDays: 4, maxDays: 6 }, "max", 2)).toEqual({
      mode: "days",
      minDays: 2,
      maxDays: 2,
    });
    expect(withDays({ minDays: 1, maxDays: 30 }, "max", 31).maxDays).toBe(30);
  });

  it("offers half hours inside one working day, and keeps an odd time it holds", () => {
    const steps = sameDayHourSteps(600);
    expect(steps[0]).toBe(0.5);
    expect(steps.at(-1)).toBe(9.5);
    expect(sameDayHourSteps(600, 1.25)).toContain(1.25);
  });

  it("refuses what the API would refuse, in the shop app's words", () => {
    // Exact hours of a working day or more are valid (gridgo-api#299).
    expect(choiceProblem({ mode: "same_day", hours: 12 })).toBeNull();
    expect(choiceProblem({ mode: "same_day", hours: 0 })).toBe("Choose how many hours this takes.");
    expect(choiceProblem({ mode: "same_day", hours: 1 / 7 })).toBe(
      "Choose how many hours this takes.",
    );
    expect(choiceProblem({ mode: "days", minDays: 3, maxDays: 2 })).toBe(
      "The soonest can't be later than the latest.",
    );
    expect(choiceProblem({ mode: "days", minDays: 0, maxDays: 2 })).toBe(
      "Production time is at least 1 working day.",
    );
    expect(choiceProblem({ mode: "days", minDays: 1, maxDays: 2 })).toBeNull();
  });

  it("reads hours as the API's whole minutes, round trip included", () => {
    // 31 minutes come back as 31 / 60 hours, which multiplies out to 31.000000000000004.
    expect(wholeMinutesOf(31 / 60)).toBe(31);
    expect(choiceProblem({ mode: "same_day", hours: 31 / 60 })).toBeNull();
    // Longer than a working day, with a leftover minute.
    expect(wholeMinutesOf(751 / 60)).toBe(751);
    expect(choiceProblem({ mode: "same_day", hours: 751 / 60 })).toBeNull();
    // Not a whole minute, or not a duration at all.
    expect(wholeMinutesOf(1 / 7)).toBeNull();
    expect(wholeMinutesOf(0.501)).toBeNull();
    expect(wholeMinutesOf(0)).toBeNull();
    expect(wholeMinutesOf(-0.5)).toBeNull();
    expect(wholeMinutesOf(Number.NaN)).toBeNull();
    expect(wholeMinutesOf(2_147_483_648 / 60)).toBeNull();
  });

  it("builds the preview query the contract takes", () => {
    expect(previewParams({ mode: "same_day", hours: 2 }).toString()).toBe(
      "mode=same_day&hours=2&days=14",
    );
    expect(previewParams({ mode: "days", minDays: 1, maxDays: 3 }, 7).toString()).toBe(
      "mode=days&minDays=1&maxDays=3&days=7",
    );
  });

  it("says each date the way a client is offered it, at the shop's own tier price", () => {
    const preview = normalizePreview({
      scheduling: { earliestReadyBy: "2026-10-23T03:00:00.000Z", securedReadyBy: null },
      calendar: {
        days: [
          { day: "2026-10-25", status: "not_possible", reason: "gridgo_closed_sunday", readyBy: null },
          {
            day: "2026-10-23",
            status: "rush",
            readyBy: "2026-10-23T03:00:00.000Z",
            rushTier: { label: "Next day", clientPriceMinor: 60000, priceMinor: 50000 },
          },
          { day: "2026-10-30", status: "made_up" },
        ],
      },
    });
    expect(preview.days).toHaveLength(2);
    expect(presentPreviewDay(preview.days[0])).toMatchObject({
      label: "Not offered",
      detail: "GRIDGO is closed on Sundays",
    });
    expect(presentPreviewDay(preview.days[1])).toMatchObject({
      label: "Rush, costs more",
      detail: "Your Next day option at ₱500.00. Ready by Fri 23 Oct, 11:00 AM",
    });
  });

  it("names every listing's version for Use for all my listings", () => {
    expect(
      expectedVersionsOf([
        { id: "a", version: 4 },
        { id: "b", version: 2 },
      ]),
    ).toEqual({ a: 4, b: 2 });
    expect(expectedVersionsOf([{ id: "a", version: null }])).toBeNull();
  });

  it("reads both answers as one line", () => {
    expect(choiceLine({ mode: "same_day", hours: 2 })).toBe("Same day, ready in 2 hours");
    expect(choiceLine({ mode: "days", minDays: 1, maxDays: 3 })).toBe("1 to 3 working days");
    expect(choiceLine({ mode: "days", minDays: 2, maxDays: 2 })).toBe("2 working days");
    expect(choiceLine(null)).toBe("Not set yet");
  });

  it("says why the dates preview failed in the shop app's words", () => {
    const refused = (code: string) => previewErrorMessage(new ApiError(409, { error: code }));
    expect(refused("catalog_item_not_found")).toBe(
      "This listing is no longer on your board, so there are no dates to show.",
    );
    expect(refused("production_day_length_unavailable")).toBe(
      "The dates cannot be worked out until every open day has the same hours. Pick one opening and closing time for all your open days.",
    );
    expect(refused("shop_never_open")).toBe(
      "GRIDGO could not fit this work into your open hours in the coming weeks. Check your open days and hours.",
    );
    expect(refused("invalid_schedule")).toBe(
      "GRIDGO could not read your shop hours. Set your open days and hours again, then try again.",
    );
    expect(refused("invalid_production_time")).toBe(
      "GRIDGO could not show dates for this time. Change it, then try again.",
    );
    expect(previewErrorMessage(new TypeError("Failed to fetch"))).toBe(
      "Cannot reach GRIDGO to show the dates clients will see. Check your connection, then try again.",
    );
    expect(refused("server_error")).toBe("The dates could not be loaded. Try again.");
  });

  it("reads both API refusals of a production time the same way", () => {
    const fresh = new ApiError(400, { error: "invalid_production_time" });
    const older = new ApiError(400, { error: "invalid_catalog_item" });
    const otherField = new ApiError(400, { error: "invalid_catalog_item", field: "name" });
    expect(productionTimeSaveError(fresh, true)).toBe(PRODUCTION_TIME_REFUSED);
    expect(productionTimeSaveError(older, true)).toBe(PRODUCTION_TIME_REFUSED);
    expect(productionTimeSaveError(otherField, true)).toBeNull();
    expect(productionTimeSaveError(older, false)).toBeNull();
    expect(productionTimeSaveError(new ApiError(409, { error: "catalog_item_stale" }), true)).toBeNull();
  });
});
