import { describe, expect, it } from "vitest";

import type { PerformanceEvent, SupplierPerformance } from "@/lib/api/types";
import {
  canMarkNoFault,
  countLines,
  eventChip,
  hoursLateText,
  needsAttention,
  onTimeDetail,
  onTimeRateText,
  performanceErrorCopy,
  performanceRow,
  shopForOrder,
  sortPerformanceRows,
  tierLabel,
  topPickChip,
  warningLabel,
} from "@/lib/supplier-performance";

function event(p: Partial<PerformanceEvent> = {}): PerformanceEvent {
  return {
    id: "performance_1",
    orderId: "ord_1",
    kind: "late_finish",
    at: "2026-10-17T03:00:00.000Z",
    recordedAt: "2026-10-17T03:00:30.000Z",
    reason: "Finished after the committed ready-by and one-hour grace window.",
    reasonCode: null,
    message: "Order ord_1: finished 2 shop hours after the committed ready-by (minor).",
    tier: "minor",
    deadlineAt: "2026-10-17T01:00:00.000Z",
    hoursLate: 2,
    workingLateMs: 7_200_000,
    graceMinutes: 60,
    exempt: false,
    exemptionReason: null,
    warningCodes: ["late_finish"],
    active: true,
    ...p,
  };
}

function performance(p: Partial<SupplierPerformance> = {}): SupplierPerformance {
  return {
    supplierId: "sup_1",
    asOf: "2026-10-18T00:00:00.000Z",
    policy: "warnings_only",
    windowDays: 30,
    graceMinutes: 60,
    counts: { declines: 0, timeouts: 0, lateFinishes: 0, cancellations: 0, arrivedPacked: 0 },
    rosterReview: false,
    topPick: { hidden: false, hiddenUntil: null, allHiddenFallback: true },
    onTime: { completed: 0, onTime: 0, late: 0, rate: null },
    warnings: [],
    notices: [],
    events: [],
    ...p,
  };
}

describe("shop performance words", () => {
  it("says how late in shop hours, never subtracting the grace hour", () => {
    expect(hoursLateText(event())).toBe("2 hours late in shop hours");
    expect(hoursLateText(event({ workingLateMs: 3_660_000 }))).toBe(
      "1 hour 1 min late in shop hours",
    );
    expect(hoursLateText(event({ workingLateMs: null, hoursLate: null }))).toBeNull();
  });

  it("names tiers by their bands", () => {
    expect(tierLabel("minor")).toBe("Minor: over 1 hour late");
    expect(tierLabel("severe")).toBe("Severe: over 24 hours late");
    expect(tierLabel(null)).toBeNull();
  });

  it("reads the on-time rate only when there is finished work", () => {
    expect(onTimeRateText({ completed: 0, onTime: 0, late: 0, rate: null })).toBeNull();
    expect(onTimeRateText({ completed: 4, onTime: 3, late: 1, rate: 0.75 })).toBe("75%");
    expect(onTimeDetail({ completed: 4, onTime: 3, late: 1, rate: 0.75 })).toBe(
      "3 of 4 finished jobs on time",
    );
  });

  it("puts the Top Pick demotion in words with its end date", () => {
    expect(topPickChip({ hidden: false, hiddenUntil: null, allHiddenFallback: true }).label).toBe(
      "Can be Top Pick",
    );
    expect(
      topPickChip({ hidden: true, hiddenUntil: "2026-10-24T03:00:00.000Z", allHiddenFallback: true })
        .label,
    ).toMatch(/^Hidden from Top Pick until /);
  });

  it("labels every warning code without snake case", () => {
    for (const code of [
      "late_finish",
      "repeated_declines",
      "repeated_timeouts",
      "accepted_order_cancelled",
      "repeated_arrived_packed",
      "something_new",
    ]) {
      expect(warningLabel(code)).not.toMatch(/_/);
    }
  });

  it("marks exempt and no-fault events and offers no-fault only on a counted late finish", () => {
    expect(eventChip(event()).label).toBe("Warning");
    expect(eventChip(event({ exempt: true })).label).toBe("Exempt");
    expect(eventChip(event({ kind: "no_fault" })).label).toBe("No-fault");
    expect(eventChip(event({ kind: "on_time_finish", warningCodes: [] })).label).toBe("On time");
    expect(canMarkNoFault(event())).toBe(true);
    expect(canMarkNoFault(event({ exempt: true }))).toBe(false);
    expect(canMarkNoFault(event({ kind: "declined" }))).toBe(false);
  });

  it("explains each count with its rule and shows no money", () => {
    const lines = countLines({ declines: 1, timeouts: 2, lateFinishes: 3, cancellations: 0, arrivedPacked: 0 });
    expect(lines.map((line) => line.value)).toEqual([3, 2, 1, 0, 0]);
    for (const line of lines) expect(line.rule).not.toMatch(/₱|%|peso/i);
  });
});

describe("shop list", () => {
  it("puts roster review, then hidden, then warnings first", () => {
    const quiet = performanceRow(performance({ supplierId: "a" }), "Alpha");
    const warned = performanceRow(
      performance({ supplierId: "b", warnings: [event()], counts: { declines: 0, timeouts: 0, lateFinishes: 1, cancellations: 0, arrivedPacked: 0 } }),
      "Bravo",
    );
    const hidden = performanceRow(
      performance({ supplierId: "c", topPick: { hidden: true, hiddenUntil: null, allHiddenFallback: true } }),
      "Charlie",
    );
    const review = performanceRow(performance({ supplierId: "d", rosterReview: true }), "Delta");
    expect(sortPerformanceRows([quiet, warned, hidden, review]).map((row) => row.shopName)).toEqual([
      "Delta",
      "Charlie",
      "Bravo",
      "Alpha",
    ]);
    expect(needsAttention(quiet)).toBe(false);
    expect(needsAttention(warned)).toBe(true);
  });

  it("finds the shop holding an order for an inbox notice", () => {
    const shops = [
      performance({ supplierId: "a" }),
      performance({ supplierId: "b", events: [event({ orderId: "ord_9" })] }),
    ];
    expect(shopForOrder(shops, "ord_9")).toBe("b");
    expect(shopForOrder(shops, "ord_missing")).toBeNull();
  });

  it("puts the no-fault errors in plain words", () => {
    expect(performanceErrorCopy("reason_required")).toMatch(/Write why/);
    expect(performanceErrorCopy("performance_not_active")).toMatch(/not started/);
    expect(performanceErrorCopy("unknown_code")).toBeNull();
  });
});
