import { describe, expect, it } from "vitest";

import {
  billablePayload,
  billableProblem,
  fromMilli,
  sizeText,
  toMilli,
} from "@/lib/listing-measure";

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

  it("reads a size as typed, so a shop can type a decimal point", () => {
    expect(toMilli("2.")).toBe(2000);
    expect(toMilli("2.5")).toBe(2500);
    expect(toMilli(" ")).toBeNull();
    expect(sizeText(2500)).toBe("2.5");
    expect(sizeText(null)).toBe("");
    expect(
      billablePayload({
        pricingUnit: "per_length",
        measureUnit: "m",
        minimumWidth: "",
        minimumHeight: "",
        minimumLength: "0.75",
      }).minimumLengthMilli,
    ).toBe(750);
  });

  it("refuses a size it cannot read instead of dropping it", () => {
    const draft = {
      pricingUnit: "per_area" as const,
      measureUnit: "ft" as const,
      minimumWidth: "two",
      minimumHeight: "3",
      minimumLength: "",
    };
    expect(billableProblem(draft)).toMatch(/number above zero/);
    expect(billableProblem({ ...draft, minimumWidth: "0" })).toMatch(/number above zero/);
    expect(billableProblem({ ...draft, minimumWidth: "2" })).toBeNull();
    expect(billableProblem({ ...draft, minimumWidth: "", minimumHeight: "" })).toBeNull();
  });
});
