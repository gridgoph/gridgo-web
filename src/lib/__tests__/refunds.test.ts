import { describe, expect, it } from "vitest";

import type { RefundAmounts, RefundRequest } from "@/lib/api/types";
import {
  canDecideRefund,
  canRecordTransfer,
  commandKeyCache,
  pendingShopSettlements,
  presentRefundStatus,
  refundInboxGroup,
  refundNeedsStaff,
  refundNextStep,
  settlementLedger,
} from "@/lib/refunds";

function refund(patch: Partial<RefundRequest> = {}): RefundRequest {
  return {
    id: "refund_1",
    orderId: "order_1",
    status: "requested",
    version: 1,
    policyVersion: "available_funds_v1",
    kind: "cancellation",
    reason: "The shop cannot fulfill this order.",
    evidenceFileIds: [],
    destination: {
      provider: "gcash",
      accountName: "Client Wallet Name",
      qrFileId: "file_qr",
      ownershipConfirmed: true,
      revision: 1,
    },
    beforeProduction: false,
    late: false,
    filingDeadlineAt: null,
    createdAt: "2026-09-28T04:00:00.000Z",
    updatedAt: "2026-09-28T04:00:00.000Z",
    history: [],
    settlement: null,
    payment: null,
    ...patch,
  };
}

/** The report's 40%-released example, exactly as the API previews it. */
const fortyReleased: RefundAmounts = {
  principalMinor: 60000,
  feeMinor: 6000,
  deliveryMinor: 5000,
  totalMinor: 71000,
  collected: { principalMinor: 100000, feeMinor: 10000, deliveryMinor: 5000 },
  previous: { principalMinor: 0, feeMinor: 0, deliveryMinor: 0 },
  releasedMinor: 40000,
  remainingShopMinor: 0,
  shopEntitlementMinor: 40000,
  riderEntitlementMinor: 0,
  availablePrincipalMinor: 60000,
};

describe("refund status words", () => {
  it("never reads an approval as money sent", () => {
    expect(presentRefundStatus("approved").label).toBe("Approved, not yet sent");
    expect(presentRefundStatus("payment_in_progress").label).not.toMatch(/paid|refunded/i);
    expect(presentRefundStatus("paid").label).toBe("Paid to the client");
    expect(presentRefundStatus("payment_unknown").tone).toBe("error");
  });
});

describe("who may act", () => {
  const ops = { role: "ops_admin", userId: "ops_1" };
  const other = { role: "ops_admin", userId: "ops_2" };
  const admin = { role: "super_admin", userId: "admin_1" };

  it("leaves late cases to Super Admin", () => {
    expect(canDecideRefund(refund(), ops)).toBe(true);
    expect(canDecideRefund(refund({ late: true }), ops)).toBe(false);
    expect(canDecideRefund(refund({ late: true }), admin)).toBe(true);
  });

  it("lets only the reserved payer or Super Admin record a transfer", () => {
    const reserved = refund({
      status: "payment_in_progress",
      attempt: {
        id: "rattempt_1",
        requestId: "refund_1",
        settlementId: "rsettle_1",
        payerId: "ops_1",
        status: "in_progress",
        destination: refund().destination!,
        amountMinor: 71000,
        provider: "gcash",
        sourceWallet: "ops-wallet-1",
        createdAt: "2026-09-28T04:25:00.000Z",
        updatedAt: "2026-09-28T04:25:00.000Z",
      },
    });
    expect(canRecordTransfer(reserved, ops)).toBe(true);
    expect(canRecordTransfer(reserved, other)).toBe(false);
    expect(canRecordTransfer(reserved, admin)).toBe(true);
    expect(refundNextStep(reserved, other)).toMatch(/another payer/);
  });
});

describe("the refund inbox", () => {
  it("puts an unconfirmed transfer first and a missing client QR aside", () => {
    expect(refundInboxGroup(refund({ status: "payment_unknown" }), "ops_admin")).toBe(
      "reconcile",
    );
    expect(refundInboxGroup(refund({ destination: null }), "ops_admin")).toBe("client-qr");
    expect(refundInboxGroup(refund(), "ops_admin")).toBe("review");
    expect(refundInboxGroup(refund({ status: "reviewed" }), "ops_admin")).toBe("settle");
    expect(refundInboxGroup(refund({ status: "destination_review" }), "ops_admin")).toBe(
      "review",
    );
    expect(refundInboxGroup(refund({ status: "approved" }), "ops_admin")).toBe("pay");
    expect(refundInboxGroup(refund({ status: "withdrawn" }), "ops_admin")).toBe("closed");
  });

  it("shows Operations a late case as Super Admin's, and Super Admin as theirs", () => {
    const late = refund({ late: true, status: "reviewed" });
    expect(refundInboxGroup(late, "ops_admin")).toBe("super-admin");
    expect(refundInboxGroup(late, "super_admin")).toBe("settle");
    expect(refundNeedsStaff(late, "ops_admin")).toBe(false);
    expect(refundNeedsStaff(late, "super_admin")).toBe(true);
    // A reserved transfer waits on its payer, not the whole desk.
    expect(refundNeedsStaff(refund({ status: "payment_in_progress" }), "ops_admin")).toBe(false);
  });

  it("lists only the live settlement's pending shop payout", () => {
    const payout = {
      id: "rspay_1",
      settlementId: "rsettle_1",
      orderId: "order_1",
      supplierId: "shop_1",
      amountMinor: 20000,
      status: "pending",
      reference: null,
      receiptFileId: null,
      releasedAt: null,
      releasedBy: null,
      createdAt: "2026-09-28T04:20:00.000Z",
      code: "refund_settlement",
      label: "Agreed refund settlement payout",
      releaseRequires: "",
    };
    const settled = refund({
      status: "approved",
      settlement: {
        id: "rsettle_1",
        principalMinor: 40000,
        feeMinor: 4000,
        deliveryMinor: 5000,
        totalMinor: 49000,
        disposition: "cancelled",
        reason: "Agreed",
      },
      supplierSettlementPayouts: [
        payout,
        { ...payout, id: "rspay_0", settlementId: "rsettle_0", status: "superseded" },
      ],
    });
    expect(pendingShopSettlements([settled]).map((row) => row.payout.id)).toEqual(["rspay_1"]);
  });
});

describe("the settlement ledger", () => {
  it("adds up the report's 40%-released example to ₱710", () => {
    const lines = settlementLedger(fortyReleased);
    expect(lines).toEqual([
      { label: "Verified from the client", minor: 115000, sign: "plus" },
      {
        label: "Already paid to the shop",
        minor: 40000,
        sign: "minus",
        note: "Never taken back.",
      },
      expect.objectContaining({ label: "Kept by GRIDGO", minor: 4000, sign: "minus" }),
      { label: "Refund to the client", minor: 71000, sign: "total" },
    ]);
  });

  it("protects the rider on the delivered example (₱275)", () => {
    const delivered: RefundAmounts = {
      ...fortyReleased,
      principalMinor: 25000,
      feeMinor: 2500,
      deliveryMinor: 0,
      totalMinor: 27500,
      releasedMinor: 75000,
      shopEntitlementMinor: 75000,
      riderEntitlementMinor: 4250,
      availablePrincipalMinor: 25000,
    };
    const lines = settlementLedger(delivered);
    expect(lines.find((line) => line.label === "Rider's earnings")?.minor).toBe(4250);
    // Fee on the fulfilled ₱750 and GRIDGO's delivery share stay with GRIDGO.
    expect(lines.find((line) => line.label === "Kept by GRIDGO")?.minor).toBe(8250);
    expect(lines.at(-1)).toEqual({
      label: "Refund to the client",
      minor: 27500,
      sign: "total",
    });
  });

  it("names a remaining shop obligation as its own line", () => {
    const lines = settlementLedger({
      ...fortyReleased,
      principalMinor: 40000,
      feeMinor: 4000,
      totalMinor: 49000,
      remainingShopMinor: 20000,
      shopEntitlementMinor: 60000,
    });
    expect(lines.find((line) => line.label === "Still owed to the shop")?.minor).toBe(20000);
    expect(lines.at(-1)?.minor).toBe(49000);
  });
});

describe("idempotency keys", () => {
  it("reuses a key for a retried body and mints one for a changed body", () => {
    let n = 0;
    const keyFor = commandKeyCache(() => `key_${++n}`);
    expect(keyFor({ a: 1 })).toBe("key_1");
    expect(keyFor({ a: 1 })).toBe("key_1");
    expect(keyFor({ a: 2 })).toBe("key_2");
  });
});
