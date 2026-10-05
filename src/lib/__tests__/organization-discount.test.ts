import { describe, expect, it } from "vitest";

import {
  asDeduction,
  discountLabel,
  discountRuleProblem,
  organizationDiscountOf,
  organizationExample,
  orderFeeSplit,
} from "@/lib/organization-discount";

describe("orderFeeSplit", () => {
  it("is null on an order with no organization discount", () => {
    expect(orderFeeSplit({ serviceFeeMinor: 10000, serviceFeeRateBps: 1000 })).toBeNull();
    expect(
      orderFeeSplit({ serviceFeeMinor: 10000, organizationDiscountMinor: 0 }),
    ).toBeNull();
  });

  it("splits the fee into the gross fee, the discount and what GRIDGO keeps", () => {
    expect(
      orderFeeSplit({
        serviceFeeRateBps: 1000,
        grossServiceFeeMinor: 10000,
        organizationDiscountRateBps: 500,
        organizationDiscountMinor: 5000,
        serviceFeeMinor: 5000,
      }),
    ).toEqual({
      grossMinor: 10000,
      discountMinor: 5000,
      netMinor: 5000,
      feeRateBps: 1000,
      discountRateBps: 500,
    });
  });

  it("falls back to the order's platform revenue", () => {
    const split = orderFeeSplit({
      platformRevenue: {
        grossServiceFeeMinor: 4000,
        organizationDiscountMinor: 2000,
        netServiceFeeMinor: 2000,
      },
    });
    expect(split).toMatchObject({
      grossMinor: 4000,
      discountMinor: 2000,
      netMinor: 2000,
    });
  });

  it("derives the gross fee from the net fee when only the discount came", () => {
    expect(
      orderFeeSplit({ serviceFeeMinor: 500, organizationDiscountMinor: 500 }),
    ).toMatchObject({ grossMinor: 1000, netMinor: 500 });
  });

  it("reads a missing discount as none", () => {
    expect(organizationDiscountOf({})).toBe(0);
  });
});

describe("the fee covers the discount", () => {
  it("allows a discount up to the fee, both ways", () => {
    expect(discountRuleProblem(1000, 500)).toBeNull();
    expect(discountRuleProblem(500, 500)).toBeNull();
  });

  it("refuses a discount larger than the fee, naming both ways out", () => {
    expect(discountRuleProblem(400, 500)).toBe(
      "The organization discount comes out of the service fee, so it cannot be more than the fee. Set the discount to 4% or less, or raise the service fee to at least 5%.",
    );
  });
});

describe("organizationExample", () => {
  it("matches the contract's worked example: ₱100 printing at 10% and 5%", () => {
    expect(
      organizationExample(1000, 500, { shopPriceMinor: 10000, deliveryFeeMinor: 0 }),
    ).toEqual({
      shopPriceMinor: 10000,
      grossFeeMinor: 1000,
      discountMinor: 500,
      netFeeMinor: 500,
      deliveryFeeMinor: 0,
      printingMinor: 11000,
      totalMinor: 10500,
    });
  });

  it("adds delivery unchanged and rounds half-up like the API", () => {
    const example = organizationExample(1000, 500, {
      shopPriceMinor: 333,
      deliveryFeeMinor: 5000,
    });
    expect(example.grossFeeMinor).toBe(33);
    expect(example.discountMinor).toBe(17);
    expect(example.totalMinor).toBe(333 + 33 - 17 + 5000);
  });
});

describe("labels", () => {
  it("prints a discount as a deduction with its rate when known", () => {
    expect(discountLabel(500)).toBe("Organization discount (5%)");
    expect(discountLabel(null)).toBe("Organization discount");
    expect(asDeduction("₱5.00")).toBe("−₱5.00");
  });
});
