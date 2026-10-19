import { describe, expect, it } from "vitest";

import type { SupplierInvoice, SupplierInvoiceShop } from "@/lib/api/types";
import {
  RECEIPT_SCAN_CSV_HEADER,
  csvManilaTime,
  csvPesos,
  receiptScanCsvName,
  receiptScanLink,
  receiptScansCsv,
} from "@/lib/supplier-invoices-csv";

function invoice(patch: Partial<SupplierInvoice>): SupplierInvoice {
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

function shop(supplierId: string, shopName: string): SupplierInvoiceShop {
  return { supplierId, shopName, expected: 1, received: 1, missing: 0, collected: 0, toCollect: 1 };
}

const scanned = invoice({
  orderId: "order_2",
  supplierId: "shop_b",
  fileId: "file_2",
  number: "INV-001",
  date: "2026-10-01",
  amountMinor: 125_050,
  submittedAt: "2026-10-31T16:30:00.000Z",
  scanFileIds: ["file_2"],
  received: true,
});

function parse(csv: string): string[] {
  expect(csv.startsWith("﻿")).toBe(true);
  expect(csv.endsWith("\r\n")).toBe(true);
  return csv.slice(1).trimEnd().split("\r\n");
}

const base = {
  month: "2026-10",
  shops: [shop("shop_a", "Ñora Prints"), shop("shop_b", "Bayani Press")],
  origin: "https://gridgo-dash.talasora.com/",
  tree: "admin" as const,
};

describe("receiptScansCsv", () => {
  it("writes the header the accountant reads, quoted", () => {
    const [header] = parse(receiptScansCsv({ ...base, invoices: [] }));
    expect(header).toBe(RECEIPT_SCAN_CSV_HEADER.map((name) => `"${name}"`).join(","));
    expect(header).toContain('"Amount entered (PHP)"');
    expect(header).toContain('"Link"');
  });

  it("writes one row per invoice with the amount, Manila times and a lasting link", () => {
    const lines = parse(
      receiptScansCsv({
        ...base,
        invoices: [scanned],
        orderTitles: new Map([["order_2", "Flyers A5"]]),
      }),
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      [
        "order_2",
        "Flyers A5",
        "Bayani Press",
        "INV-001",
        "2026-10-01",
        "1250.50",
        // 16:30 UTC on the 31st is past midnight in Manila.
        "2026-11-01 00:30",
        "2026-10-03 10:00",
        "Scan in",
        "Original to collect",
        "https://gridgo-dash.talasora.com/admin/supplier-invoices?month=2026-10&order=order_2",
      ]
        .map((value) => `"${value}"`)
        .join(","),
    );
  });

  it("keeps an invoice with no scan, leaving the amount and time blank", () => {
    const [, row] = parse(receiptScansCsv({ ...base, invoices: [invoice({})] }));
    expect(row).toBe(
      '"order_1","","Ñora Prints","","","","","2026-10-03 10:00","No scan yet","Original to collect","https://gridgo-dash.talasora.com/admin/supplier-invoices?month=2026-10&order=order_1"',
    );
  });

  it("escapes quotes, commas and line breaks, and defuses formulas", () => {
    const tricky = invoice({
      orderId: "order_3",
      supplierId: "shop_c",
      number: '=HYPERLINK("x"),1',
      received: true,
    });
    const [, row] = parse(
      receiptScansCsv({
        ...base,
        shops: [shop("shop_c", 'The "Best", Prints\nCubao')],
        invoices: [tricky],
        orderTitles: new Map([["order_3", "+63 cards"]]),
      }),
    );
    expect(row).toContain('"\'+63 cards"');
    expect(row).toContain('"The ""Best"", Prints\nCubao"');
    expect(row).toContain('"\'=HYPERLINK(""x""),1"');
  });

  it("leaves out rows from any other month", () => {
    const lines = parse(
      receiptScansCsv({
        ...base,
        invoices: [scanned, invoice({ orderId: "order_9", month: "2026-09" })],
      }),
    );
    expect(lines).toHaveLength(2);
    expect(lines.join("\n")).not.toContain("order_9");
  });

  it("orders rows by shop name, then order ID", () => {
    const lines = parse(
      receiptScansCsv({
        ...base,
        invoices: [
          invoice({ orderId: "order_5" }),
          scanned,
          invoice({ orderId: "order_4" }),
        ],
      }),
    );
    expect(lines.slice(1).map((line) => line.split(",")[0])).toEqual([
      '"order_2"',
      '"order_4"',
      '"order_5"',
    ]);
  });

  it("names a shop missing from the month's list by its ID", () => {
    const [, row] = parse(
      receiptScansCsv({ ...base, shops: [], invoices: [invoice({ supplierId: "shop_z" })] }),
    );
    expect(row).toContain('"Shop shop_z"');
  });
});

describe("receipt scan CSV helpers", () => {
  it("writes centavos as plain pesos", () => {
    expect(csvPesos(0)).toBe("0.00");
    expect(csvPesos(5)).toBe("0.05");
    expect(csvPesos(125_000)).toBe("1250.00");
    expect(csvPesos(null)).toBe("");
  });

  it("writes times in Manila and blanks what it cannot read", () => {
    expect(csvManilaTime("2026-09-30T16:00:00.000Z")).toBe("2026-10-01 00:00");
    expect(csvManilaTime(null)).toBe("");
    expect(csvManilaTime("not a time")).toBe("");
  });

  it("links into the reader's own tree and names the file by month", () => {
    expect(receiptScanLink("http://localhost:3000", "ops", { orderId: "o/1", month: "2026-10" })).toBe(
      "http://localhost:3000/ops/supplier-invoices?month=2026-10&order=o%2F1",
    );
    expect(receiptScanCsvName("2026-10")).toBe("gridgo-receipt-scans-2026-10.csv");
  });
});
