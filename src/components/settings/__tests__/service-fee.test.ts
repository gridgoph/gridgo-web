import { describe, expect, it } from "vitest";

import {
  applyRateBps,
  bpsToPercentInput,
  formatRatePercent,
  percentInputToBps,
  workedExample,
} from "@/components/settings/service-fee";

describe("percentInputToBps", () => {
  it("reads whole and fractional percentages as basis points", () => {
    expect(percentInputToBps("10")).toBe(1000);
    expect(percentInputToBps("12.5")).toBe(1250);
    expect(percentInputToBps("12.75")).toBe(1275);
    expect(percentInputToBps(" 0 ")).toBe(0);
    expect(percentInputToBps("100")).toBe(10_000);
    expect(percentInputToBps("7.5%")).toBe(750);
  });

  it("refuses what the API would refuse", () => {
    expect(percentInputToBps("")).toBeNull();
    expect(percentInputToBps("-1")).toBeNull();
    expect(percentInputToBps("100.01")).toBeNull();
    expect(percentInputToBps("12.345")).toBeNull();
    expect(percentInputToBps("ten")).toBeNull();
    expect(percentInputToBps("1,000")).toBeNull();
  });
});

describe("bpsToPercentInput", () => {
  it("round-trips without trailing zeros", () => {
    expect(bpsToPercentInput(1000)).toBe("10");
    expect(bpsToPercentInput(1250)).toBe("12.5");
    expect(bpsToPercentInput(1275)).toBe("12.75");
    expect(bpsToPercentInput(0)).toBe("0");
    expect(formatRatePercent(1250)).toBe("12.5%");
    for (const bps of [0, 1, 99, 1000, 1250, 1275, 9999, 10_000]) {
      expect(percentInputToBps(bpsToPercentInput(bps))).toBe(bps);
    }
  });
});

describe("workedExample", () => {
  it("rounds half-up the way the API bills", () => {
    // 0.125% of PHP 1,000.00 is PHP 1.25 exactly; 12.5 bps on 100,001 minor rounds up.
    expect(applyRateBps(100_000, 125)).toBe(1250);
    expect(applyRateBps(100_001, 125)).toBe(1250);
    expect(applyRateBps(100_040, 125)).toBe(1251);
  });

  it("shows the same total on both receipts and a fee only on one", () => {
    const example = workedExample(1000);
    expect(example).toEqual({
      shopPriceMinor: 100_000,
      serviceFeeMinor: 10_000,
      deliveryFeeMinor: 5_000,
      clientTotalMinor: 115_000,
      clientItemsMinor: 110_000,
    });
    expect(example.clientItemsMinor + example.deliveryFeeMinor).toBe(example.clientTotalMinor);
    expect(
      example.shopPriceMinor + example.serviceFeeMinor + example.deliveryFeeMinor,
    ).toBe(example.clientTotalMinor);
  });

  it("collapses to the shop price at 0%", () => {
    const example = workedExample(0);
    expect(example.serviceFeeMinor).toBe(0);
    expect(example.clientItemsMinor).toBe(example.shopPriceMinor);
  });
});
