import { describe, expect, it } from "vitest";

import {
  buildPayoutRows,
  formatMoneyOrUnavailable,
  isPayoutRelevant,
  presentSettlement,
} from "./payouts";
import type { Issue, Order } from "@/lib/api/types";

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
    codEligible: false,
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    timeline: [],
    ...partial,
  };
}

describe("isPayoutRelevant", () => {
  it("includes completed path only", () => {
    expect(isPayoutRelevant("completed")).toBe(true);
    expect(isPayoutRelevant("payout_released")).toBe(true);
    expect(isPayoutRelevant("production")).toBe(false);
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
      const s = presentSettlement({
        state,
        paymentStatus: "authorized",
        payoutHold: false,
      });
      expect(s.label.toLowerCase()).not.toContain("escrow");
      expect(s.detail.toLowerCase()).not.toContain("escrow");
      expect(s.label.toLowerCase()).not.toMatch(/_/);
    }
  });

  it("flags hold above state", () => {
    const s = presentSettlement({
      state: "completed",
      paymentStatus: "collected",
      payoutHold: true,
    });
    expect(s.label).toMatch(/hold/i);
    expect(s.tone).toBe("warning");
  });

  it("uses protected payment language on release", () => {
    const s = presentSettlement({
      state: "payout_released",
      paymentStatus: "collected",
      payoutHold: false,
    });
    expect(s.detail).toMatch(/Protected payment/i);
  });
});

describe("buildPayoutRows", () => {
  it("uses product total as gross and leaves commission/net unavailable", () => {
    const rows = buildPayoutRows([
      job({ id: "1", state: "completed", totalMinor: 45000 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].grossMinor).toBe(45000);
    expect(rows[0].commissionMinor).toBeNull();
    expect(rows[0].netMinor).toBeNull();
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

  it("excludes pure production jobs without hold", () => {
    const rows = buildPayoutRows([
      job({ id: "1", state: "production", totalMinor: 1000 }),
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
