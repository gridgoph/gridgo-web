import { describe, expect, it } from "vitest";

import {
  ledgerLine,
  missingPapers,
  moneyVerifyBanner,
  queueOrder,
  readQueueEntry,
  readQueuePage,
  readShopVerification,
  readVerification,
  staffDaysLine,
  staffLedger,
  staffStatus,
  todoVerifyNotice,
  verificationBenefits,
  waitingPayouts,
  readLedger,
  type ShopVerification,
  type VerificationFile,
  type VerificationQueueEntry,
} from "@/lib/shop-verification";

/** A fresh pending shop; the cap is deliberately not ₱5,000 so nothing can pass by hard-coding it. */
function summary(over: Partial<Record<keyof ShopVerification, unknown>> = {}) {
  return {
    verified: false,
    verificationState: "not_submitted",
    startedAt: "2026-11-01T00:00:00Z",
    deadlineAt: "2026-12-01T00:00:00Z",
    daysLeft: 22,
    countdownDays: null,
    payoutCapMinor: 730000,
    paidBeforeVerificationMinor: 124000,
    remainingCapMinor: 606000,
    capReached: false,
    heldMinor: 0,
    recoveryDueMinor: 0,
    paidOpenRegularJobs: 1,
    newOrdersPaused: false,
    ...over,
  };
}

function v(over: Partial<Record<keyof ShopVerification, unknown>> = {}): ShopVerification {
  const read = readVerification(summary(over));
  if (!read) throw new Error("summary did not read");
  return read;
}

function file(paper: string, at = "2026-11-20T06:14:00Z") {
  return { fileId: `file_${paper}`, readyAt: at, references: [{ type: "user", id: "u", documentType: paper }] };
}

const ALL = ["valid_id", "id_selfie", "business_permit"] as const;
const files = (...papers: string[]): VerificationFile[] =>
  readShopVerification({ verification: summary(), verificationDocuments: papers.map((p) => file(p)) })!.files;

const SHAMING = /unverified|lost|penalt|blocked|held back|not verified/i;

describe("reading GRIDGO's verification summary", () => {
  it("returns null when GRIDGO sent no summary, so nothing new is drawn", () => {
    expect(readShopVerification(null)).toBeNull();
    expect(readShopVerification({})).toBeNull();
    expect(readShopVerification({ verification: { daysLeft: 3 } })).toBeNull();
  });

  it("keeps the server's figures and drops a countdown for a verified shop", () => {
    const read = readVerification(summary({ verified: true, verificationState: undefined, countdownDays: 3, capReached: true }))!;
    expect(read.verificationState).toBe("verified");
    expect(read.countdownDays).toBeNull();
    expect(read.capReached).toBe(false);
    expect(v().payoutCapMinor).toBe(730000);
  });

  it("types papers from the attach reference or the direct field, and keeps the older photo of work apart", () => {
    const read = readShopVerification({
      verification: summary(),
      verificationDocuments: [
        file("valid_id"),
        { fileId: "f2", verificationDocumentType: "id_selfie", createdAt: "2026-11-20T00:00:00Z" },
        file("sample_work"),
        { nope: true },
      ],
    })!;
    expect(read.files.map((f) => f.paper)).toEqual(["valid_id", "id_selfie", null]);
    expect(read.files[2]!.sampleWork).toBe(true);
    expect(missingPapers(read.files)).toEqual(["business_permit"]);
  });

  it("lists a payout as waiting only while its latest ledger entry is held", () => {
    const ledger = readLedger([
      { id: "1", kind: "held", payoutKey: "stage:o1:delivered", orderId: "o1", amountMinor: 86000, data: { reason: "verification_payout_cap" } },
      { id: "2", kind: "held", payoutKey: "stage:o2:start", orderId: "o2", amountMinor: 40000, data: { reason: "verification_open_jobs" } },
      { id: "3", kind: "held", payoutKey: "stage:o3:start", orderId: "o3", amountMinor: 20000, data: {} },
      { id: "4", kind: "available", payoutKey: "stage:o3:start", orderId: "o3", amountMinor: 20000 },
    ]);
    expect(waitingPayouts(ledger)).toEqual([
      { key: "stage:o1:delivered", orderId: "o1", amountMinor: 86000, reason: "cap" },
      { key: "stage:o2:start", orderId: "o2", amountMinor: 40000, reason: "open_jobs" },
    ]);
  });
});

describe("the shop's To do card", () => {
  it("says nothing to a verified shop", () => {
    expect(todoVerifyNotice(v({ verified: true }), [])).toBeNull();
    expect(moneyVerifyBanner(v({ verified: true }), [])).toBeNull();
  });

  it("is a short pitch with no countdown before the last week", () => {
    const n = todoVerifyNotice(v(), [...ALL])!;
    expect(n.title).toBe("Get verified, get more jobs");
    expect(n.chip).toBeNull();
    expect(n.action).toBe("Get verified");
    expect(n.tone).toBe("neutral");
  });

  it("counts down only in the last seven days", () => {
    const n = todoVerifyNotice(v({ daysLeft: 5, countdownDays: 5 }), [...ALL])!;
    expect(n.title).toBe("Get verified to keep getting orders");
    expect(n.chip).toBe("5 days left");
    expect(todoVerifyNotice(v({ daysLeft: 1, countdownDays: 1 }), [...ALL])!.chip).toBe("1 day left");
  });

  it("notes the cap from the server when it is reached", () => {
    const n = todoVerifyNotice(v({ capReached: true }), [...ALL])!;
    expect(n.title).toBe("Payouts over ₱7,300.00 are waiting");
    expect(n.body).toContain("paid in full once you're verified");
  });

  it("names the papers still missing while some are being checked", () => {
    const n = todoVerifyNotice(v({ verificationState: "being_checked" }), ["id_selfie", "business_permit"])!;
    expect(n.title).toBe("Finish getting verified");
    expect(n.body).toContain("a selfie with your ID and your business permit");
    expect(n.action).toBe("Finish verifying");
  });

  it("goes quiet while every paper is being checked, until the last week", () => {
    expect(todoVerifyNotice(v({ verificationState: "being_checked" }), [])).toBeNull();
    const n = todoVerifyNotice(v({ verificationState: "being_checked", countdownDays: 4 }), [])!;
    expect(n.title).toBe("GRIDGO is checking your papers");
    expect(n.action).toBeNull();
  });

  it("explains a pause when the window ended, and that open jobs still finish", () => {
    const n = todoVerifyNotice(v({ newOrdersPaused: true, daysLeft: 0, countdownDays: 0 }), [...ALL])!;
    expect(n.tone).toBe("warning");
    expect(n.title).toBe("New orders are paused");
    expect(n.body).toContain("Your open jobs still finish");
  });

  it("explains a pause after a dropped job with the amount to recover", () => {
    const n = todoVerifyNotice(v({ newOrdersPaused: true, recoveryDueMinor: 86000 }), [...ALL])!;
    expect(n.body).toContain("₱860.00 will come out of your next payouts");
  });

  it("never uses a shaming word", () => {
    const states = [
      v(),
      v({ countdownDays: 3 }),
      v({ capReached: true }),
      v({ newOrdersPaused: true }),
      v({ recoveryDueMinor: 100 }),
      v({ verificationState: "being_checked", countdownDays: 2 }),
    ];
    for (const s of states) {
      for (const missing of [[...ALL], ["business_permit" as const], []]) {
        const notes = [todoVerifyNotice(s, missing), moneyVerifyBanner(s, missing)];
        for (const n of notes) if (n) expect(`${n.title} ${n.body} ${n.chip ?? ""}`).not.toMatch(SHAMING);
      }
    }
    for (const b of verificationBenefits(v())) expect(`${b.title} ${b.detail}`).not.toMatch(SHAMING);
  });
});

describe("the shop's Money banner", () => {
  it("shows what was paid against the server's cap", () => {
    const n = moneyVerifyBanner(v(), [...ALL])!;
    expect(n.title).toBe("Get verified to unlock payouts over ₱7,300.00");
    expect(n.body).toBe("₱1,240.00 of ₱7,300.00 paid out so far.");
  });

  it("adds the recovery and the checking state", () => {
    const n = moneyVerifyBanner(v({ capReached: true, recoveryDueMinor: 86000, verificationState: "being_checked" }), [])!;
    expect(n.title).toBe("Payouts over ₱7,300.00 are waiting");
    expect(n.body).toContain("₱860.00 from a dropped job");
    expect(n.body).toContain("GRIDGO is checking your papers.");
    expect(n.action).toBeNull();
  });
});

function entry(over: Partial<VerificationQueueEntry> & { v?: Partial<Record<keyof ShopVerification, unknown>> } = {}) {
  const { v: vo, ...rest } = over;
  return {
    supplierId: "s1",
    approvalCaseId: "c1",
    approvalStatus: "pending",
    shopName: "Shop A",
    verification: v(vo),
    files: [],
    ledger: null,
    ...rest,
  } as VerificationQueueEntry;
}

describe("the staff queue", () => {
  it("reads the queue page and a detail entry", () => {
    const page = readQueuePage({
      suppliers: [
        { supplierId: "s1", approvalCaseId: "c1", approvalStatus: "pending", shopName: "Shop A", verification: summary(), verificationDocuments: [file("valid_id")] },
        { supplierId: "s2" },
      ],
      nextCursor: "abc",
    })!;
    expect(page.entries).toHaveLength(1);
    expect(page.nextCursor).toBe("abc");
    expect(page.entries[0]!.ledger).toBeNull();
    const detail = readQueueEntry({ ...page.entries[0], supplierId: "s1", approvalCaseId: "c1", verification: summary(), ledger: [] });
    expect(detail!.ledger).toEqual([]);
    expect(readQueuePage({})).toBeNull();
  });

  it("shows staff the days left at any time, not only in the last week", () => {
    expect(staffDaysLine(v())).toBe("22 days left");
    expect(staffDaysLine(v({ daysLeft: 0 }))).toBe("Window ended");
    expect(staffDaysLine(v({ verified: true }))).toBe("Verified");
    expect(staffDaysLine(v({ deadlineAt: null }))).toBe("No window on record");
  });

  it("gives each shop one status, a pause first", () => {
    expect(staffStatus(entry({ v: { recoveryDueMinor: 5 } })).label).toBe("Paused: money to recover");
    expect(staffStatus(entry({ v: { newOrdersPaused: true, daysLeft: 0 } })).label).toBe("Paused: window ended");
    // Paused with days still left (a closed account, a home printer waiting on review) never blames the window.
    expect(staffStatus(entry({ v: { newOrdersPaused: true } })).label).toBe("New orders paused");
    expect(staffStatus(entry()).label).toBe("No papers yet");
    expect(staffStatus(entry({ v: { verificationState: "being_checked" }, files: files("valid_id") })).label).toBe("Some papers sent");
    expect(staffStatus(entry({ v: { verificationState: "being_checked" }, files: files(...ALL) })).label).toBe("Ready to check");
    expect(staffStatus(entry({ approvalStatus: "approved" })).label).toBe("Verified");
    expect(staffStatus(entry({ approvalStatus: "rejected" })).label).toBe("Rejected");
  });

  it("puts paused shops first, then the fewest days left", () => {
    const rows = [
      entry({ supplierId: "late", shopName: "B", v: { daysLeft: 20 } }),
      entry({ supplierId: "soon", shopName: "C", v: { daysLeft: 3 } }),
      entry({ supplierId: "paused", shopName: "D", v: { daysLeft: 25, recoveryDueMinor: 1 } }),
    ];
    expect(rows.sort(queueOrder).map((r) => r.supplierId)).toEqual(["paused", "soon", "late"]);
  });

  it("reads the ledger newest first in staff words, skipping bookkeeping facts", () => {
    const ledger = readLedger([
      { id: "1", kind: "released", amountMinor: 50000, at: "2026-11-02T00:00:00Z" },
      { id: "2", kind: "recovery_assessment", amountMinor: 0 },
      { id: "3", kind: "held", amountMinor: 30000, data: { reason: "verification_open_jobs" } },
    ]);
    expect(staffLedger(ledger).map((r) => r.entry.id)).toEqual(["3", "1"]);
    expect(ledgerLine(ledger[2]!)).toContain("two regular jobs");
    expect(ledgerLine(ledger[0]!)).toBe("Paid out");
  });
});
