import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { ShopMoneyRun, ShopMoneyRunShop, ShopMoneyTransfer } from "@/lib/api/types";
import {
  activeBalances,
  balanceStatus,
  canActOnTransfer,
  clockWords,
  heldReason,
  heldSummary,
  itemLabel,
  manilaInputToIso,
  manilaLocalInput,
  openTransfers,
  parseDateList,
  runRows,
  runTotals,
  SHOP_MONEY_DEFAULTS,
  shopMoneyChangeSummary,
  shopMoneyErrorMessage,
  shopMoneyNeedsAction,
  shopMoneySettingsProblems,
  transferRecordBlockers,
} from "@/lib/shop-money";

const balances = { owedMinor: 0, owingMinor: 0, netMinor: 0, paidMinor: 0, overdue: false, paused: false, nextPayoutAt: null };

function runShop(supplierId: string, over: Partial<ShopMoneyRunShop> = {}): ShopMoneyRunShop {
  return { supplierId, ...balances, availableMinor: 0, amountMinor: 0, rolloverMinor: 0, items: [], held: [], ...over };
}

function transfer(supplierId: string, status: ShopMoneyTransfer["status"], over: Partial<ShopMoneyTransfer["data"]> = {}, at = "2026-11-24T08:05:00Z"): ShopMoneyTransfer {
  return {
    id: `t_${supplierId}_${status}`,
    at,
    key: `transfer:run_1:${supplierId}`,
    supplierId,
    kind: "transfer_reserved",
    status,
    data: {
      items: [{ key: `stage:o1:delivered`, orderId: "o1", amountMinor: 50000, netAmountMinor: 50000 }],
      held: [],
      netAmountMinor: 50000,
      grossAmountMinor: 50000,
      runId: "run_1",
      payerId: "ops_1",
      payoutAccount: { supplierId, provider: "other", accountName: "Owner", accountNumber: null, institution: null, qr: null, version: 1, updatedAt: "" },
      ...over,
    },
  };
}

const run: ShopMoneyRun = {
  id: "run_1",
  at: "2026-11-24T08:00:00Z",
  key: "run:2026-11-24",
  kind: "settlement_run",
  data: {
    date: "2026-11-24",
    minimumMinor: 10000,
    payoutTime: "16:00",
    shops: [
      runShop("ready", { amountMinor: 120000, items: [{ key: "stage:o2:delivered", orderId: "o2", amountMinor: 120000, netAmountMinor: 120000 }] }),
      runShop("small", { availableMinor: 4800, rolloverMinor: 4800 }),
      runShop("held", { held: [{ key: "stage:o3:delivered", reason: "payout_held" }] }),
      runShop("idle"),
      runShop("prepared", { amountMinor: 50000, items: [{ key: "stage:o1:delivered", orderId: "o1", amountMinor: 50000, netAmountMinor: 50000 }] }),
      runShop("sent", { amountMinor: 30000, items: [{ key: "stage:o4:delivered", orderId: "o4", amountMinor: 30000, netAmountMinor: 30000 }] }),
    ],
  },
};

describe("the daily run", () => {
  const transfers = [transfer("prepared", "transfer_reserved"), transfer("sent", "transfer_paid")];

  it("puts each shop in one lane, money in flight first, and leaves out shops with nothing", () => {
    const rows = runRows(run, transfers);
    expect(rows.map((r) => [r.shop.supplierId, r.lane])).toEqual([
      ["prepared", "in_flight"],
      ["ready", "to_send"],
      ["sent", "done"],
      ["small", "rolled_over"],
      ["held", "held"],
    ]);
    expect(runTotals(rows)).toEqual({ toSendMinor: 120000, toSend: 1, inFlight: 1, done: 1 });
  });

  it("matches a transfer to its own run only", () => {
    const other = transfer("ready", "transfer_paid", { runId: "run_0" });
    expect(runRows(run, [other]).find((r) => r.shop.supplierId === "ready")?.lane).toBe("to_send");
  });

  it("counts prepared and unknown transfers for the rail, unknown first", () => {
    const list = [
      transfer("a", "transfer_reserved", {}, "2026-11-24T08:01:00Z"),
      transfer("b", "transfer_unknown", {}, "2026-11-24T08:09:00Z"),
      transfer("c", "transfer_paid"),
      transfer("d", "transfer_cancelled"),
    ];
    expect(openTransfers(list).map((t) => t.supplierId)).toEqual(["b", "a"]);
    expect(shopMoneyNeedsAction({ transfers: list })).toBe(2);
  });
});

describe("who may finish a transfer", () => {
  const t = transfer("x", "transfer_reserved");
  it("is the person who prepared it, or Super Admin", () => {
    expect(canActOnTransfer(t, { userId: "ops_1", superAdmin: false })).toBe(true);
    expect(canActOnTransfer(t, { userId: "ops_2", superAdmin: false })).toBe(false);
    expect(canActOnTransfer(t, { userId: undefined, superAdmin: false })).toBe(false);
    expect(canActOnTransfer(t, { userId: "admin", superAdmin: true })).toBe(true);
  });
});

describe("recording a transfer", () => {
  const now = Date.parse("2026-11-24T09:00:00Z");
  const good = {
    typedAmount: 50000,
    paidAtIso: "2026-11-24T08:30:00.000Z",
    reference: "REF 123",
    hasReceipt: true,
    confirmed: true,
    reason: "Sent",
  };
  it("passes only with the exact frozen amount, a past time, a reference, the receipt, a note and the tick", () => {
    expect(transferRecordBlockers(50000, good, now)).toEqual([]);
    expect(transferRecordBlockers(50000, { ...good, typedAmount: 50001 }, now)[0]).toMatch(/not the prepared ₱500\.00/);
    expect(transferRecordBlockers(50000, { ...good, typedAmount: null }, now)).toContain("Type the amount you sent.");
    expect(transferRecordBlockers(50000, { ...good, paidAtIso: "2026-11-24T09:30:00.000Z" }, now)).toContain(
      "The time sent cannot be in the future.",
    );
    expect(transferRecordBlockers(50000, { ...good, reference: "  " }, now)).toContain("Enter the reference number from the receipt.");
    expect(transferRecordBlockers(50000, { ...good, reference: "x".repeat(81) }, now)).toContain("The reference is longer than 80 characters.");
    expect(transferRecordBlockers(50000, { ...good, hasReceipt: false }, now)).toContain("Add the receipt screenshot.");
    expect(transferRecordBlockers(50000, { ...good, confirmed: false }, now)).toContain("Tick that the money was sent.");
  });

  it("reads the time sent as Manila time, the same way on every retry", () => {
    expect(manilaInputToIso("2026-11-24T16:05")).toBe("2026-11-24T08:05:00.000Z");
    expect(manilaInputToIso("2026-11-24T16:05")).toBe(manilaInputToIso("2026-11-24T16:05"));
    expect(manilaInputToIso("not a time")).toBeNull();
    expect(manilaLocalInput(Date.parse("2026-11-24T08:05:00Z"))).toBe("2026-11-24T16:05");
  });
});

describe("items and holds", () => {
  it("names what an item pays for", () => {
    expect(itemLabel("stage:o1:delivered")).toBe("Delivered");
    expect(itemLabel("stage:o1:production_started")).toBe("Start of production");
    expect(itemLabel("bonus:o1:shop")).toBe("Launch-week bonus");
    expect(itemLabel("change:o1:chg")).toBe("Paid change extra");
    expect(itemLabel("settlement:rsp_1")).toBe("Refund settlement remainder");
  });
  it("groups holds by reason in plain words", () => {
    expect(heldReason("verification_payout_cap")).toMatch(/payout cap/);
    expect(heldReason("something_new")).toBe("Waiting on another check");
    expect(
      heldSummary([
        { reason: "delivery_required" },
        { reason: "payout_held" },
        { reason: "delivery_required" },
      ]),
    ).toEqual([
      { reason: "delivery_required", label: "Waiting for delivery", count: 2 },
      { reason: "payout_held", label: "A claim, issue or refund request holds it", count: 1 },
    ]);
  });
});

describe("balances", () => {
  it("lists paused and owing shops first, and hides shops with no money at all", () => {
    const rows = [
      { supplierId: "even", ...balances },
      { supplierId: "owed", ...balances, owedMinor: 9000, netMinor: 9000 },
      { supplierId: "owes", ...balances, owingMinor: 3000, netMinor: -3000 },
      { supplierId: "paused", ...balances, owingMinor: 1000, netMinor: -1000, paused: true, overdue: true },
      { supplierId: "paid", ...balances, paidMinor: 5000 },
    ];
    expect(activeBalances(rows).map((r) => r.supplierId)).toEqual(["paused", "owes", "owed", "paid"]);
    expect(balanceStatus(rows[3]).label).toBe("New orders paused");
    expect(balanceStatus(rows[2]).label).toBe("Owes GRIDGO");
    expect(balanceStatus(rows[0]).label).toBe("Settled");
  });
});

describe("payout settings", () => {
  it("mirrors the API's checks before saving", () => {
    expect(shopMoneySettingsProblems(SHOP_MONEY_DEFAULTS)).toEqual({});
    expect(shopMoneySettingsProblems({ ...SHOP_MONEY_DEFAULTS, reminderTime: "15:00" }).reminderTime).toBeTruthy();
    expect(shopMoneySettingsProblems({ ...SHOP_MONEY_DEFAULTS, payDeadline: "16:30" }).payDeadline).toBeTruthy();
    expect(shopMoneySettingsProblems({ ...SHOP_MONEY_DEFAULTS, minimumMinor: 0 }).minimumMinor).toBeTruthy();
    expect(shopMoneySettingsProblems({ ...SHOP_MONEY_DEFAULTS, bonusRateBps: 10001 }).bonusRateBps).toBeTruthy();
    expect(shopMoneySettingsProblems({ ...SHOP_MONEY_DEFAULTS, businessWeekdays: [] }).businessWeekdays).toBeTruthy();
  });

  it("summarises exactly what changed for the confirmation and the audit reason", () => {
    expect(
      shopMoneyChangeSummary(SHOP_MONEY_DEFAULTS, {
        ...SHOP_MONEY_DEFAULTS,
        payoutTime: "15:30",
        minimumMinor: 15000,
        businessWeekdays: [1, 2, 3, 4, 5, 6],
        holidays: ["2026-12-25"],
      }),
    ).toEqual([
      "payout time 16:00 → 15:30",
      "minimum ₱100.00 → ₱150.00",
      "payout days Mon Tue Wed Thu Fri → Mon Tue Wed Thu Fri Sat",
      "holidays (1)",
    ]);
    expect(shopMoneyChangeSummary(SHOP_MONEY_DEFAULTS, SHOP_MONEY_DEFAULTS)).toEqual([]);
  });

  it("reads holiday lists and names the first bad date", () => {
    expect(parseDateList("2026-12-25\n2026-12-24, 2026-12-25")).toEqual({ dates: ["2026-12-24", "2026-12-25"] });
    expect(parseDateList("2026-02-30")).toEqual({ bad: "2026-02-30" });
    expect(parseDateList("")).toEqual({ dates: [] });
    expect(clockWords("16:00")).toBe("4:00 PM");
    expect(clockWords("00:30")).toBe("12:30 AM");
  });
});

describe("errors", () => {
  it("names the way out for each money refusal", () => {
    expect(shopMoneyErrorMessage(new ApiError(403, { error: "verification_payer_required" }), "x")).toMatch(/Another person prepared/);
    expect(shopMoneyErrorMessage(new ApiError(409, { error: "payment_amount_changed" }), "x")).toMatch(/changed since you opened/);
    expect(shopMoneyErrorMessage(new TypeError("fetch failed"), "x")).toMatch(/Reload to see whether it was recorded/);
    expect(shopMoneyErrorMessage(new Error("boom"), "fallback")).toBe("fallback");
  });
});
