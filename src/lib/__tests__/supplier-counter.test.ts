import { describe, expect, it } from "vitest";

import { supplierCounterCheck } from "@/lib/supplier-counter";

const checks = (passed: boolean) => [
  { code: "quantity_match", passed },
  { code: "specification_match", passed: true },
];

describe("supplier counter readback", () => {
  it("reads a missing count as Not recorded and keeps a failed check with the shop", () => {
    const view = supplierCounterCheck({
      title: "Banner",
      timeline: [],
      pickupCountItems: [{ lineItemId: "line-1", itemName: "Banner", expectedQuantity: 12 }],
      pickupChecklist: {
        status: "failed_escalated",
        checks: checks(false),
        evidenceFileIds: [],
        failureNote: "Two short",
        completedAt: "2026-10-15T04:00:00.000Z",
        completedBy: "rider-1",
        escalationId: "esc-1",
      },
    });
    expect(view?.stage).toBe("blocked");
    expect(view?.counts).toBeNull();
    expect(view?.detail).toMatch(/stays with you/);
    expect(view?.detail).not.toMatch(/released to transport|with the rider/i);
    expect(view?.failed).toContain("Count against the order");
  });

  it("shows a recorded count and a signature without offering an action", () => {
    const view = supplierCounterCheck({
      title: "Banner",
      timeline: [],
      pickupChecklist: {
        status: "passed",
        checks: checks(true),
        counts: [{ lineItemId: null, expectedQuantity: 4, countedQuantity: 4 }],
        evidenceFileIds: [],
        failureNote: null,
        completedAt: "2026-10-15T04:00:00.000Z",
        completedBy: "rider-1",
        escalationId: null,
        handoffSignature: {
          fileId: "sig",
          signerName: "Ana Reyes",
          signedAt: "2026-10-15T04:05:00.000Z",
          riderId: "rider-1",
        },
      },
    });
    expect(view?.counts?.[0]).toMatchObject({ counted: 4, difference: "Matches" });
    expect(view?.detail).toBe("Ana Reyes signed for the handoff.");
    expect(view?.stage).toBe("passed");
  });

  it("reads a cleared failure as a recheck, not a release", () => {
    const view = supplierCounterCheck({
      title: "Banner",
      timeline: [
        {
          at: "2026-10-15T05:00:00.000Z",
          state: "rider_assigned",
          note: "Pickup escalation resolved; repeat all six checks: Recount the banner.",
        },
      ],
      pickupChecklist: {
        status: "escalation_resolved",
        checks: checks(false),
        counts: [{ lineItemId: null, expectedQuantity: 12, countedQuantity: 10 }],
        evidenceFileIds: [],
        failureNote: "Two short",
        completedAt: "2026-10-15T04:00:00.000Z",
        completedBy: "rider-1",
        escalationId: "esc-1",
      },
    });
    expect(view?.stage).toBe("recheck");
    expect(view?.operationsNote).toBe("Recount the banner.");
    expect(view?.counts?.[0].difference).toBe("2 short");
    expect(view?.detail).toMatch(/Keep the package at the counter/);
    expect(view?.detail).not.toMatch(/released to transport/i);
  });
});
