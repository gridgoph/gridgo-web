import { describe, expect, it } from "vitest";

import type { Claim, Order } from "@/lib/api/types";

import { codReconciliationRows, rollupFinance } from "./finance";

function order(partial: Partial<Order> & Pick<Order, "id">): Order {
  return {
    clientId: "user_client",
    supplierId: null,
    riderId: null,
    state: "submitted",
    productId: "p1",
    title: "Test",
    quantity: 1,
    size: "A",
    material: "m",
    deadline: null,
    address: "addr",
    zone: "davao_central",
    totalMinor: 10000,
    deliveryFeeMinor: 15000,
    paymentMethod: null,
    paymentStatus: "unpaid",
    codEligible: true,
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    timeline: [],
    ...partial,
  };
}

describe("rollupFinance", () => {
  it("sums authorised, collected, unpaid and COD figures from real fields", () => {
    const orders = [
      order({ id: "a", paymentStatus: "authorized", totalMinor: 1000 }),
      order({
        id: "b",
        paymentStatus: "collected",
        paymentMethod: "cod",
        totalMinor: 2000,
      }),
      order({
        id: "c",
        paymentStatus: "unpaid",
        paymentMethod: "cod",
        totalMinor: 3000,
      }),
      order({
        id: "d",
        paymentStatus: "collected",
        paymentMethod: "pilot_credit",
        totalMinor: 4000,
        payoutHold: true,
      }),
    ];
    const claims: Claim[] = [
      {
        id: "clm1",
        orderId: "d",
        raisedBy: "user_ops",
        reason: "hold",
        status: "payout_held",
        holdReason: "x",
        releaseReason: null,
        heldAt: null,
        heldBy: null,
        releasedAt: null,
        releasedBy: null,
        createdAt: "",
        updatedAt: "",
        issueId: null,
        timeline: [],
      },
    ];

    const r = rollupFinance(orders, claims);
    expect(r.authorised).toEqual({ kind: "amount", minor: 1000 });
    expect(r.collected).toEqual({ kind: "amount", minor: 6000 });
    expect(r.unpaid).toEqual({ kind: "amount", minor: 3000 });
    expect(r.heldOnOrders).toEqual({ kind: "amount", minor: 4000 });
    expect(r.activeHoldClaims).toBe(1);
    expect(r.codCollected).toEqual({ kind: "amount", minor: 2000 });
    expect(r.codOutstanding).toEqual({ kind: "amount", minor: 3000 });
    expect(r.codOrderCount).toBe(2);
  });

  it("marks payout released unavailable when no such orders exist", () => {
    const r = rollupFinance([order({ id: "x" })], []);
    expect(r.payoutReleased.kind).toBe("unavailable");
  });

  it("sums payout released from order totals when state present", () => {
    const r = rollupFinance(
      [order({ id: "p", state: "payout_released", totalMinor: 5500 })],
      [],
    );
    expect(r.payoutReleased).toEqual({ kind: "amount", minor: 5500 });
  });
});

describe("codReconciliationRows", () => {
  it("returns only COD orders", () => {
    const rows = codReconciliationRows([
      order({ id: "1", paymentMethod: "cod" }),
      order({ id: "2", paymentMethod: "pilot_credit" }),
    ]);
    expect(rows.map((o) => o.id)).toEqual(["1"]);
  });
});
