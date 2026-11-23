import { describe, expect, it } from "vitest";

import {
  clientPaymentLine,
  historyAmount,
  historyLabel,
  howYouEarnLines,
  launchBonusLine,
  launchBonusSummary,
  matchesHistoryFilter,
  netLine,
  nextPayoutLine,
  payGridgoNotice,
  readShopMoney,
  readShopMoneySchedule,
  whenLabel,
  type ShopMoneyJob,
} from "@/lib/supplier-money";

/** 22 Nov 2026 (a Sunday), 10:00 Manila. */
const NOW = new Date("2026-11-22T02:00:00.000Z");

const SCHEDULE = readShopMoneySchedule({
  payoutTime: "16:00",
  minimumMinor: 10000,
  payDeadline: "18:00",
  reminderTime: "17:00",
  bonusRateBps: 2000,
  bonusDays: 7,
  bonusCapMinor: 50000,
  businessWeekdays: [1, 2, 3, 4, 5],
});

function body(overrides: Record<string, unknown> = {}) {
  return {
    balances: {
      owedMinor: 14400,
      owingMinor: 2300,
      netMinor: 12100,
      paidMinor: 0,
      overdue: false,
      paused: false,
      nextPayoutAt: "2026-11-23T08:00:00.000Z",
    },
    policy: { counterCashEnabled: false, version: 0 },
    history: [
      { id: "l1", kind: "entitlement", orderId: "ord_7c20aa", at: "2026-11-21T05:52:00.000Z", owedDeltaMinor: 7200, owingDeltaMinor: 0, data: {} },
      { id: "l2", kind: "payout", orderId: "ord_7c19aa", at: "2026-11-21T08:02:00.000Z", owedDeltaMinor: -6000, owingDeltaMinor: 0, data: { reference: "TX-7741" } },
      { id: "l3", kind: "recovery_due", orderId: null, at: "2026-11-21T09:00:00.000Z", owedDeltaMinor: 0, owingDeltaMinor: 2300 },
    ],
    jobs: [
      { orderId: "ord_7c20aa", createdAt: "2026-11-21T05:00:00.000Z", clientPayment: { methods: ["in_app_qr", "voucher"], settlement: "daily" }, shopPayMinor: 7200, bonus: null },
    ],
    earningsByDay: { "2026-11-21": 7200, "2026-11-20": 4000, bad: 1 },
    paymentMethods: { in_app_qr: 1, voucher: 1, cash_to_rider: 0 },
    payGridgo: null,
    ...overrides,
  };
}

describe("reading GET /me/shop-money", () => {
  it("reads both balances, the period, the jobs and the history", () => {
    const read = readShopMoney(body())!;
    expect(read.balances).toMatchObject({ owedMinor: 14400, owingMinor: 2300, netMinor: 12100 });
    expect(read.jobs[0].clientPayment.methods).toEqual(["in_app_qr", "voucher"]);
    expect(read.history.map((e) => e.id)).toEqual(["l3", "l2", "l1"]);
    expect(read.history[1].reference).toBe("TX-7741");
    expect(read.earningsByDay).toEqual([
      { day: "2026-11-20", amountMinor: 4000 },
      { day: "2026-11-21", amountMinor: 7200 },
    ]);
    expect(read.paymentMethods).toEqual({ in_app_qr: 1, voucher: 1 });
  });

  it("is null for a body without balances, so Money stays as it was", () => {
    expect(readShopMoney(null)).toBeNull();
    expect(readShopMoney({ jobs: [] })).toBeNull();
  });

  it("drops a Pay GRIDGO request GRIDGO has already covered", () => {
    const read = readShopMoney(
      body({ payGridgo: { requestId: "p1", amountMinor: 0, reference: "GG-1", deadlineAt: null } }),
    )!;
    expect(read.payGridgo).toBeNull();
  });
});

describe("the schedule", () => {
  it("is null when GRIDGO does not offer it", () => {
    expect(readShopMoneySchedule(undefined)).toBeNull();
    expect(readShopMoneySchedule({ payoutTime: "4 PM" })).toBeNull();
  });

  it("writes the three lines of How you earn from GRIDGO's numbers", () => {
    const lines = howYouEarnLines(SCHEDULE)!;
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("4:00 PM on business days");
    expect(lines[1]).toContain("₱100.00 minimum");
    expect(lines[1]).toContain("GRIDGO pays the transfer fee");
    expect(lines[2]).toBe(
      "Launch week: +20% on your shop pay for 7 days from your first order, up to ₱500.00.",
    );
    expect(howYouEarnLines(null)).toBeNull();
  });

  it("follows a changed schedule instead of hard-coded times", () => {
    const changed = readShopMoneySchedule({
      ...SCHEDULE,
      payoutTime: "15:30",
      minimumMinor: 5000,
      bonusRateBps: 0,
    });
    const lines = howYouEarnLines(changed)!;
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("3:30 PM");
    expect(lines[1]).toContain("₱50.00 minimum");
  });
});

describe("the balances", () => {
  const balances = readShopMoney(body())!.balances;

  it("says which way the net points", () => {
    expect(netLine(balances)).toEqual({ label: "GRIDGO pays you", tone: "owed" });
    expect(netLine({ ...balances, netMinor: -2300 })).toEqual({ label: "You pay GRIDGO", tone: "owing" });
    expect(netLine({ ...balances, netMinor: 0 })).toEqual({ label: "All square", tone: "even" });
  });

  it("names the next payout and its rule, never a promised amount", () => {
    const line = nextPayoutLine(balances, SCHEDULE, NOW)!;
    expect(line).toContain("Next payout tomorrow");
    expect(line).toContain("4:00 PM");
    expect(line).toContain("₱100.00 or more");
    expect(line).not.toContain("₱121.00");
  });

  it("says a net under the minimum rolls over", () => {
    expect(nextPayoutLine({ ...balances, netMinor: 6000 }, SCHEDULE, NOW)).toContain(
      "under the ₱100.00 minimum",
    );
  });

  it("gives a negative net its deadline", () => {
    expect(nextPayoutLine({ ...balances, netMinor: -2300 }, SCHEDULE, NOW)).toBe(
      "Still owed at 4:00 PM, it is due by 6:00 PM with Pay GRIDGO.",
    );
  });
});

describe("Pay GRIDGO", () => {
  const balances = readShopMoney(body())!.balances;
  const pay = {
    requestId: "p1",
    amountMinor: 3800,
    reference: "GG-PAY2210",
    deadlineAt: "2026-11-22T10:00:00.000Z",
    qrImageUrl: "/public/payment-qr?v=f1",
  };

  it("is due before 6 PM", () => {
    const notice = payGridgoNotice(pay, { ...balances, netMinor: -3800 }, NOW);
    expect(notice.tone).toBe("warning");
    expect(notice.title).toBe("Pay GRIDGO ₱38.00");
    expect(notice.body).toContain("Due today, 6:00 PM");
    expect(notice.body).toContain("new orders pause");
    expect(notice.action).toBe("Pay ₱38.00");
  });

  it("says new orders are paused after 6 PM, and that accepted jobs can finish", () => {
    const notice = payGridgoNotice(pay, { ...balances, netMinor: -3800, paused: true, overdue: true }, NOW);
    expect(notice.tone).toBe("error");
    expect(notice.title).toBe("New orders are paused");
    expect(notice.body).toContain("Jobs you already accepted can still be finished");
    expect(notice.body).toContain("GRIDGO team confirms your payment");
  });
});

describe("the launch-week bonus", () => {
  const job = (id: string, amountMinor: number): ShopMoneyJob => ({
    orderId: id,
    createdAt: "2026-11-21T05:00:00.000Z",
    clientPayment: { methods: ["in_app_qr"], settlement: "daily" },
    shopPayMinor: 7200,
    bonus: {
      amountMinor,
      firstOrderAt: "2026-11-21T00:00:00.000Z",
      days: 7,
      rateBps: 2000,
      capMinor: 50000,
    },
  });

  it("adds up the bonus per job and says when the week ends", () => {
    const summary = launchBonusSummary([job("a", 1440), job("b", 1200)], NOW)!;
    expect(summary).toMatchObject({ totalMinor: 2640, active: true, atCap: false, jobCount: 2 });
    expect(launchBonusLine(summary, NOW)).toBe(
      "+20% on your shop pay until Sat, 28 Nov, 8:00 AM, up to ₱500.00 in all.",
    );
  });

  it("says when the cap is reached", () => {
    const summary = launchBonusSummary([job("a", 40000), job("b", 10000)], NOW)!;
    expect(summary.atCap).toBe(true);
    expect(launchBonusLine(summary, NOW)).toBe(
      "You reached the ₱500.00 launch bonus cap. Jobs keep paying your usual shop pay.",
    );
  });

  it("says when the week is over", () => {
    const later = new Date("2026-12-05T00:00:00.000Z");
    const summary = launchBonusSummary([job("a", 1440)], later)!;
    expect(summary.active).toBe(false);
    expect(launchBonusLine(summary, later)).toContain("launch week has ended");
  });

  it("is absent with no bonus on any job", () => {
    expect(launchBonusSummary([{ ...job("a", 0) }], NOW)).toBeNull();
    expect(launchBonusSummary([{ ...job("a", 0), bonus: null }], NOW)).toBeNull();
  });
});

describe("how each job was paid", () => {
  it("names every method, mixed included", () => {
    expect(clientPaymentLine({ methods: ["in_app_qr"], settlement: "daily" })).toBe("Paid in app");
    expect(clientPaymentLine({ methods: ["in_app_qr", "voucher"], settlement: "daily" })).toBe(
      "Paid in app + voucher",
    );
    expect(clientPaymentLine({ methods: ["voucher"], settlement: "staged" })).toBe("Paid by voucher");
    expect(clientPaymentLine({ methods: ["cash_to_rider"], settlement: "staged" })).toBe(
      "Cash to the rider",
    );
    expect(clientPaymentLine({ methods: ["counter_cash"], settlement: "daily" })).toBe(
      "Cash at your counter",
    );
  });
});

describe("history", () => {
  const read = readShopMoney(body())!;

  it("names each balance change from the shop's side", () => {
    const [owing, payout, earned] = read.history;
    expect(historyLabel(earned)).toBe("Shop pay earned");
    expect(historyAmount(earned)).toEqual({ text: "+₱72.00", tone: "owed" });
    expect(historyLabel(payout)).toBe("Sent to your payout QR");
    expect(historyAmount(payout)).toEqual({ text: "₱60.00", tone: "even" });
    expect(historyLabel(owing)).toBe("Owed to GRIDGO");
    expect(historyAmount(owing)).toEqual({ text: "You owe ₱23.00", tone: "owing" });
  });

  it("filters jobs, payouts and what the shop owes", () => {
    const ids = (filter: Parameters<typeof matchesHistoryFilter>[1]) =>
      read.history.filter((e) => matchesHistoryFilter(e, filter)).map((e) => e.id);
    expect(ids("jobs")).toEqual(["l1"]);
    expect(ids("payouts")).toEqual(["l2"]);
    expect(ids("owed")).toEqual(["l3"]);
    expect(ids("all")).toHaveLength(3);
  });
});

describe("times are Davao time", () => {
  it("says today, tomorrow or the date", () => {
    expect(whenLabel("2026-11-22T08:00:00.000Z", NOW)).toBe("today, 4:00 PM");
    expect(whenLabel("2026-11-23T08:00:00.000Z", NOW)).toBe("tomorrow, 4:00 PM");
    expect(whenLabel("2026-11-25T08:00:00.000Z", NOW)).toMatch(/^Wed, 25 Nov, 4:00 PM$/);
    expect(whenLabel(null, NOW)).toBeNull();
  });
});
