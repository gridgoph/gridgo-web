import { describe, expect, it } from "vitest";

import {
  buildPayoutRows,
  formatMoneyOrUnavailable,
  isPayoutRelevant,
  presentSettlement,
  releaseMonths,
  releaseLines,
  settlementContrast,
  shopEarnings,
  unreleasedMinor,
} from "./payouts";
import { shopProofNotStarted } from "@/lib/payout-plan";
import type { Issue, Order, PayoutMilestone } from "@/lib/api/types";
import { escrowStages, released } from "@/test/payout-plans";

/** The four milestones as the server sends them to a supplier. */
function milestones(
  overrides: Partial<Record<string, PayoutMilestone["status"]>> = {},
): PayoutMilestone[] {
  const shares: [string, number, number][] = [
    ["printing", 50, 50000],
    ["packaging_qc", 15, 15000],
    ["delivered", 25, 25000],
    ["retention", 10, 10000],
  ];
  return shares.map(([code, sharePercent, amountMinor]) => ({
    code,
    sharePercent,
    amountMinor,
    status: overrides[code] ?? "pending_pof",
    pofFileIds: [],
  }));
}

function job(
  partial: Partial<Order> & Pick<Order, "id" | "state" | "totalMinor">,
): Order {
  return {
    clientId: "c1",
    supplierId: "user_supplier",
    riderId: null,
    productId: "p1",
    title: "Job",
    quantity: 1,
    size: "A4",
    material: "matte",
    deadline: null,
    address: "",
    zone: "davao_central",
    deliveryFeeMinor: 15000,
    paymentMethod: null,
    paymentStatus: "authorized",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    timeline: [],
    ...partial,
  };
}

describe("isPayoutRelevant", () => {
  it("starts at production, because the first milestone is earned there", () => {
    expect(isPayoutRelevant("production")).toBe(true);
    expect(isPayoutRelevant("completed")).toBe(true);
    expect(isPayoutRelevant("payout_released")).toBe(true);
    expect(isPayoutRelevant("supplier_assigned")).toBe(false);
    expect(isPayoutRelevant("awaiting_downpayment")).toBe(false);
  });
});

describe("presentSettlement", () => {
  it("never uses the word escrow", () => {
    for (const state of [
      "delivered",
      "issue_window_open",
      "completed",
      "payout_released",
    ]) {
      const s = presentSettlement({ state, payoutHold: false });
      expect(s.label.toLowerCase()).not.toContain("escrow");
      expect(s.detail.toLowerCase()).not.toContain("escrow");
      expect(s.label.toLowerCase()).not.toMatch(/_/);
    }
  });

  it("flags hold above state", () => {
    const s = presentSettlement({
      state: "completed",
      payoutHold: true,
      payoutMilestones: milestones({ printing: "released" }),
    });
    expect(s.label).toMatch(/hold/i);
    expect(s.tone).toBe("warning");
  });

  it("counts milestones rather than announcing a single payout", () => {
    const part = presentSettlement({
      state: "issue_window_open",
      payoutHold: false,
      payoutMilestones: milestones({
        printing: "released",
        packaging_qc: "released",
      }),
    });
    expect(part.label).toBe("2 of 4 milestones paid");

    const all = presentSettlement({
      state: "payout_released",
      payoutHold: false,
      payoutMilestones: milestones({
        printing: "released",
        packaging_qc: "released",
        delivered: "released",
        retention: "released",
      }),
    });
    expect(all.label).toBe("Paid in full");
    expect(all.tone).toBe("success");
  });
});

describe("buildPayoutRows", () => {
  it("splits milestone money into released and still owed", () => {
    const rows = buildPayoutRows([
      job({
        id: "1",
        state: "completed",
        totalMinor: 112500,
        supplierPriceMinor: 100000,
        payoutMilestones: milestones({
          printing: "released",
          packaging_qc: "released",
        }),
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].earnsMinor).toBe(100000);
    expect(rows[0].releasedMinor).toBe(65000);
    expect(rows[0].outstandingMinor).toBe(35000);
  });

  it("says unavailable rather than under-reporting a withheld amount", () => {
    const withheld = milestones();
    delete withheld[0].amountMinor;
    const rows = buildPayoutRows([
      job({ id: "1", state: "production", totalMinor: 1000, payoutMilestones: withheld }),
    ]);
    expect(rows[0].outstandingMinor).toBeNull();
  });

  it("includes hold jobs and surfaces issue description as hold reason", () => {
    const issues: Issue[] = [
      {
        id: "iss_1",
        orderId: "ord_1",
        clientId: "c1",
        description: "colours washed out on edges",
        kind: "material_quality",
        status: "open",
        consequence: "payout_hold",
        claimId: "clm_1",
        createdAt: "",
        updatedAt: "",
        resolvedAt: null,
        resolvedBy: null,
        resolution: null,
      },
    ];
    const rows = buildPayoutRows(
      [
        job({
          id: "ord_1",
          state: "issue_window_open",
          totalMinor: 45000,
          payoutHold: true,
        }),
      ],
      issues,
    );
    expect(rows[0].holdReason).toContain("colours washed out");
  });

  it("excludes jobs that have not reached production and carry no hold", () => {
    const rows = buildPayoutRows([
      job({ id: "1", state: "awaiting_downpayment", totalMinor: 1000 }),
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe("formatMoneyOrUnavailable", () => {
  it("labels null as unavailable", () => {
    expect(formatMoneyOrUnavailable(null, (n) => `₱${n}`)).toBe("Unavailable");
    expect(formatMoneyOrUnavailable(100, (n) => `₱${n}`)).toBe("₱100");
  });
});

describe("presentSettlement on an escrow-plan order", () => {
  it("names the order's own first share and never the legacy words", () => {
    const start = presentSettlement({
      state: "production",
      payoutHold: false,
      payoutPlanVersion: 2,
      payoutMilestones: escrowStages(),
    });
    expect(start.detail).toBe(
      "Upload your start-of-production photo, and Operations can release the first 40%.",
    );

    const window = presentSettlement({
      state: "issue_window_open",
      payoutHold: false,
      payoutPlanVersion: 2,
      payoutMilestones: escrowStages(),
    });
    expect(window.detail).toBe(
      "Delivered. The last 25% is released by Operations once the client's complaint window closes with nothing raised.",
    );

    const all = presentSettlement({
      state: "payout_released",
      payoutHold: false,
      payoutPlanVersion: 2,
      payoutMilestones: escrowStages({
        production_started: released("a"),
        delivered: released("b"),
        issue_window: released(),
      }),
    });
    expect(all.label).toBe("Paid in full");
    expect(all.detail).toBe("Every milestone has been released to you.");

    for (const s of [start, window, all]) {
      expect(s.detail).not.toMatch(/four|10% retention|first 50%|escrow/i);
    }
  });

  it("counts three parts, not four", () => {
    const part = presentSettlement({
      state: "issue_window_open",
      payoutHold: false,
      payoutPlanVersion: 2,
      payoutMilestones: escrowStages({ production_started: released("a") }),
    });
    expect(part.label).toBe("1 of 3 milestones paid");
  });

  it("keeps the legacy copy on a four-stage order", () => {
    expect(
      presentSettlement({ state: "production", payoutHold: false, payoutMilestones: milestones() })
        .detail,
    ).toBe("Upload a Proof of Fulfilment for printing, and Operations can release the first 50%.");
  });
});

describe("shop earnings ledger", () => {
  it("keeps a replaced share out of what is owed, and counts the settlement once", () => {
    const order = job({
      id: "s1",
      state: "cancelled",
      totalMinor: 100000,
      supplierSubtotalMinor: 100000,
      payoutHold: false,
      payoutMilestones: [
        { code: "printing", sharePercent: 50, amountMinor: 50000, status: "superseded", pofFileIds: [] },
        { code: "delivered", sharePercent: 25, amountMinor: 20000, status: "released", pofFileIds: [], releasedAt: "2026-08-31T15:00:00.000Z" },
      ],
      supplierSettlement: { totalSupplierEarningsMinor: 50000 },
      supplierSettlementPayouts: [
        {
          id: "pay_1",
          settlementId: "set_1",
          orderId: "s1",
          supplierId: "user_supplier",
          amountMinor: 30000,
          status: "pending",
          reference: null,
          receiptFileId: null,
          releasedAt: null,
          releasedBy: null,
          createdAt: "2026-09-01T00:00:00.000Z",
          code: "refund_settlement",
          label: "Agreed refund settlement payout",
          releaseRequires: "operations",
        },
      ],
    });
    const split = shopEarnings(order);
    expect(split.supersededMinor).toBe(50000);
    expect(split.totalMinor).toBe(50000);
    expect(split.releasedMinor).toBe(20000);
    expect(unreleasedMinor(split)).toBe(30000);
    expect(split.awaitingReleaseMinor).toBe(30000);
    const contrast = settlementContrast(order, split);
    expect(contrast.replaced).toBe(true);
    expect(contrast.agreedMinor).toBe(50000);
    expect(contrast.originalMinor).toBe(100000);
    expect(contrast.agreedMinor).not.toBe(contrast.originalMinor! + split.supersededMinor);
  });

  it("puts shop proof that can be filed now apart from a stage the job has not reached", () => {
    const producing = shopEarnings(
      job({
        id: "p",
        state: "production",
        totalMinor: 100000,
        payoutPlanVersion: 2,
        payoutMilestones: escrowStages(),
      }),
    );
    expect(producing.needsProofMinor).toBeGreaterThan(0);
    expect(producing.laterMinor).toBeGreaterThan(0);
    const waiting = job({
      id: "w",
      state: "accepted",
      totalMinor: 100000,
      payoutMilestones: milestones(),
    });
    expect(shopEarnings(waiting).needsProofMinor).toBe(0);
    expect(shopEarnings(waiting).laterMinor).toBe(100000);
    expect(shopProofNotStarted(waiting, waiting.payoutMilestones![0]!)).toBe(true);
  });

  it("says a late deduction beside the net amount and does not subtract it again", () => {
    const split = shopEarnings(
      job({
        id: "late",
        state: "production",
        totalMinor: 10000,
        payoutMilestones: [
          {
            code: "printing",
            sharePercent: 50,
            amountMinor: 9500,
            productionDeductionMinor: 500,
            status: "released",
            pofFileIds: [],
            releasedAt: "2026-08-31T16:30:00.000Z",
            reference: "GCASH-1",
            receiptFileId: "file_receipt",
          },
        ],
      }),
    );
    expect(split.releasedMinor).toBe(9500);
    expect(split.lateDeductionMinor).toBe(500);
    const [line] = releaseLines([
      job({
        id: "late",
        state: "production",
        totalMinor: 10000,
        title: "Banners",
        payoutMilestones: [
          {
            code: "printing",
            sharePercent: 50,
            amountMinor: 9500,
            status: "released",
            pofFileIds: [],
            releasedAt: "2026-08-31T16:30:00.000Z",
            reference: "GCASH-1",
            receiptFileId: "file_receipt",
          },
        ],
      }),
    ]);
    expect(line.reference).toBe("GCASH-1");
    expect(line.receiptFileId).toBe("file_receipt");
    expect(releaseMonths([line])[0]).toMatchObject({ key: "2026-09", totalMinor: 9500 });
  });

  it("buckets a claim hold and a refund pause, and leaves a superseded share unpaid", () => {
    const held = shopEarnings(
      job({
        id: "h",
        state: "production",
        totalMinor: 1000,
        payoutHold: true,
        payoutMilestones: milestones(),
      }),
    );
    expect(held.heldMinor).toBe(100000);
    expect(held.needsProofMinor).toBe(0);
    const paused = shopEarnings(
      job({
        id: "r",
        state: "production",
        totalMinor: 1000,
        refundHold: true,
        payoutMilestones: milestones(),
      }),
    );
    expect(paused.pausedMinor).toBe(100000);
    expect(paused.heldMinor).toBe(0);
  });
});
