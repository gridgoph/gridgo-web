import { describe, expect, it } from "vitest";

import { clampQuantity, describeQuantity, quantityBounds } from "@/lib/quantity";

describe("describeQuantity", () => {
  it("says what a number actually buys", () => {
    expect(describeQuantity(4, "pack100")).toBe("4 packs of 100");
    expect(describeQuantity(1, "pack100")).toBe("1 pack of 100");
    expect(describeQuantity(3, "sqm")).toBe("3 sqm");
  });

  it("does not print undefined when quantity has not been projected yet", () => {
    expect(describeQuantity(undefined, "piece")).toBe("—");
    expect(describeQuantity(Number.NaN, "piece")).toBe("—");
    expect(describeQuantity(null, "piece")).toBe("—");
  });
});

describe("clampQuantity", () => {
  it("recovers from a non-numeric value", () => {
    expect(clampQuantity(Number.NaN, "piece")).toBe(1);
  });
});

describe("quantityBounds", () => {
  it("falls back rather than leaving an unknown unit unbounded", () => {
    const bounds = quantityBounds("furlong");
    expect(bounds.min).toBe(1);
    expect(Number.isFinite(bounds.max)).toBe(true);
  });
});
