import { describe, expect, it } from "vitest";

import {
  basketShopCounts,
  cancelledShare,
  cancelledShares,
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

describe("cancelledShare", () => {
  const cancelledB = { ...shopB, state: "cancelled" };

  it("says how much of a waiting payment a cancelled group holds, and where it is refunded", () => {
    const basket = basketOf([shopA, cancelledB]);
    expect(cancelledShares(basket)).toEqual([
      {
        label: "Shop B",
        orderId: "ord_b",
        amountMinor: 22300,
        paid: false,
        sentence:
          "₱223.00 of this payment is for Shop B, which was cancelled. After confirming, refund it from Shop B's order.",
      },
    ]);
  });

  it("says the money is owed back once the payment is confirmed", () => {
    const basket = basketOf([shopA, cancelledB]);
    basket.payment.status = "confirmed";
    const share = cancelledShare(basket, basket.groups[1]);
    expect(share?.paid).toBe(true);
    expect(share?.sentence).toBe(
      "₱223.00 of the client's payment is for Shop B, which was cancelled. Refund it from Shop B's order.",
    );
  });

  it("says nothing for a live group, an unpaid basket, or a refund already under way", () => {
    const basket = basketOf([shopA, cancelledB]);
    expect(cancelledShare(basket, basket.groups[0])).toBeNull();
    basket.payment.status = "not_submitted";
    expect(cancelledShares(basket)).toEqual([]);
    const refunding = basketOf([shopA, { ...cancelledB, refundHold: true }]);
    expect(cancelledShares(refunding)).toEqual([]);
  });
});
