import { describe, expect, it } from "vitest";

import type { Order, ProductionLapse } from "@/lib/api/types";
import {
  DEFAULT_PRODUCTION_PENALTY,
  canRecordNoCommunication,
  formatDuration,
  latenessOf,
  latenessText,
  orderDeductionMinor,
  parsePenaltyRates,
  penaltyChangeReason,
  penaltyDeductionMinor,
  penaltyRateDraft,
  presentLapseStatus,
  qualityPointsLost,
  sortFleet,
  summarizeShop,
  unpaidPayoutMinor,
} from "@/lib/production-penalties";

const NOW = Date.parse("2026-10-04T12:00:00.000Z");
const HOUR = 3_600_000;

function lapse(p: Partial<ProductionLapse> = {}): ProductionLapse {
  return {
    id: "lapse_1",
    orderId: "ord_1",
    supplierId: "sup_1",
    deadlineAt: "2026-10-03T00:00:00.000Z",
    detectedAt: "2026-10-03T00:01:00.000Z",
    tier: "minor",
    rateBps: 500,
    settingsVersion: 3,
    policy: DEFAULT_PRODUCTION_PENALTY,
    warnings: [
      {
        tier: "minor",
        at: "2026-10-03T00:01:00.000Z",
        message: "This order missed…",
        formal: false,
      },
    ],
    remainingBalanceMinor: 0,
    deductionMinor: 0,
    appliedAt: null,
    closedAt: null,
    reassignmentEligible: false,
    status: "warning_only",
    ...p,
  };
}

function order(p: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    clientId: "c",
    supplierId: "sup_1",
    riderId: null,
    state: "production",
    title: "Flyers",
    deadline: null,
    address: "",
    ...p,
  } as Order;
}

describe("lateness", () => {
  it("reads the order's ready time when it has one", () => {
    const l = lapse();
    const late = latenessOf(
      l,
      order({ readyAt: "2026-10-03T03:20:00.000Z", state: "ready_for_dispatch" }),
      NOW,
    );
    expect(late).toEqual({ kind: "finished", lateMs: 3 * HOUR + 20 * 60_000 });
    expect(latenessText(late, "minor")).toBe("Ready 3 h 20 min late");
  });

  it("counts a job still in production up to now", () => {
    const late = latenessOf(lapse(), order(), NOW);
    expect(latenessText(late, "severe")).toBe("Not ready, 1 d 12 h past");
  });

  it("falls back to the tier band without the order", () => {
    expect(latenessText(latenessOf(lapse(), undefined, NOW), "moderate")).toBe(
      "6 to 24 hours late, with a formal warning",
    );
  });

  it("formats short and long spans", () => {
    expect(formatDuration(30_000)).toBe("under a minute");
    expect(formatDuration(45 * 60_000)).toBe("45 min");
    expect(formatDuration(6 * HOUR)).toBe("6 h");
    expect(formatDuration(48 * HOUR)).toBe("2 d");
  });
});

describe("money", () => {
  it("adds the unpaid, non-superseded shares", () => {
    const o = order({
      payoutMilestones: [
        {
          code: "a",
          sharePercent: 40,
          amountMinor: 4000,
          status: "released",
          pofFileIds: [],
        },
        {
          code: "b",
          sharePercent: 35,
          amountMinor: 3500,
          status: "pending",
          pofFileIds: [],
        },
        {
          code: "c",
          sharePercent: 25,
          amountMinor: 2000,
          productionDeductionMinor: 500,
          status: "pending",
          pofFileIds: [],
        },
      ],
    });
    expect(unpaidPayoutMinor(o)).toBe(5500);
    expect(orderDeductionMinor(o)).toBe(500);
    expect(unpaidPayoutMinor(order())).toBeNull();
  });

  it("deducts half-up and never more than the balance", () => {
    expect(penaltyDeductionMinor(1_000_000, 500)).toBe(50_000);
    expect(penaltyDeductionMinor(333, 1_500)).toBe(50);
    expect(penaltyDeductionMinor(100, 10_000)).toBe(100);
  });
});

describe("status", () => {
  it("reads a pending deduction as paused when the switch is off", () => {
    expect(presentLapseStatus(lapse({ status: "warned" }), true).label).toBe(
      "Deduction pending",
    );
    expect(presentLapseStatus(lapse({ status: "warned" }), false).label).toBe(
      "Deduction paused",
    );
    expect(presentLapseStatus(lapse({ status: "applied" }), true).label).toBe("Deducted");
    expect(presentLapseStatus(lapse(), true).label).toBe("Warning only");
  });

  it("offers no-communication only on an open, overdue, not yet severe job", () => {
    expect(canRecordNoCommunication(lapse(), order(), NOW)).toBe(true);
    expect(canRecordNoCommunication(lapse({ tier: "severe" }), order(), NOW)).toBe(false);
    expect(
      canRecordNoCommunication(
        lapse(),
        order({ readyAt: "2026-10-03T01:00:00.000Z" }),
        NOW,
      ),
    ).toBe(false);
    expect(canRecordNoCommunication(lapse(), order({ state: "cancelled" }), NOW)).toBe(
      false,
    );
    expect(canRecordNoCommunication(lapse({ status: "closed" }), order(), NOW)).toBe(
      false,
    );
    expect(canRecordNoCommunication(lapse(), undefined, NOW)).toBe(false);
  });
});

describe("fleet", () => {
  it("costs 2 quality points a late job, 10 at most", () => {
    expect(qualityPointsLost(0)).toBe(0);
    expect(qualityPointsLost(3)).toBe(6);
    expect(qualityPointsLost(9)).toBe(10);
  });

  it("summarises a shop and counts only the last 30 days as recent", () => {
    const summary = summarizeShop(
      "sup_1",
      "Shop A",
      [
        lapse({
          id: "1",
          tier: "moderate",
          warnings: [{ tier: "moderate", at: "x", message: "", formal: true }],
        }),
        lapse({
          id: "2",
          status: "applied",
          deductionMinor: 1200,
          deadlineAt: "2026-08-01T00:00:00.000Z",
        }),
        lapse({ id: "3", status: "warned", tier: "severe" }),
      ],
      NOW,
    );
    expect(summary.recent.map((row) => row.id)).toEqual(["1", "3"]);
    expect(summary.total).toBe(3);
    expect(summary.byTier).toEqual({ minor: 1, moderate: 1, severe: 1 });
    expect(summary.formalWarnings).toBe(1);
    expect(summary.deductedMinor).toBe(1200);
    expect(summary.pending).toBe(1);
  });

  it("puts problem shops first", () => {
    const old = "2026-07-01T00:00:00.000Z";
    const rows = sortFleet([
      summarizeShop(
        "a",
        "Shop A",
        [lapse({ deadlineAt: old }), lapse({ deadlineAt: old })],
        NOW,
      ),
      summarizeShop("b", "Shop B", [lapse()], NOW),
      summarizeShop("c", "Shop C", [lapse({ tier: "severe" })], NOW),
      summarizeShop("d", "Shop D", [lapse(), lapse()], NOW),
    ]);
    expect(rows.map((row) => row.supplierId)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("settings", () => {
  it("parses the three rates into the complete policy", () => {
    const parsed = parsePenaltyRates(
      { minor: "5", moderate: "12.5", severe: "30" },
      false,
    );
    expect(parsed).toEqual({
      policy: {
        deductionsEnabled: false,
        minorBps: 500,
        moderateBps: 1250,
        severeBps: 3000,
      },
    });
    expect(penaltyRateDraft(DEFAULT_PRODUCTION_PENALTY)).toEqual({
      minor: "5",
      moderate: "15",
      severe: "30",
    });
  });

  it("refuses unreadable rates and a later tier taking less", () => {
    expect(
      parsePenaltyRates({ minor: "", moderate: "15", severe: "30" }, false),
    ).toMatchObject({ tier: "minor" });
    expect(
      parsePenaltyRates({ minor: "5", moderate: "101", severe: "30" }, false),
    ).toMatchObject({ tier: "moderate" });
    expect(
      parsePenaltyRates({ minor: "20", moderate: "15", severe: "30" }, false),
    ).toMatchObject({ tier: "moderate" });
    expect(
      parsePenaltyRates({ minor: "5", moderate: "35", severe: "30" }, false),
    ).toMatchObject({ tier: "severe" });
  });

  it("names every change in the audit reason", () => {
    expect(
      penaltyChangeReason(DEFAULT_PRODUCTION_PENALTY, {
        ...DEFAULT_PRODUCTION_PENALTY,
        minorBps: 800,
        deductionsEnabled: true,
      }),
    ).toBe(
      "Late-production penalties from the portal: minor 5% to 8%; real deductions turned on",
    );
  });
});
