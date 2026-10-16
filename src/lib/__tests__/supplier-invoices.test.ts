import { describe, expect, it } from "vitest";

import type { SupplierInvoice, SupplierInvoiceShop } from "@/lib/api/types";
import {
  canCollect,
  collectBlocker,
  invoiceDateLabel,
  isInvoiceMonth,
  manilaMonth,
  matchesView,
  meterParts,
  meterSentence,
  monthHeadline,
  monthLabel,
  parseInvoiceView,
  presentOriginal,
  presentScan,
  shiftMonth,
  shopName,
  sortShops,
  viewCount,
} from "@/lib/supplier-invoices";

function invoice(patch: Partial<SupplierInvoice> = {}): SupplierInvoice {
  return {
    orderId: "order_1",
    supplierId: "shop_a",
    expectedAt: "2026-10-03T02:00:00.000Z",
    month: "2026-10",
    fileId: null,
    number: null,
    date: null,
    amountMinor: null,
    submittedAt: null,
    updatedAt: null,
    version: 0,
    collectedAt: null,
    collectedBy: null,
    scanFileIds: [],
    received: false,
    collected: false,
    ...patch,
  };
}

const scanned = invoice({
  fileId: "file_1",
  number: "INV-001",
  date: "2026-10-01",
  amountMinor: 10000,
  submittedAt: "2026-10-03T03:00:00.000Z",
  updatedAt: "2026-10-03T03:00:00.000Z",
  version: 1,
  scanFileIds: ["file_1"],
  received: true,
});

describe("months", () => {
  it("counts an instant in the Manila month, not the UTC one", () => {
    // The contract's own example: 16:00 UTC on 30 Sep is midnight 1 Oct in Manila.
    expect(manilaMonth(new Date("2026-09-30T16:00:00.000Z"))).toBe("2026-10");
    expect(manilaMonth(new Date("2026-09-30T15:59:59.000Z"))).toBe("2026-09");
  });

  it("steps across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
    expect(shiftMonth("2026-10", -13)).toBe("2025-09");
  });

  it("reads only real YYYY-MM months", () => {
    expect(isInvoiceMonth("2026-10")).toBe(true);
    expect(isInvoiceMonth("2026-13")).toBe(false);
    expect(isInvoiceMonth("2026-1")).toBe(false);
    expect(isInvoiceMonth(null)).toBe(false);
  });

  it("names the month in words", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
  });

  it("prints the invoice's calendar date without a time-zone shift", () => {
    expect(invoiceDateLabel("2026-10-01")).toBe("Oct 1, 2026");
    expect(invoiceDateLabel(null)).toBe("—");
  });
});

describe("where an invoice stands", () => {
  it("separates no scan, scan without details, a lost scan and a scan that counts", () => {
    expect(presentScan(invoice()).label).toBe("No scan yet");
    expect(presentScan(invoice({ scanFileIds: ["file_1"] })).label).toBe("Details not entered");
    expect(
      presentScan({ ...scanned, received: false, scanFileIds: [] }).label,
    ).toBe("Scan no longer on file");
    expect(presentScan(scanned).label).toBe("Scan in");
  });

  it("treats the paper original separately from the scan", () => {
    expect(presentOriginal(scanned).label).toBe("Original to collect");
    expect(
      presentOriginal({ ...scanned, collected: true, collectedAt: "2026-10-04T00:00:00.000Z" })
        .label,
    ).toBe("Original collected");
  });

  it("offers collection only against a scanned invoice that is not yet collected", () => {
    expect(canCollect(scanned)).toBe(true);
    expect(collectBlocker(scanned)).toBeNull();
    expect(canCollect(invoice({ scanFileIds: ["file_1"] }))).toBe(false);
    expect(collectBlocker(invoice())).toMatch(/scan and invoice details come first/);
    expect(canCollect({ ...scanned, collected: true })).toBe(false);
  });
});

describe("views", () => {
  it("filters by the same rules the API counts with", () => {
    const missing = invoice();
    const done = { ...scanned, collected: true };
    expect(matchesView(missing, "missing")).toBe(true);
    expect(matchesView(missing, "to_collect")).toBe(true);
    expect(matchesView(scanned, "missing")).toBe(false);
    expect(matchesView(scanned, "to_collect")).toBe(true);
    expect(matchesView(done, "to_collect")).toBe(false);
    expect(matchesView(done, "collected")).toBe(true);
  });

  it("falls back to every invoice for an unknown view", () => {
    expect(parseInvoiceView("nonsense")).toBe("all");
    expect(parseInvoiceView("to_collect")).toBe("to_collect");
  });

  it("labels each view with the API's count", () => {
    const counts = { expected: 9, received: 6, missing: 3, collected: 2, toCollect: 7 };
    expect(viewCount(counts, "all")).toBe(9);
    expect(viewCount(counts, "missing")).toBe(3);
    expect(viewCount(counts, "to_collect")).toBe(7);
    expect(viewCount(counts, "collected")).toBe(2);
  });
});

describe("the collection meter", () => {
  it("splits a month into collected, scanned-only and missing parts that add up", () => {
    const parts = meterParts({ expected: 10, received: 7, missing: 3, collected: 4, toCollect: 6 });
    expect(parts).toEqual({ collected: 4, scannedOnly: 3, missing: 3 });
  });

  it("keeps a collected invoice whose scan was later deleted in the collected part", () => {
    // 1 collected and received; 1 collected but its scan deleted (missing too).
    const parts = meterParts({ expected: 2, received: 1, missing: 1, collected: 2, toCollect: 0 });
    expect(parts).toEqual({ collected: 2, scannedOnly: 0, missing: 0 });
  });

  it("says the counts in words for screen readers", () => {
    expect(meterSentence({ expected: 3, received: 2, missing: 1, collected: 1, toCollect: 2 })).toBe(
      "3 expected, 2 scanned in, 1 missing a scan, 1 original collected, 2 still to collect",
    );
    expect(meterSentence({ expected: 0, received: 0, missing: 0, collected: 0, toCollect: 0 })).toBe(
      "No invoices expected",
    );
  });

  it("leads the month with the originals still to collect", () => {
    expect(monthHeadline({ expected: 12, received: 9, missing: 3, collected: 4, toCollect: 8 }, 3)).toBe(
      "8 of 12 originals still to collect from 3 shops",
    );
    expect(monthHeadline({ expected: 2, received: 2, missing: 0, collected: 2, toCollect: 0 }, 1)).toBe(
      "All 2 originals collected",
    );
    expect(monthHeadline({ expected: 0, received: 0, missing: 0, collected: 0, toCollect: 0 }, 0)).toBe(
      "No invoices expected",
    );
  });
});

describe("shops", () => {
  const shop = (patch: Partial<SupplierInvoiceShop>): SupplierInvoiceShop => ({
    supplierId: "s",
    shopName: "Shop",
    expected: 1,
    received: 1,
    missing: 0,
    collected: 0,
    toCollect: 1,
    ...patch,
  });

  it("puts the shops with the most paper to pick up first", () => {
    const sorted = sortShops([
      shop({ supplierId: "c", shopName: "Shop C", toCollect: 0, collected: 1 }),
      shop({ supplierId: "a", shopName: "Shop A", toCollect: 2 }),
      shop({ supplierId: "b", shopName: "Shop B", toCollect: 2, missing: 1 }),
    ]);
    expect(sorted.map((row) => row.supplierId)).toEqual(["b", "a", "c"]);
  });

  it("never shows a blank shop name", () => {
    expect(shopName(shop({ supplierId: "usr_9", shopName: "  " }))).toBe("Shop usr_9");
    expect(shopName(undefined)).toBe("Shop not on record");
  });
});
