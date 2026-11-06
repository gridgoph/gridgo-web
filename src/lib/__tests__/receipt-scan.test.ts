import { describe, expect, it } from "vitest";

import type { Order } from "@/lib/api/types";
import type { ProductionCorrection } from "@/lib/production-progress";
import {
  earlierReceiptScans,
  receiptScanHoldsDispatch,
  receiptScanMark,
  receiptScanOf,
  receiptScanRowState,
  receiptScanRowVisible,
  receiptScanSkippedAt,
  receiptScanSummary,
  receiptScanSwitch,
  receiptScanSwitchReason,
} from "@/lib/receipt-scan";

const SCANNED = {
  attached: true,
  fileIds: ["file_a", "file_b"],
  latestFileId: "file_b",
  latestUploadedAt: "2026-11-02T03:00:00.000Z",
};
const NONE = { attached: false, fileIds: [], latestFileId: null, latestUploadedAt: null };

function order(patch: Partial<Order>): Order {
  return { id: "o1", state: "production", ...patch } as Order;
}

function gate(required: boolean, attached = false): Order["transitionReadiness"] {
  return {
    ready_for_dispatch: {
      allowed: !required || attached,
      missing: required && !attached ? [{ code: "receipt_scan_required", message: "…" }] : [],
      receiptScan: { required, attached },
    },
  };
}

describe("receipt scan", () => {
  it("reads the Finance switch, and null on an API without it", () => {
    expect(receiptScanSwitch({ shopReceiptScanRequired: true })).toBe(true);
    expect(receiptScanSwitch({ shopReceiptScanRequired: false })).toBe(false);
    expect(receiptScanSwitch({})).toBeNull();
    expect(receiptScanSwitchReason(true, "  app ships  ")).toBe(
      "Finance: receipt scan before calling a rider turned on. app ships",
    );
  });

  it("cleans the order's scans and lists earlier ones newest first", () => {
    expect(receiptScanOf(order({}))).toBeNull();
    const scan = receiptScanOf(order({ receiptScan: { ...SCANNED, fileIds: ["a", "b", "c"], latestFileId: "c" } }))!;
    expect(earlierReceiptScans(scan)).toEqual(["b", "a"]);
    // An attached flag without a file is not an attached scan.
    expect(receiptScanOf(order({ receiptScan: { ...NONE, attached: true } }))!.attached).toBe(false);
  });

  it("holds dispatch only while the switch is on, the job is with the shop and nothing is attached", () => {
    expect(receiptScanHoldsDispatch(order({ receiptScan: NONE, transitionReadiness: gate(true) }))).toBe(true);
    expect(receiptScanHoldsDispatch(order({ receiptScan: NONE, transitionReadiness: gate(false) }))).toBe(false);
    expect(receiptScanHoldsDispatch(order({ receiptScan: SCANNED, transitionReadiness: gate(true, true) }))).toBe(false);
    expect(
      receiptScanHoldsDispatch(order({ state: "ready_for_dispatch", receiptScan: NONE, transitionReadiness: gate(true) })),
    ).toBe(false);
  });

  it("finds a forced step that skipped the scan, from the order or the audit", () => {
    const forced = order({
      state: "ready_for_dispatch",
      receiptScan: NONE,
      forcedSteps: [
        {
          at: "2026-11-02T04:00:00.000Z",
          by: "ops1",
          role: "ops_admin",
          from: "production",
          to: "ready_for_dispatch",
          reasonCode: "shop_cannot_upload",
          note: "Shop phone broken",
          skippedChecks: ["receipt_scan_required"],
        },
      ],
    });
    expect(receiptScanSkippedAt(forced)).toBe("2026-11-02T04:00:00.000Z");
    expect(receiptScanRowState(forced)).toBe("skipped");

    const audited: ProductionCorrection = {
      id: "a1",
      at: "2026-11-02T05:00:00.000Z",
      actorId: "ops1",
      actorRole: "ops_admin",
      reason: "",
      from: "production",
      to: "ready_for_dispatch",
      photoMissing: false,
      receiptScanMissing: true,
      reasonCode: "shop_cannot_upload",
      skippedChecks: [],
    };
    expect(receiptScanSkippedAt(order({}), [audited])).toBe("2026-11-02T05:00:00.000Z");
  });

  it("shows the row once a shop has the job, and never on an older API", () => {
    expect(receiptScanRowVisible(order({ receiptScan: NONE }))).toBe(true);
    expect(receiptScanRowVisible(order({ state: "payment_authorized", receiptScan: NONE }))).toBe(false);
    expect(receiptScanRowVisible(order({}))).toBe(false);
  });

  it("summarises each state in plain words", () => {
    const when = () => "Nov 2, 11:00 AM";
    expect(receiptScanSummary("attached", SCANNED, when)).toBe(
      "Attached, sent Nov 2, 11:00 AM. 2 scans on the order.",
    );
    expect(receiptScanSummary("holding", NONE, when)).toBe(
      "Missing. The shop cannot call a rider until it sends one.",
    );
    expect(receiptScanSummary("missing", NONE, when)).toBe("Not sent.");
  });

  it("marks the list attached or missing, and stays blank before a shop has the job", () => {
    expect(receiptScanMark(order({ receiptScan: SCANNED }))).toMatchObject({ label: "Attached", tone: "success" });
    expect(receiptScanMark(order({ receiptScan: NONE }))).toMatchObject({ label: "Missing", tone: "neutral" });
    expect(
      receiptScanMark(order({ receiptScan: NONE, transitionReadiness: gate(true) })),
    ).toMatchObject({ label: "Missing", tone: "warning", icon: "triangle-alert" });
    expect(receiptScanMark(order({ state: "needs_qa", receiptScan: NONE }))).toBeNull();
    expect(receiptScanMark(order({}))).toBeNull();
  });
});
