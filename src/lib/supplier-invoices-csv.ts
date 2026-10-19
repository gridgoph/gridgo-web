/**
 * The month-end CSV of shop receipt scans for the accountant (gridgo-web#220),
 * downloaded from the Finance page. One row per invoice GRIDGO is owed for the
 * month, scanned or not, so the close also shows what is still missing.
 *
 * Built from the staff ledger (`GET /ops/finance/supplier-invoices`), which
 * always leaves out test orders. Scan files only have short-lived signed
 * links, so each row links to the dashboard's own invoice panel, which opens
 * the scan for any signed-in Operations or Super Admin reader.
 */

import type { SupplierInvoice, SupplierInvoiceShop } from "@/lib/api/types";
import { presentOriginal, presentScan, shopName } from "@/lib/supplier-invoices";

const MANILA = "Asia/Manila";

export const RECEIPT_SCAN_CSV_HEADER = [
  "Order ID",
  "Order",
  "Shop",
  "Invoice number",
  "Invoice date",
  "Amount entered (PHP)",
  "Scan details sent (Manila)",
  "Ready for pick-up (Manila)",
  "Scan",
  "Paper original",
  "Link",
] as const;

/**
 * Shop names and invoice numbers are typed by shops, so a cell that would open
 * as a formula is written as text, the way the API's audit CSV does.
 */
function cell(value: string | null | undefined): string {
  let text = value ?? "";
  if (/^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/** Centavos as plain pesos (`125000` → `1250.00`); blank when the shop typed none. */
export function csvPesos(minor: number | null | undefined): string {
  if (minor == null || !Number.isSafeInteger(minor)) return "";
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** An instant as `YYYY-MM-DD HH:mm` in Manila, which spreadsheets read as a date. */
export function csvManilaTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const value = Date.parse(iso);
  if (Number.isNaN(value)) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/** The dashboard's invoice panel for one order, which stays valid after signed links expire. */
export function receiptScanLink(
  origin: string,
  tree: "ops" | "admin",
  invoice: Pick<SupplierInvoice, "orderId" | "month">,
): string {
  const query = new URLSearchParams({ month: invoice.month, order: invoice.orderId });
  return `${origin.replace(/\/+$/, "")}/${tree}/supplier-invoices?${query.toString()}`;
}

export function receiptScanCsvName(month: string): string {
  return `gridgo-receipt-scans-${month}.csv`;
}

/**
 * The CSV text for `month`: rows from any other month are left out, shops in
 * name order, then by order ID. Starts with a byte-order mark so Excel reads
 * shop names with ñ correctly.
 */
export function receiptScansCsv(input: {
  month: string;
  invoices: readonly SupplierInvoice[];
  shops: readonly SupplierInvoiceShop[];
  /** Order titles, when the reader could load them; the ID always identifies the row. */
  orderTitles?: ReadonlyMap<string, string>;
  origin: string;
  /** Whose invoice panel the links open. */
  tree: "ops" | "admin";
}): string {
  const shops = new Map(input.shops.map((shop) => [shop.supplierId, shop]));
  const nameOf = (invoice: SupplierInvoice) =>
    shops.has(invoice.supplierId)
      ? shopName(shops.get(invoice.supplierId))
      : `Shop ${invoice.supplierId}`;
  const rows = input.invoices
    .filter((invoice) => invoice.month === input.month)
    .sort(
      (a, b) =>
        nameOf(a).localeCompare(nameOf(b)) ||
        (a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : 0),
    )
    .map((invoice) => [
      invoice.orderId,
      input.orderTitles?.get(invoice.orderId) ?? "",
      nameOf(invoice),
      invoice.number,
      invoice.date,
      csvPesos(invoice.amountMinor),
      csvManilaTime(invoice.submittedAt),
      csvManilaTime(invoice.expectedAt),
      presentScan(invoice).label,
      presentOriginal(invoice).label,
      receiptScanLink(input.origin, input.tree, invoice),
    ]);
  const lines = [[...RECEIPT_SCAN_CSV_HEADER], ...rows].map((row) => row.map(cell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
