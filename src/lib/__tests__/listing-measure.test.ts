import { describe, expect, it } from "vitest";

import { billablePayload, billableProblem, fromMilli, toMilli } from "@/lib/listing-measure";

describe("listing measure", () => {
  it("stores a size as thousandths and drops it when the unit is not measured", () => {
    expect(toMilli(1.5)).toBe(1500);
    expect(fromMilli(1500)).toBe(1.5);
    expect(
      billablePayload({
        pricingUnit: "per_unit",
        measureUnit: "ft",
        minimumWidth: 2,
        minimumHeight: 3,
        minimumLength: 4,
      }),
    ).toEqual({
      measureUnit: null,
      minimumWidthMilli: null,
      minimumHeightMilli: null,
      minimumLengthMilli: null,
    });
  });

  it("sends both sides of an area and only length for a length listing", () => {
    expect(
      billablePayload({
        pricingUnit: "per_area",
        measureUnit: "ft",
        minimumWidth: 2,
        minimumHeight: 3,
        minimumLength: 4,
      }),
    ).toMatchObject({ measureUnit: "ft", minimumWidthMilli: 2000, minimumHeightMilli: 3000, minimumLengthMilli: null });
    expect(
      billablePayload({
        pricingUnit: "per_length",
        measureUnit: null,
        minimumWidth: 2,
        minimumHeight: 3,
        minimumLength: 4,
      }).minimumLengthMilli,
    ).toBe(4000);
    expect(
      billableProblem({
        pricingUnit: "per_area",
        measureUnit: "cm",
        minimumWidth: 1,
        minimumHeight: null,
        minimumLength: null,
      }),
    ).toMatch(/width and a height/);
  });
});
