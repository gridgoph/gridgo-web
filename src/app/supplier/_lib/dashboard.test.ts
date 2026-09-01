import { describe, expect, it } from "vitest";

import {
  finishedByWeek,
  isOpenJob,
  jobEarningsMinor,
  medianProductionHours,
  onTheBoardMinor,
  onTimeSummary,
  productionStartedAt,
  stageCounts,
  unmappedStates,
} from "./dashboard";
import type { Order, TimelineEntry } from "@/lib/api/types";

function job(partial: Partial<Order> & Pick<Order, "id" | "state">): Order {
  return {
    clientId: "c1",
    supplierId: "user_supplier",
    riderId: null,
    title: "Job",
    deadline: null,
    address: "Somewhere",
    deliveryFeeMinor: 0,
    totalMinor: 0,
    paymentMethod: null,
    paymentStatus: "unpaid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    timeline: [],
    ...partial,
  } as Order;
}

function tl(at: string, state: string): TimelineEntry {
  return { at, state, by: "user_supplier", note: "" };
}

describe("jobEarningsMinor", () => {
  it("prefers the stored supplier subtotal", () => {
    expect(
      jobEarningsMinor(
        job({ id: "o", state: "production", supplierSubtotalMinor: 5000, supplierPriceMinor: 9999 }),
      ),
    ).toBe(5000);
  });

  it("falls back to the supplier-facing alias when the subtotal is absent", () => {
    expect(jobEarningsMinor(job({ id: "o", state: "production", supplierPriceMinor: 2500 }))).toBe(2500);
  });

  it("counts an unpriced job as zero rather than NaN", () => {
    expect(jobEarningsMinor(job({ id: "o", state: "supplier_assigned" }))).toBe(0);
  });
});

describe("isOpenJob / onTheBoardMinor", () => {
  it("excludes closed and cancelled jobs from the board", () => {
    expect(isOpenJob(job({ id: "a", state: "production" }))).toBe(true);
    expect(isOpenJob(job({ id: "b", state: "completed" }))).toBe(false);
    expect(isOpenJob(job({ id: "c", state: "payout_released" }))).toBe(false);
    expect(
      isOpenJob(job({ id: "d", state: "production", cancelledAt: "2026-08-02T00:00:00.000Z" })),
    ).toBe(false);
  });

  it("sums only what is still open", () => {
    const total = onTheBoardMinor([
      job({ id: "a", state: "production", supplierSubtotalMinor: 4000 }),
      job({ id: "b", state: "supplier_self_qc", supplierSubtotalMinor: 1000 }),
      job({ id: "c", state: "completed", supplierSubtotalMinor: 9999 }),
      job({
        id: "d",
        state: "production",
        supplierSubtotalMinor: 5000,
        cancelledAt: "2026-08-02T00:00:00.000Z",
      }),
    ]);
    expect(total).toBe(5000);
  });
});

describe("productionStartedAt", () => {
  it("uses the earliest production entry, not the order's creation", () => {
    const at = productionStartedAt(
      job({
        id: "o",
        state: "delivered",
        createdAt: "2026-08-01T00:00:00.000Z",
        timeline: [
          tl("2026-08-06T00:00:00.000Z", "production"),
          tl("2026-08-04T00:00:00.000Z", "production"),
          tl("2026-08-02T00:00:00.000Z", "payment_authorized"),
        ],
      }),
    );
    expect(at).toBe(Date.parse("2026-08-04T00:00:00.000Z"));
  });

  it("returns null when the job never entered production", () => {
    expect(productionStartedAt(job({ id: "o", state: "supplier_assigned" }))).toBeNull();
  });
});

describe("onTimeSummary", () => {
  it("measures against the shop's own ready-by date", () => {
    const summary = onTimeSummary([
      job({ id: "early", state: "delivered", readyBy: "2026-08-05T12:00:00.000Z", readyAt: "2026-08-05T09:00:00.000Z" }),
      job({ id: "late", state: "delivered", readyBy: "2026-08-05T12:00:00.000Z", readyAt: "2026-08-06T09:00:00.000Z" }),
      job({ id: "exact", state: "delivered", readyBy: "2026-08-05T12:00:00.000Z", readyAt: "2026-08-05T12:00:00.000Z" }),
    ]);
    expect(summary).toEqual({ measured: 3, onTime: 2, rate: 2 / 3 });
  });

  it("skips jobs missing either stamp rather than scoring them late", () => {
    const summary = onTimeSummary([
      job({ id: "no-due", state: "delivered", readyAt: "2026-08-05T09:00:00.000Z" }),
      job({ id: "unfinished", state: "production", readyBy: "2026-08-05T12:00:00.000Z" }),
      job({ id: "ok", state: "delivered", readyBy: "2026-08-05T12:00:00.000Z", readyAt: "2026-08-05T09:00:00.000Z" }),
    ]);
    expect(summary).toEqual({ measured: 1, onTime: 1, rate: 1 });
  });

  it("reports no rate at all when nothing is measurable", () => {
    expect(onTimeSummary([job({ id: "o", state: "production" })])).toEqual({
      measured: 0,
      onTime: 0,
      rate: null,
    });
  });
});

describe("medianProductionHours", () => {
  it("takes the middle span for an odd count", () => {
    const jobs = [
      job({ id: "a", state: "delivered", readyAt: "2026-08-01T02:00:00.000Z", timeline: [tl("2026-08-01T00:00:00.000Z", "production")] }),
      job({ id: "b", state: "delivered", readyAt: "2026-08-01T10:00:00.000Z", timeline: [tl("2026-08-01T00:00:00.000Z", "production")] }),
      job({ id: "c", state: "delivered", readyAt: "2026-08-01T04:00:00.000Z", timeline: [tl("2026-08-01T00:00:00.000Z", "production")] }),
    ];
    expect(medianProductionHours(jobs)).toBe(4);
  });

  it("averages the two middle spans for an even count", () => {
    const jobs = [
      job({ id: "a", state: "delivered", readyAt: "2026-08-01T02:00:00.000Z", timeline: [tl("2026-08-01T00:00:00.000Z", "production")] }),
      job({ id: "b", state: "delivered", readyAt: "2026-08-01T06:00:00.000Z", timeline: [tl("2026-08-01T00:00:00.000Z", "production")] }),
    ];
    expect(medianProductionHours(jobs)).toBe(4);
  });

  it("ignores a job that was marked ready before it started", () => {
    const jobs = [
      job({ id: "backwards", state: "delivered", readyAt: "2026-07-01T00:00:00.000Z", timeline: [tl("2026-08-01T00:00:00.000Z", "production")] }),
      job({ id: "ok", state: "delivered", readyAt: "2026-08-01T03:00:00.000Z", timeline: [tl("2026-08-01T00:00:00.000Z", "production")] }),
    ];
    expect(medianProductionHours(jobs)).toBe(3);
  });

  it("returns null when nothing has both stamps", () => {
    expect(medianProductionHours([job({ id: "o", state: "production" })])).toBeNull();
  });
});

describe("finishedByWeek", () => {
  const now = new Date("2026-08-26T10:00:00.000Z"); // a Wednesday

  it("returns one bucket per week including empty ones", () => {
    const weeks = finishedByWeek([], 8, now);
    expect(weeks).toHaveLength(8);
    expect(weeks.every((w) => w.jobs === 0 && w.earningsMinor === 0)).toBe(true);
    expect(weeks.map((w) => w.weekStart)).toEqual([...weeks].sort((a, b) => a.weekStart - b.weekStart).map((w) => w.weekStart));
  });

  it("puts a finished job in the week it was marked ready", () => {
    const weeks = finishedByWeek(
      [job({ id: "a", state: "delivered", readyAt: "2026-08-25T08:00:00.000Z", supplierSubtotalMinor: 3000 })],
      8,
      now,
    );
    const last = weeks[weeks.length - 1];
    expect(last.jobs).toBe(1);
    expect(last.earningsMinor).toBe(3000);
    expect(weeks.slice(0, -1).every((w) => w.jobs === 0)).toBe(true);
  });

  it("adds several jobs finished in the same week together", () => {
    const weeks = finishedByWeek(
      [
        job({ id: "a", state: "delivered", readyAt: "2026-08-24T08:00:00.000Z", supplierSubtotalMinor: 1000 }),
        job({ id: "b", state: "delivered", readyAt: "2026-08-26T08:00:00.000Z", supplierSubtotalMinor: 2500 }),
      ],
      8,
      now,
    );
    const last = weeks[weeks.length - 1];
    expect(last.jobs).toBe(2);
    expect(last.earningsMinor).toBe(3500);
  });

  it("drops work finished before the window instead of folding it into week one", () => {
    const weeks = finishedByWeek(
      [job({ id: "ancient", state: "completed", readyAt: "2025-01-01T00:00:00.000Z", supplierSubtotalMinor: 9999 })],
      8,
      now,
    );
    expect(weeks.reduce((n, w) => n + w.jobs, 0)).toBe(0);
  });

  it("ignores a job that was never marked ready", () => {
    const weeks = finishedByWeek([job({ id: "open", state: "production", supplierSubtotalMinor: 9999 })], 8, now);
    expect(weeks.reduce((n, w) => n + w.earningsMinor, 0)).toBe(0);
  });
});

describe("stageCounts", () => {
  it("keeps pipeline order rather than ranking by size", () => {
    const stages = stageCounts([
      job({ id: "a", state: "delivered" }),
      job({ id: "b", state: "production" }),
      job({ id: "c", state: "production" }),
      job({ id: "d", state: "supplier_assigned" }),
    ]);
    expect(stages.map((s) => s.id)).toEqual(["decision", "production", "delivered"]);
    expect(stages.map((s) => s.jobs)).toEqual([1, 2, 1]);
  });

  it("collapses the payment states a shop cannot tell apart", () => {
    const stages = stageCounts([
      job({ id: "a", state: "awaiting_downpayment" }),
      job({ id: "b", state: "downpayment_review" }),
    ]);
    expect(stages).toHaveLength(1);
    expect(stages[0]).toMatchObject({ id: "payment", jobs: 2 });
  });

  it("drops stages the shop has nothing in", () => {
    expect(stageCounts([job({ id: "a", state: "production" })]).map((s) => s.id)).toEqual([
      "production",
    ]);
  });

  it("sums what each stage is worth to the shop", () => {
    const stages = stageCounts([
      job({ id: "a", state: "production", supplierSubtotalMinor: 1500 }),
      job({ id: "b", state: "production", supplierSubtotalMinor: 2500 }),
    ]);
    expect(stages[0].earningsMinor).toBe(4000);
  });
});

describe("unmappedStates", () => {
  it("names a state no stage claims, in plain language", () => {
    expect(unmappedStates([job({ id: "a", state: "needs_qa" })])).toEqual(["Needs QA review"]);
  });

  it("is empty when every job sits in a known stage", () => {
    expect(unmappedStates([job({ id: "a", state: "production" })])).toEqual([]);
  });
});
