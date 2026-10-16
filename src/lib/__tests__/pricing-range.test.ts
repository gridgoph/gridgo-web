import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import { pricingRangeError, pricingRangeProblem } from "@/lib/pricing-range";

const range = { from: "2026-10-01", to: "2026-10-16", compareFrom: "", compareTo: "" };

describe("pricing range", () => {
  it("accepts a month, an open end and up to 366 days", () => {
    expect(pricingRangeProblem(range)).toBeNull();
    expect(pricingRangeProblem({ ...range, to: "" })).toBeNull();
    expect(pricingRangeProblem({ ...range, from: "2025-10-16", to: "2026-10-16" })).toBeNull();
  });

  it("explains a backwards, too long or half comparison before the API refuses it", () => {
    expect(pricingRangeProblem({ ...range, from: "2026-10-17" })).toMatch(/after the end/);
    expect(pricingRangeProblem({ ...range, from: "2025-01-01" })).toMatch(/366 days or fewer/);
    expect(pricingRangeProblem({ ...range, compareFrom: "2026-09-01" })).toMatch(/both a start and an end/);
    expect(
      pricingRangeProblem({ ...range, compareFrom: "2026-09-30", compareTo: "2026-09-01" }),
    ).toMatch(/^Comparison: /);
  });

  it("names the API's range refusals and leaves other errors alone", () => {
    const refused = (code: string) => new ApiError(400, { error: code });
    expect(pricingRangeError(refused("pricing_range_too_long"))).toMatch(/366 days/);
    expect(pricingRangeError(refused("invalid_pricing_range"))).toMatch(/Check the dates/);
    expect(pricingRangeError(refused("forbidden"))).toBeNull();
    expect(pricingRangeError(new Error("x"))).toBeNull();
  });
});
