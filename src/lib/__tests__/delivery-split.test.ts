import { describe, expect, it } from "vitest";

import {
  orderDeliverySplit,
  platformShareBps,
  riderShareSummary,
  splitDeliveryFee,
} from "@/lib/delivery-split";

describe("splitDeliveryFee", () => {
  it("gives the rider their share half-up and GRIDGO the exact remainder", () => {
    expect(splitDeliveryFee(2500, 8500)).toEqual({
      deliveryFeeMinor: 2500,
      riderCommissionBps: 8500,
      riderPayoutMinor: 2125,
      platformDeliveryShareMinor: 375,
    });
    // The API's own rounding vector: ₱0.10 at 85% is 9 centavos and 1.
    expect(splitDeliveryFee(10, 8500)).toMatchObject({
      riderPayoutMinor: 9,
      platformDeliveryShareMinor: 1,
    });
  });

  it("covers both ends of the range and a zero fee", () => {
    expect(splitDeliveryFee(2500, 10_000).platformDeliveryShareMinor).toBe(0);
    expect(splitDeliveryFee(2500, 0).riderPayoutMinor).toBe(0);
    expect(splitDeliveryFee(0, 8500)).toMatchObject({
      riderPayoutMinor: 0,
      platformDeliveryShareMinor: 0,
    });
  });
});

describe("riderShareSummary", () => {
  it("names both sides of the split", () => {
    expect(riderShareSummary(8500)).toBe("Rider keeps 85% · GRIDGO keeps 15%");
    expect(riderShareSummary(8750)).toBe("Rider keeps 87.5% · GRIDGO keeps 12.5%");
    expect(platformShareBps(10_000)).toBe(0);
  });
});

describe("orderDeliverySplit", () => {
  it("trusts the API's own amounts", () => {
    expect(
      orderDeliverySplit({
        deliveryFeeMinor: 5000,
        riderCommissionBps: 8500,
        riderPayoutMinor: 4250,
        platformDeliveryShareMinor: 750,
      }),
    ).toEqual({
      deliveryFeeMinor: 5000,
      riderCommissionBps: 8500,
      riderPayoutMinor: 4250,
      platformDeliveryShareMinor: 750,
    });
  });

  it("splits a snapshot rate that arrived without amounts", () => {
    expect(
      orderDeliverySplit({ deliveryFeeMinor: 2500, riderCommissionBps: 8000 }),
    ).toMatchObject({
      riderPayoutMinor: 2000,
      platformDeliveryShareMinor: 500,
    });
  });

  it("returns nothing from an API that predates the split, so the gross fee stands alone", () => {
    expect(orderDeliverySplit({ deliveryFeeMinor: 2500 })).toBeNull();
  });

  it("keeps a pre-split order's full rider pass-through", () => {
    expect(
      orderDeliverySplit({
        deliveryFeeMinor: 2500,
        riderCommissionBps: 10_000,
        riderPayoutMinor: 2500,
        platformDeliveryShareMinor: 0,
      }),
    ).toMatchObject({ riderPayoutMinor: 2500, platformDeliveryShareMinor: 0 });
  });
});
