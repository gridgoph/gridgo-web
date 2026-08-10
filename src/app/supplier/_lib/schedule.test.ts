import { describe, expect, it } from "vitest";

import {
  buildScheduleEntries,
  dayKeyFromDate,
  filterEntriesInRange,
  formatRangeLabel,
  isOnSchedule,
  shiftRange,
  weekContaining,
} from "./schedule";
import type { Order } from "@/lib/api/types";

function job(
  partial: Partial<Order> & Pick<Order, "id" | "state">,
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
    totalMinor: 1000,
    deliveryFeeMinor: 0,
    paymentMethod: null,
    paymentStatus: "unpaid",
    promisedDate: null,
    artworkName: null,
    createdAt: "",
    updatedAt: "",
    timeline: [],
    ...partial,
  };
}

describe("isOnSchedule", () => {
  it("includes accepted production, excludes draft matching", () => {
    expect(isOnSchedule("production")).toBe(true);
    expect(isOnSchedule("supplier_assigned")).toBe(false);
    expect(isOnSchedule("completed")).toBe(false);
  });
});

describe("buildScheduleEntries", () => {
  it("sorts by promised date then deadline", () => {
    const entries = buildScheduleEntries([
      job({
        id: "late",
        state: "production",
        promisedDate: "2026-08-15T10:00:00+08:00",
      }),
      job({
        id: "early",
        state: "production",
        promisedDate: "2026-08-10T10:00:00+08:00",
      }),
      job({
        id: "skip",
        state: "supplier_assigned",
        promisedDate: "2026-08-01T10:00:00+08:00",
      }),
    ]);
    expect(entries.map((e) => e.job.id)).toEqual(["early", "late"]);
  });

  it("falls back to deadline when promisedDate missing", () => {
    const entries = buildScheduleEntries([
      job({
        id: "d",
        state: "production",
        deadline: "2026-08-12T10:00:00+08:00",
      }),
    ]);
    expect(entries[0].dayKey).toBe("2026-08-12");
  });
});

describe("weekContaining + shiftRange", () => {
  it("builds a Monday–Sunday week", () => {
    // 2026-08-12 is a Wednesday
    const week = weekContaining(new Date(2026, 7, 12));
    expect(dayKeyFromDate(week.start)).toBe("2026-08-10");
    expect(dayKeyFromDate(week.end)).toBe("2026-08-16");
  });

  it("shifts by one week", () => {
    const week = weekContaining(new Date(2026, 7, 12));
    const next = shiftRange(week, "week", 1);
    expect(dayKeyFromDate(next.start)).toBe("2026-08-17");
  });
});

describe("filterEntriesInRange", () => {
  it("keeps only entries in the visible range", () => {
    const entries = buildScheduleEntries([
      job({
        id: "in",
        state: "production",
        promisedDate: "2026-08-12T10:00:00+08:00",
      }),
      job({
        id: "out",
        state: "production",
        promisedDate: "2026-09-01T10:00:00+08:00",
      }),
    ]);
    const week = weekContaining(new Date(2026, 7, 12));
    const filtered = filterEntriesInRange(entries, week);
    expect(filtered.map((e) => e.job.id)).toEqual(["in"]);
  });
});

describe("formatRangeLabel", () => {
  it("returns a non-empty label", () => {
    const week = weekContaining(new Date(2026, 7, 12));
    expect(formatRangeLabel(week, "week").length).toBeGreaterThan(5);
  });
});
