import { describe, expect, it } from "vitest";

import {
  basketShopCounts,
  groupMoney,
  groupPositionLabel,
  groupRefundState,
  reconcileBasket,
  shopModeLabel,
  shopModeOf,
} from "@/lib/baskets";
import { basketOf, shopA, shopB } from "@/test/baskets";

describe("shop mode", () => {
  const single = { ...shopA, id: "ord_single", basketId: null, groupLabel: null };
  const counts = basketShopCounts([shopA, shopB, single]);

  it("tags an order without a basket Single-Shop", () => {
    expect(shopModeLabel(shopModeOf(single, counts))).toBe("Single-Shop");
    expect(groupPositionLabel(single, counts)).toBeNull();
  });

  it("tags a basket group Multi-Shop with the number of shops", () => {
    expect(shopModeLabel(shopModeOf(shopA, counts))).toBe("Multi-Shop, 2 shops");
    expect(groupPositionLabel(shopB, counts)).toBe("Shop B of 2");
  });

  it("counts every group of a basket, wherever each one has got to", () => {
    const shopC = { ...shopA, id: "ord_c", groupLabel: "Shop C", state: "cancelled" };
    expect(shopModeOf(shopA, basketShopCounts([shopA, shopB, shopC]))).toEqual({
      kind: "multi",
      shops: 3,
    });
  });

  it("never calls a basket group single, even with one group in view", () => {
    expect(shopModeOf(shopA, basketShopCounts([shopA]))).toEqual({
      kind: "multi",
      shops: 2,
    });
  });
});

describe("reconcileBasket", () => {
  it("adds the groups up to the client's one payment", () => {
    const result = reconcileBasket(basketOf([shopA, shopB]));
    expect(result).toEqual({
      groupsMinor: 68800,
      paidMinor: 68800,
      balanced: true,
      parts: [
        { label: "Shop A", totalMinor: 46500 },
        { label: "Shop B", totalMinor: 22300 },
      ],
    });
  });

  it("says when the groups do not make the payment", () => {
    const basket = basketOf([shopA, shopB]);
    basket.payment.amountMinor = 70000;
    expect(reconcileBasket(basket).balanced).toBe(false);
  });
});

describe("groupMoney", () => {
  it("reads one group's shop price, fee, discount, delivery and total", () => {
    const [, b] = basketOf([shopA, shopB]).groups;
    expect(groupMoney(b)).toEqual({
      shopPriceMinor: 18000,
      serviceFeeMinor: 1800,
      organizationDiscountMinor: 0,
      deliveryFeeMinor: 2500,
      totalMinor: 22300,
    });
  });
});

describe("groupRefundState", () => {
  it("reads each group's refund on its own", () => {
    expect(groupRefundState({}).label).toBe("No refund");
    expect(groupRefundState({ refundHold: true }).label).toBe("Refund in progress");
    expect(groupRefundState({ refundDisposition: "cancelled" }).label).toBe(
      "Refund settled",
    );
  });
});
