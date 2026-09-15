import { describe, expect, it } from "vitest";

import type {
  Claim,
  Order,
  OrderPayments,
  PaymentRecord,
  PayoutMilestone,
} from "@/lib/api/types";

import { orderMoneySplits, reconciliationRows, rollupFinance } from "./finance";

function payments(
  downpayment: Partial<PaymentRecord>,
  balance: Partial<PaymentRecord>,
): OrderPayments {
  const base = {
    method: "qr_manual",
    status: "not_submitted",
    reference: null,
    submittedAt: null,
    confirmedAt: null,
    confirmedBy: null,
    confirmationSource: null,
  };
  return {
    downpayment: { amountMinor: 7500, ...base, ...downpayment },
    balance: { amountMinor: 2500, ...base, ...balance },
  };
}

function milestones(released: number, pending: number): PayoutMilestone[] {
  return [
    {
      code: "printing",
      sharePercent: 50,
      amountMinor: released,
      status: "released",
      pofFileIds: ["f1"],
    },
    {
      code: "packaging_qc",
      sharePercent: 15,
      amountMinor: pending,
      status: "pending_pof",
      pofFileIds: [],
    },
  ];
}

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
    deliveryFeeMinor: 1500,
    paymentMethod: "qr_manual",
    paymentStatus: "unpaid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    timeline: [],
    ...partial,
  };
}

describe("rollupFinance", () => {
  it("counts each installment by where it actually stands", () => {
    const orders = [
      order({
        id: "a",
        state: "production",
        payments: payments(
          { amountMinor: 7500, status: "confirmed" },
          { amountMinor: 2500, status: "not_submitted" },
        ),
      }),
      order({
        id: "b",
        state: "downpayment_review",
        payments: payments(
          { amountMinor: 3000, status: "pending_confirmation" },
          { amountMinor: 1000, status: "not_submitted" },
        ),
      }),
      // Migrated orders record their pre-v2 confirmation differently but the
      // money is just as in as any other.
      order({
        id: "c",
        state: "completed",
        payments: payments(
          { amountMinor: 900, status: "legacy_confirmed" },
          { amountMinor: 100, status: "legacy_confirmed" },
        ),
      }),
    ];

    const r = rollupFinance(orders, []);
    expect(r.confirmedIn).toEqual({ kind: "amount", minor: 7500 + 1000 });
    expect(r.awaitingConfirmation).toEqual({ kind: "amount", minor: 3000 });
    expect(r.outstanding).toEqual({ kind: "amount", minor: 2500 + 1000 });
  });

  it("leaves drafts out of every figure", () => {
    const r = rollupFinance(
      [
        order({
          id: "draft",
          state: "draft",
          payments: payments({ status: "confirmed" }, { status: "confirmed" }),
        }),
      ],
      [],
    );
    expect(r.confirmedIn).toEqual({ kind: "amount", minor: 0 });
    expect(r.orderCount).toBe(0);
  });

  it("sums the service fee only where the server gave one", () => {
    const r = rollupFinance(
      [
        order({ id: "priced", state: "production", serviceFeeMinor: 1000 }),
        order({ id: "unpriced", state: "needs_qa" }),
      ],
      [],
    );
    expect(r.commissionEarned).toEqual({ kind: "amount", minor: 1000 });
    expect(r.unpricedOrderCount).toBe(1);
  });

  it("says so rather than reporting zero commission when nothing is priced", () => {
    const r = rollupFinance([order({ id: "x", state: "needs_qa" })], []);
    expect(r.commissionEarned.kind).toBe("unavailable");
  });

  it("splits supplier milestones into released and still owed", () => {
    const r = rollupFinance(
      [
        order({
          id: "m",
          state: "issue_window_open",
          payoutMilestones: milestones(5000, 1500),
        }),
      ],
      [],
    );
    expect(r.supplierReleased).toEqual({ kind: "amount", minor: 5000 });
    expect(r.supplierOutstanding).toEqual({ kind: "amount", minor: 1500 });
  });

  it("counts the order total behind every active claim hold", () => {
    const claim: Claim = {
      id: "clm1",
      orderId: "held",
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
    };
    const r = rollupFinance(
      [
        order({
          id: "held",
          state: "completed",
          totalMinor: 4000,
          payoutHold: true,
        }),
      ],
      [claim],
    );
    expect(r.heldOnOrders).toEqual({ kind: "amount", minor: 4000 });
    expect(r.activeHoldClaims).toBe(1);
  });
});

describe("orderMoneySplits", () => {
  it("only splits orders a supplier has actually priced", () => {
    const splits = orderMoneySplits([
      order({
        id: "priced",
        state: "production",
        supplierPriceMinor: 100000,
        serviceFeeMinor: 10000,
        deliveryFeeMinor: 2500,
        totalMinor: 112500,
      }),
      order({ id: "estimate", state: "needs_qa" }),
    ]);
    expect(splits.map((s) => s.orderId)).toEqual(["priced"]);
    expect(splits[0]).toMatchObject({
      supplierPriceMinor: 100000,
      commissionMinor: 10000,
      deliveryFeeMinor: 2500,
    });
  });

  it("sums back to the client total", () => {
    const [split] = orderMoneySplits([
      order({
        id: "p",
        state: "production",
        supplierPriceMinor: 100000,
        serviceFeeMinor: 10000,
        deliveryFeeMinor: 2500,
        totalMinor: 112500,
      }),
    ]);
    expect(
      split.supplierPriceMinor + split.commissionMinor + split.deliveryFeeMinor,
    ).toBe(split.totalMinor);
  });
});

describe("reconciliationRows", () => {
  it("drops drafts and puts the most recent activity first", () => {
    const rows = reconciliationRows([
      order({ id: "old", state: "production", updatedAt: "2026-01-01T00:00:00Z" }),
      order({ id: "draft", state: "draft" }),
      order({ id: "new", state: "completed", updatedAt: "2026-02-01T00:00:00Z" }),
    ]);
    expect(rows.map((o) => o.id)).toEqual(["new", "old"]);
  });
});
