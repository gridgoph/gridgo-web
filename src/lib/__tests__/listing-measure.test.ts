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

  it("stores only a whole thousandth from 1 up, as GRIDGO requires", () => {
    // Rounds to 0: not a size, never sent as 0.
    expect(toMilli("0.0001")).toBeNull();
    expect(toMilli(0.0004)).toBeNull();
    expect(toMilli("0.0005")).toBe(1);
    expect(toMilli("0.001")).toBe(1);
    expect(toMilli("2.0004")).toBe(2000);
    // Past a safe integer, or past a finite number at all.
    expect(toMilli("1e300")).toBeNull();
    expect(toMilli(Number.MAX_SAFE_INTEGER)).toBeNull();
    expect(toMilli("1e999")).toBeNull();
    expect(toMilli("")).toBeNull();

    const draft = {
      pricingUnit: "per_area" as const,
      measureUnit: "ft" as const,
      minimumWidth: "0.0001",
      minimumHeight: "3",
      minimumLength: "",
    };
    expect(billableProblem(draft)).toMatch(/from 0\.001 up/);
    expect(billableProblem({ ...draft, minimumWidth: "1e300" })).toMatch(/too large/);
    expect(billableProblem({ ...draft, minimumWidth: "2.25" })).toBeNull();
    expect(billablePayload({ ...draft, minimumWidth: "0.0001" }).minimumWidthMilli).toBeNull();
  });
});
