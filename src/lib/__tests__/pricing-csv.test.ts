import { describe, expect, it } from "vitest";

import type { PricingReport } from "@/lib/api/client";
import { pricingCsv } from "@/lib/pricing-csv";

const period = {
  funnel: {
    counts: { product_viewed: 2, listing_viewed: 1, checkout_reached: 1, paid: 0, checkout_left: 1 },
    dropOff: 1,
    open: 0,
    paidInTime: 0,
    reached: 1,
    exitQuestion: { asked: false, message: "This question is not asked yet.", answers: [] },
  },
  operations: {
    note: "Average and median are a minimum. Only recorded actions are counted.",
    qualityCheck: { average: 1000, median: 1000, count: 1 },
    firstAction: { average: null, median: null, count: 0 },
    manualInterventions: 2,
  },
  reprints: { recorded: false, rate: null, cost: { known: false }, borneBy: null, note: "No reprint record is stored." },
  refunds: {
    orders: 0,
    rate: 0,
    gridgo: { known: true, minor: 0 },
    shop: { known: false },
    rider: { known: true, minor: 0 },
  },
  prices: {
    byCategory: [{ id: "flyers", label: "flyers", average: 10_000, median: 10_000, count: 1 }],
    byBracket: [{ id: "under_500", label: "Under ₱500", average: 10_000, median: 10_000, count: 1 }],
  },
  earnings: [{
    orderId: "ord_1",
    fee: { known: true, minor: 1_000 },
    effectiveFeeBps: 1_000,
    remains: { known: false },
    paymentFeeMinor: { known: true, minor: 100 },
    voucherMinor: { known: false },
    discountMinor: { known: true, minor: 0 },
    reprintShareMinor: { known: false },
    refundShareMinor: { known: true, minor: 0 },
    deliveryAbsorbedMinor: { known: true, minor: 0 },
  }],
};

const report: PricingReport = {
  scope: "Funnel counts use only events stored since this release.",
  brackets: [],
  filters: { from: "2026-10-01", to: "2026-10-07", category: "", bracket: "", accountType: "", cohort: "" },
  settings: { version: 3, fixedCostsMinor: 10_000, paymentFeeBps: 1_000 },
  period,
  compare: { ...period, funnel: { ...period.funnel, dropOff: 4 } },
  completedThisMonth: 6,
  breakEven: { known: true, orders: 12 },
};

describe("pricing CSV", () => {
  it("exports both periods and writes a missing cost as unknown", () => {
    const csv = pricingCsv(report);
    expect(csv).toContain("drop-off after 24 hours");
    expect(csv).toContain('"1"');
    expect(csv).toContain('"4"');
    expect(csv).toContain("This question is not asked yet.");
    expect(csv).toContain("ord_1 voucher minor");
    expect(csv).toContain("unknown");
    expect(csv).not.toMatch(/voucher minor","selected","0"/);
    expect(csv).toContain("orders per month");
    expect(csv).toContain('"12"');
    expect(csv).toContain("orders completed this month");
    expect(csv).toContain('"6"');
    expect(csv).toContain("compare");
  });
});
