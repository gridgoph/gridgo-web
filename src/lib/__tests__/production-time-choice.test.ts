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
  previewParams,
  readProductionTimeChoice,
  readProductionTimeReview,
  sameDayHourSteps,
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
