import { describe, expect, it } from "vitest";

import type { Claim, Order, PayoutMilestone } from "@/lib/api/types";
import {
  describeProof,
  milestoneProofs,
  milestoneReadiness,
  payoutProgress,
  payoutQueueGroup,
  payoutSummary,
  releasableMilestones,
} from "@/lib/payouts";

function milestone(
  code: string,
  overrides: Partial<PayoutMilestone> = {},
): PayoutMilestone {
  const share =
    { printing: 50, packaging_qc: 15, delivered: 25, retention: 10 }[code] ?? 25;
  return {
    code,
    sharePercent: share,
    amountMinor: share * 1000,
    status: "pending_pof",
    pofFileIds: [],
    releasedAt: null,
    releasedBy: null,
    ...overrides,
  };
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    clientId: "c1",
    supplierId: "s1",
    riderId: null,
    state: "production",
    title: "Business cards",
    deadline: null,
    address: "Davao",
    deliveryFeeMinor: 0,
    totalMinor: 59700,
    paymentMethod: null,
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-09-15T10:00:00Z",
    updatedAt: "2026-09-15T10:00:00Z",
    timeline: [],
    payoutMilestones: [
      milestone("printing"),
      milestone("packaging_qc"),
      milestone("delivered"),
      milestone("retention"),
    ],
    ...overrides,
  } as Order;
}

const hold: Claim = {
  id: "clm_1",
  orderId: "ord_1",
  raisedBy: "user_client",
  reason: "Colour is off",
  status: "payout_held",
  holdReason: "Client reported the colour",
  releaseReason: null,
  heldAt: null,
  heldBy: null,
  releasedAt: null,
  releasedBy: null,
  createdAt: "2026-09-15T10:00:00Z",
  updatedAt: "2026-09-15T10:00:00Z",
  issueId: null,
  timeline: [],
};

describe("payoutProgress", () => {
  it("sums released and total from the milestones when amounts are visible", () => {
    const progress = payoutProgress(
      order({
        payoutMilestones: [
          milestone("printing", { status: "released" }),
          milestone("packaging_qc"),
          milestone("delivered"),
          milestone("retention"),
        ],
      }),
    );
    expect(progress).toEqual({
      count: 4,
      releasedCount: 1,
      releasedMinor: 50_000,
      totalMinor: 100_000,
      outstandingMinor: 50_000,
      supersededCount: 0,
    });
  });

  it("gives counts but no money when amounts are withheld", () => {
    const progress = payoutProgress(
      order({
        payoutMilestones: [
          milestone("printing", { amountMinor: undefined }),
          milestone("packaging_qc", { amountMinor: undefined }),
        ],
      }),
    );
    expect(progress.count).toBe(2);
    expect(progress.releasedMinor).toBeNull();
    expect(progress.totalMinor).toBeNull();
  });
});

describe("milestoneReadiness", () => {
  it("is ready only with proof, at the right stage, with no hold", () => {
    const proven = milestone("printing", { status: "pof_attached", pofFileIds: ["f1"] });
    expect(milestoneReadiness(order(), proven)).toBe("ready");
    expect(milestoneReadiness(order(), milestone("printing"))).toBe("waiting_proof");
    expect(milestoneReadiness(order({ state: "payment_authorized" }), proven)).toBe(
      "not_reached",
    );
    expect(milestoneReadiness(order({ payoutHold: true }), proven)).toBe("held");
    expect(milestoneReadiness(order(), proven, [hold])).toBe("held");
    expect(
      milestoneReadiness(order(), milestone("printing", { status: "released" })),
    ).toBe("released");
  });

  it("holds the delivered share until the balance is confirmed", () => {
    const delivered = milestone("delivered", {
      status: "pof_attached",
      pofFileIds: ["f3"],
    });
    const base = order({
      state: "issue_window_open",
      deliveryEvidence: {
        fileId: "f3",
        evidenceType: "photo",
        riderId: "r1",
        recordedAt: "2026-09-15T11:52:00Z",
      },
      payments: {
        downpayment: settled(44775),
        balance: { ...settled(14925), status: "pending_confirmation", confirmedAt: null },
      },
    });
    expect(milestoneReadiness(base, delivered)).toBe("not_reached");
    expect(
      milestoneReadiness(
        { ...base, payments: { downpayment: settled(44775), balance: settled(14925) } },
        delivered,
      ),
    ).toBe("ready");
  });
});

describe("milestoneProofs", () => {
  it("joins each proof to the timeline row that filed it", () => {
    const o = order({
      timeline: [
        {
          at: "2026-09-15T11:48:00Z",
          state: "production",
          by: "user_supplier",
          note: "Proof of Fulfilment attached for printing",
          fileId: "f1",
          milestoneCode: "printing",
        },
      ],
    });
    const proofs = milestoneProofs(
      o,
      milestone("printing", { status: "pof_attached", pofFileIds: ["f1", "f1", "f9"] }),
    );
    expect(proofs.map((p) => p.fileId)).toEqual(["f1", "f9"]);
    expect(proofs[0]).toMatchObject({
      attachedAt: "2026-09-15T11:48:00Z",
      attachedBy: "Supplier",
      inherited: false,
      label: "Proof 1 of 2",
    });
    expect(proofs[1]).toMatchObject({
      attachedAt: null,
      attachedBy: null,
      label: "Proof 2 of 2",
    });
  });

  it("marks the retention proof as the rider's delivery photo", () => {
    const o = order({
      timeline: [
        {
          at: "2026-09-15T11:52:00Z",
          state: "delivered",
          by: "user_rider",
          note: "Proof of Fulfilment attached for delivered",
          fileId: "f3",
          milestoneCode: "delivered",
        },
      ],
    });
    const [proof] = milestoneProofs(o, milestone("retention", { pofFileIds: ["f3"] }));
    expect(proof.inherited).toBe(true);
    expect(describeProof(proof, () => "then")).toBe(
      "The rider's delivery photo, filed then",
    );
    const [own] = milestoneProofs(o, milestone("delivered", { pofFileIds: ["f3"] }));
    expect(describeProof(own, () => "then")).toBe("Filed then by Rider");
  });
});

describe("the payout queue", () => {
  const proven = (code: string, extra: Partial<PayoutMilestone> = {}) =>
    milestone(code, { status: "pof_attached", pofFileIds: [`f_${code}`], ...extra });

  it("groups an order by the question Operations asks about it", () => {
    expect(payoutQueueGroup(order())).toBe("waiting");
    expect(payoutQueueGroup(order({ payoutMilestones: [proven("printing")] }))).toBe(
      "ready",
    );
    expect(
      payoutQueueGroup(
        order({ payoutMilestones: [proven("printing")], payoutHold: true }),
      ),
    ).toBe("held");
    expect(
      payoutQueueGroup(order({ payoutMilestones: [proven("printing")] }), [hold]),
    ).toBe("held");
    expect(
      payoutQueueGroup(
        order({
          payoutMilestones: [
            milestone("printing", { status: "released" }),
            milestone("packaging_qc", { status: "released" }),
          ],
        }),
      ),
    ).toBe("settled");
  });

  it("says in one line what the payout is waiting for", () => {
    expect(payoutSummary(order())).toBe(
      "Waiting on the shop's proof for printing in progress.",
    );
    expect(payoutSummary(order({ payoutMilestones: [proven("printing")] }))).toBe(
      "Printing in progress ready to release, ₱500.00.",
    );
    expect(
      payoutSummary(
        order({
          state: "supplier_self_qc",
          payoutMilestones: [proven("printing"), proven("packaging_qc")],
        }),
      ),
    ).toBe("2 shares ready to release, ₱650.00 together.");
    expect(
      payoutSummary(order({ payoutMilestones: [proven("printing")], payoutHold: true })),
    ).toBe("Held by a claim, ₱500.00 still to release.");
    expect(
      payoutSummary(
        order({
          payoutMilestones: [
            milestone("printing", { status: "released" }),
            milestone("packaging_qc", { status: "released" }),
          ],
        }),
      ),
    ).toBe("All 2 shares released, ₱650.00 paid.");
    expect(payoutSummary(order({ payoutMilestones: [] }))).toMatch(
      /set up when the shop accepts/,
    );
  });

  it("lists only the shares that can go out now", () => {
    const o = order({
      state: "production",
      payoutMilestones: [
        proven("printing"),
        proven("packaging_qc"),
        milestone("delivered"),
      ],
    });
    expect(releasableMilestones(o).map((m) => m.code)).toEqual(["printing"]);
  });
});

function settled(amountMinor: number) {
  return {
    amountMinor,
    method: "qr_manual",
    status: "confirmed",
    reference: "REF",
    submittedAt: "2026-09-15T10:00:00Z",
    confirmedAt: "2026-09-15T10:01:00Z",
    confirmedBy: "user_ops",
    confirmationSource: "manual_ops",
  };
}

describe("after a client refund settlement", () => {
  const settlementPayout = (patch: Record<string, unknown> = {}) => ({
    id: "rspay_1",
    settlementId: "rsettle_1",
    orderId: "ord_1",
    supplierId: "s1",
    amountMinor: 20_000,
    status: "pending",
    reference: null,
    receiptFileId: null,
    releasedAt: null,
    releasedBy: null,
    createdAt: "2026-09-28T04:20:00Z",
    code: "refund_settlement",
    label: "Agreed refund settlement payout",
    releaseRequires: "Operations records the exact remaining shop obligation.",
    ...patch,
  });

  // Plan 2: ₱1,000 shop cost, 40% paid, the shop agreed ₱600 in all.
  const settled = (
    payoutPatch: Record<string, unknown> = {},
    extra: Partial<Order> = {},
  ) =>
    order({
      state: "cancelled",
      payoutPlanVersion: 2,
      payoutMilestones: [
        milestone("production_started", {
          sharePercent: 40,
          amountMinor: 40_000,
          status: "released",
          pofFileIds: ["f1"],
        }),
        milestone("delivered", {
          sharePercent: 35,
          amountMinor: 35_000,
          status: "superseded",
        }),
        milestone("issue_window", {
          sharePercent: 25,
          amountMinor: 25_000,
          status: "superseded",
        }),
      ],
      supplierSettlementPayouts: [settlementPayout(payoutPatch)],
      ...extra,
    });

  it("never calls a superseded share paid or releasable", () => {
    const current = settled();
    const stage = current.payoutMilestones![1];
    expect(milestoneReadiness(current, stage)).toBe("superseded");
    expect(releasableMilestones(current)).toEqual([]);
  });

  it("counts what the shop earns as settled: paid shares plus the settlement payout", () => {
    expect(payoutProgress(settled())).toEqual({
      count: 2,
      releasedCount: 1,
      releasedMinor: 40_000,
      totalMinor: 60_000,
      outstandingMinor: 20_000,
      supersededCount: 2,
    });
    expect(payoutProgress(settled({ status: "released" }))).toMatchObject({
      releasedMinor: 60_000,
      outstandingMinor: 0,
    });
  });

  it("puts a pending settlement payout on the ready queue, and a claim holds it", () => {
    expect(payoutQueueGroup(settled())).toBe("ready");
    expect(payoutSummary(settled())).toBe(
      "Agreed refund settlement payout ready to record, ₱200.00.",
    );
    expect(payoutQueueGroup(settled(), [hold])).toBe("held");
    expect(payoutQueueGroup(settled({ status: "released" }))).toBe("settled");
    expect(payoutSummary(settled({ status: "released" }))).toBe(
      "Settled with a client refund. ₱600.00 paid to the shop in all.",
    );
  });

  it("holds every share while a refund request is open", () => {
    const paused = order({
      refundHold: true,
      payoutMilestones: [
        milestone("printing", { status: "pof_attached", pofFileIds: ["f"] }),
      ],
    });
    expect(milestoneReadiness(paused, paused.payoutMilestones![0])).toBe("held");
    expect(payoutQueueGroup(paused)).toBe("held");
    expect(payoutSummary(paused)).toMatch(/^Paused for a client refund request/);
  });
});
