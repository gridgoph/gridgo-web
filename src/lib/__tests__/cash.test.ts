import { describe, expect, it } from "vitest";

import type { CashReconciliation, CashTopupRow } from "@/lib/api/cash";
import type { FaultDecision, Issue, Order } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";
import {
  cashErrorMessage,
  cashErrorNeedsReload,
  checkErrorCopy,
  formatWait,
  journalAmount,
  journalLabel,
  noShowWaiting,
  reconciliationProblems,
  redeliveryWaiting,
  remedyCases,
  repaymentWaiting,
  sameReferenceTopups,
  shopFailurePath,
  sortTopups,
  tabFromSearch,
  topupStatus,
  waitingTopups,
  walletsFromLedger,
} from "@/lib/cash";
import {
  cashSettingsChanges,
  cashSettingsDraftError,
  parseCashDraft,
} from "@/lib/cash-settings";

function topup(id: string, at: string, decision: CashTopupRow["decision"] = null, ref = `REF-${id}`): CashTopupRow {
  return {
    id,
    kind: "topup_pending",
    rider_id: "rider-1",
    created_at: at,
    evidence: { reference: ref, amountMinor: 50_000, screenshotFileId: null },
    decision,
  };
}

function cashOrder(over: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    clientId: "client-1",
    supplierId: "shop-1",
    riderId: "rider-1",
    state: "rider_assigned",
    title: "Flyers",
    totalMinor: 120_000,
    cash: { method: "cash", version: 3, status: "due" },
    cashAmounts: { shopMinor: 80_000, collectMinor: 120_000, gridgoMinor: 24_000, riderMinor: 16_000 },
    cashProgress: {},
    ...over,
  } as Order;
}

describe("top-ups", () => {
  it("reads the decision journal as the status", () => {
    expect(topupStatus(topup("a", "2026-11-18T01:00:00Z"))).toBe("waiting");
    expect(topupStatus(topup("a", "2026-11-18T01:00:00Z", "topup_confirmed"))).toBe("confirmed");
    expect(topupStatus(topup("a", "2026-11-18T01:00:00Z", "topup_rejected"))).toBe("rejected");
  });

  it("puts waiting first, oldest first, then decided newest first", () => {
    const rows = [
      topup("decided-old", "2026-11-18T01:00:00Z", "topup_confirmed"),
      topup("wait-new", "2026-11-18T05:00:00Z"),
      topup("decided-new", "2026-11-18T04:00:00Z", "topup_rejected"),
      topup("wait-old", "2026-11-18T02:00:00Z"),
    ];
    expect(sortTopups(rows).map((r) => r.id)).toEqual([
      "wait-old",
      "wait-new",
      "decided-new",
      "decided-old",
    ]);
    expect(waitingTopups(rows)).toBe(2);
  });

  it("finds another top-up quoting the same reference, case and spaces aside", () => {
    const a = topup("a", "2026-11-18T01:00:00Z", null, "ABC123");
    const b = topup("b", "2026-11-18T02:00:00Z", "topup_confirmed", " abc123 ");
    const c = topup("c", "2026-11-18T03:00:00Z", null, "OTHER");
    expect(sameReferenceTopups([a, b, c], a).map((r) => r.id)).toEqual(["b"]);
  });
});

describe("order queues", () => {
  it("waits on a no-show only between the report and a decision", () => {
    expect(noShowWaiting(cashOrder({ cashProgress: { noShowReportedAt: "x" } }))).toBe(true);
    expect(
      noShowWaiting(cashOrder({ cashProgress: { noShowReportedAt: "x", noShowApprovedAt: "y" } })),
    ).toBe(false);
    expect(noShowWaiting(cashOrder())).toBe(false);
  });

  it("waits on the client's transfers until confirmed", () => {
    const submitted = { reference: "R1", proofFileId: "f", submittedAt: "t" };
    expect(repaymentWaiting(cashOrder({ cashProgress: { noShowApprovedAt: "a", repayment: submitted } }))).toBe(true);
    expect(
      repaymentWaiting(
        cashOrder({ cashProgress: { noShowApprovedAt: "a", repayment: submitted, repaymentConfirmedAt: "b" } }),
      ),
    ).toBe(false);
    expect(
      redeliveryWaiting(cashOrder({ cashProgress: { redelivery: { id: "rd", feeMinor: 5000, payment: submitted } } })),
    ).toBe(true);
    expect(
      redeliveryWaiting(
        cashOrder({ cashProgress: { redelivery: { id: "rd", feeMinor: 5000, payment: submitted, paidAt: "p" } } }),
      ),
    ).toBe(false);
  });

  it("cancels outright before the shop is paid and opens a claim after", () => {
    expect(shopFailurePath(cashOrder({ state: "supplier_assigned", riderId: null }))).toBe("cancel_unpaid");
    expect(shopFailurePath(cashOrder({ cashProgress: { shopPaidAt: "t" } }))).toBe("open_claim");
    expect(shopFailurePath(cashOrder({ state: "ready_for_dispatch", cashProgress: { shopPaidAt: "t" } }))).toBe(null);
    expect(shopFailurePath(cashOrder({ cashProgress: { shopPaidAt: "t", collectedAt: "c" } }))).toBe(null);
    expect(
      shopFailurePath(cashOrder({ cashProgress: { shopPaidAt: "t", incident: { amountMinor: 1, resolvedMinor: 0, remainingMinor: 1, status: "outstanding" } } })),
    ).toBe(null);
    expect(shopFailurePath(cashOrder({ state: "cancelled" }))).toBe(null);
    expect(shopFailurePath(cashOrder({ cash: undefined }))).toBe(null);
  });
});

describe("remedies", () => {
  const decision = (over: Partial<FaultDecision> = {}): FaultDecision => ({
    id: "dec-1",
    fault: "shop",
    remedy: "partial_refund",
    reason: "Wrong size",
    evidenceIds: ["delivery"],
    costMinor: 50_000,
    gridgoCostMinor: 20_000,
    recordedAt: "t",
    status: "approved",
    ...over,
  });
  const issue = (d: FaultDecision): Issue =>
    ({ id: "iss-1", orderId: "order-1", faultDecision: d } as unknown as Issue);
  const collected = (progress = {}) => cashOrder({ cashProgress: { collectedAt: "c", ...progress } });

  it("only lists paid-for remedies on collected cash orders, never the client's fault", () => {
    expect(remedyCases([cashOrder()], [issue(decision())])).toEqual([]);
    expect(remedyCases([collected()], [issue(decision({ fault: "client" }))])).toEqual([]);
    expect(remedyCases([collected()], [issue(decision({ remedy: "no_remedy" }))])).toEqual([]);
    expect(remedyCases([collected()], [issue(decision())])).toHaveLength(1);
  });

  it("waits for Super Admin above PHP 1,000 of GRIDGO funding", () => {
    const [big] = remedyCases([collected()], [issue(decision({ gridgoCostMinor: 100_001 }))]);
    expect(big.stage).toBe("needs_super_admin");
    const [approved] = remedyCases(
      [collected({ remedyDestination: { qrFileId: "q", accountName: "A", revision: 1 } })],
      [issue(decision({ gridgoCostMinor: 100_001, approvedBy: "super" }))],
    );
    expect(approved.stage).toBe("ready");
    const [pending] = remedyCases([collected()], [issue(decision({ status: "awaiting_approval" }))]);
    expect(pending.stage).toBe("needs_super_admin");
  });

  it("waits for the client's receiving QR on a refund, not on a reprint", () => {
    expect(remedyCases([collected()], [issue(decision())])[0].stage).toBe("waiting_destination");
    expect(remedyCases([collected()], [issue(decision({ remedy: "reprint", gridgoCostMinor: 50_000 }))])[0].stage).toBe(
      "ready",
    );
  });

  it("follows the reserved transfer for this decision only", () => {
    const remedy = { id: "r", decisionId: "dec-1", issueId: "iss-1", remedyType: "reprint", payerId: "me", amountMinor: 1, advanceMinor: 1, heldFeeMinor: 0 };
    const at = (status: string) =>
      remedyCases([collected({ remedy: { ...remedy, status } })], [issue(decision({ remedy: "reprint" }))])[0].stage;
    expect(at("reserved")).toBe("reserved");
    expect(at("unknown")).toBe("unknown");
    expect(at("paid")).toBe("paid");
    expect(at("failed")).toBe("ready");
  });
});

describe("wallets from the ledger", () => {
  const recon: CashReconciliation = {
    ok: true,
    orderChecks: [],
    journalChecks: [],
    invalidReservations: [],
    journals: [
      { id: "j1", kind: "wallet_reserved", order_id: "order-1", rider_id: "rider-1", evidence: {}, created_at: "2026-11-18T02:00:00Z", difference: "0" },
      { id: "j2", kind: "topup_confirmed", order_id: null, rider_id: "rider-1", evidence: { amountMinor: 50_000, reference: "R" }, created_at: "2026-11-18T01:00:00Z", difference: "0" },
    ],
    accounts: [
      { id: "wallet:rider-1", balanceMinor: "26000", derivedMinor: 26_000 },
      { id: "held:order-1", balanceMinor: 24_000, derivedMinor: 24_000 },
      { id: "pending_topup:rider-1", balanceMinor: -20_000, derivedMinor: -20_000 },
      { id: "wallet:rider-2", balanceMinor: 5_000, derivedMinor: 4_000 },
      { id: "gridgo_bank", balanceMinor: 50_000, derivedMinor: 50_000 },
    ],
  };

  it("adds reservations to the rider who made them and flags mismatches", () => {
    const rows = walletsFromLedger(recon);
    expect(rows).toEqual([
      expect.objectContaining({ riderId: "rider-2", availableMinor: 5_000, lowBalance: true, ok: false }),
      expect.objectContaining({
        riderId: "rider-1",
        availableMinor: 26_000,
        reservedMinor: 24_000,
        balanceMinor: 50_000,
        pendingTopupMinor: 20_000,
        lowBalance: false,
        ok: true,
      }),
    ]);
    expect(reconciliationProblems(recon)).toBe(1);
  });

  it("names every movement in plain words and reads reservation amounts from the order", () => {
    expect(journalLabel("shop_paid")).toBe("Shop paid in cash");
    expect(journalLabel("something_new")).toBe("Other cash movement");
    const orders = new Map([["order-1", cashOrder()]]);
    expect(journalAmount(recon.journals[0], orders)).toBe(24_000);
    expect(journalAmount(recon.journals[1], orders)).toBe(50_000);
  });

  it("reads reconciliation errors in plain words", () => {
    expect(checkErrorCopy("cash_abc:amount_mismatch")).toMatch(/does not match/);
    expect(checkErrorCopy("shop_paid:duplicate")).toMatch(/twice/);
    expect(checkErrorCopy("collection_and_no_show")).toMatch(/both collected/);
    expect(checkErrorCopy("brand_new")).toBe("a movement does not reconcile");
  });
});

describe("errors and words", () => {
  it("maps API codes to recovery copy and knows when to reload", () => {
    const stale = new ApiError(409, { error: "cash_stale" });
    expect(cashErrorMessage(stale, "fallback")).toMatch(/changed this cash order/);
    expect(cashErrorNeedsReload(stale)).toBe(true);
    expect(cashErrorMessage(new Error("boom"), "fallback")).toBe("fallback");
    const dup = new ApiError(409, { error: "cash_transfer_duplicate" });
    expect(cashErrorMessage(dup, "f")).toMatch(/already confirmed/);
    expect(cashErrorNeedsReload(dup)).toBe(false);
  });

  it("reads tabs and waits", () => {
    expect(tabFromSearch(null)).toBe("topups");
    expect(tabFromSearch("ledger")).toBe("ledger");
    expect(tabFromSearch("nonsense")).toBe("topups");
    expect(formatWait(600)).toBe("10 minutes");
    expect(formatWait(60)).toBe("1 minute");
    expect(formatWait(5400)).toBe("1 hour 30 minutes");
    expect(formatWait(7200)).toBe("2 hours");
  });
});

describe("cash settings", () => {
  const draft = { enabled: true, limitPesos: "1500.00", waitMinutes: "10", countdownSeconds: "30" };
  const stored = { enabled: false, limitMinor: 150_000, noShowWaitSeconds: 600 };

  it("checks the API's bounds before Save", () => {
    expect(cashSettingsDraftError(draft)).toBeNull();
    expect(cashSettingsDraftError({ ...draft, limitPesos: "0" })?.field).toBe("limit");
    expect(cashSettingsDraftError({ ...draft, limitPesos: "1,5x" })?.field).toBe("limit");
    expect(cashSettingsDraftError({ ...draft, waitMinutes: "0" })?.field).toBe("wait");
    expect(cashSettingsDraftError({ ...draft, waitMinutes: "121" })?.field).toBe("wait");
    expect(cashSettingsDraftError({ ...draft, waitMinutes: "2.5" })?.field).toBe("wait");
    expect(cashSettingsDraftError({ ...draft, countdownSeconds: "9" })?.field).toBe("countdown");
    expect(cashSettingsDraftError({ ...draft, countdownSeconds: "121" })?.field).toBe("countdown");
  });

  it("sends only what changed", () => {
    const parsed = parseCashDraft(draft)!;
    expect(cashSettingsChanges(stored, 30, parsed)).toEqual({ cash: { enabled: true } });
    expect(
      cashSettingsChanges(stored, 30, parseCashDraft({ ...draft, enabled: false, limitPesos: "2000", waitMinutes: "15", countdownSeconds: "45" })!),
    ).toEqual({ cash: { limitMinor: 200_000, noShowWaitSeconds: 900 }, countdown: 45 });
    expect(cashSettingsChanges(stored, 30, parseCashDraft({ ...draft, enabled: false })!)).toEqual({ cash: {} });
  });
});
