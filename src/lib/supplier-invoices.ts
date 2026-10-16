/**
 * Supplier invoices and monthly paper collection (gridgo-web#62, contract
 * `gridgo-api/docs/SUPPLIER_INVOICES_API.md`).
 *
 * GRIDGO buys each job from the shop, so every order owes GRIDGO one shop
 * invoice: a scan the shop sends in, and the paper original Operations picks
 * up. The order counts in the Manila month it first became ready for pick-up,
 * never the upload month or the invoice's own date. Neither the scan nor the
 * paper ever holds up dispatch or a payout.
 *
 * Pure rules for the desk (`src/components/supplier-invoices/`) and the shop's
 * job page; nothing here fetches.
 */

import { isApiError } from "@/lib/api/client";
import type {
  SupplierInvoice,
  SupplierInvoiceCounts,
  SupplierInvoiceShop,
} from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

const MANILA = "Asia/Manila";
const MONTH = /^([1-9]\d{3})-(0[1-9]|1[0-2])$/;

/** The API's page ceiling; the desk reads a month in pages this size. */
export const INVOICE_PAGE_LIMIT = 100;
/** Stops a runaway cursor; 50 pages is 5,000 orders in one month. */
export const INVOICE_MAX_PAGES = 50;

export function isInvoiceMonth(value: string | null | undefined): value is string {
  return typeof value === "string" && MONTH.test(value);
}

/** `YYYY-MM` for this instant in Manila. */
export function manilaMonth(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(at);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

/** `2026-10` shifted by whole months: `shiftMonth("2026-01", -1)` is `2025-12`. */
export function shiftMonth(month: string, by: number): string {
  const match = MONTH.exec(month);
  if (!match) return month;
  const index = Number(match[1]) * 12 + (Number(match[2]) - 1) + by;
  const year = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${year}-${String(m).padStart(2, "0")}`;
}

/** `2026-10` → "October 2026". */
export function monthLabel(month: string): string {
  const match = MONTH.exec(month);
  if (!match) return month;
  return new Intl.DateTimeFormat("en-PH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

/** A calendar date as printed on the invoice (`2026-10-01` → "Oct 1, 2026"), never shifted by a time zone. */
export function invoiceDateLabel(date: string | null | undefined): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return date || "—";
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

// ---------------------------------------------------------------------------
// Where one invoice stands
// ---------------------------------------------------------------------------

export type InvoicePresentation = {
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
  /** One sentence for the detail panel. */
  detail: string;
};

/**
 * The scan side. A shop can attach a scan and never type the details; the
 * API counts that as missing, so the desk says what is still owed.
 */
export function presentScan(invoice: SupplierInvoice): InvoicePresentation {
  if (invoice.received) {
    return {
      label: "Scan in",
      tone: "success",
      icon: "circle-check",
      detail: "The shop sent its scan and typed the invoice details.",
    };
  }
  if (invoice.submittedAt) {
    return {
      label: "Scan no longer on file",
      tone: "error",
      icon: "triangle-alert",
      detail:
        "The details are on record, but the scan they point to is gone. The shop needs to send the scan again.",
    };
  }
  if (invoice.scanFileIds.length > 0) {
    return {
      label: "Details not entered",
      tone: "warning",
      icon: "square-pen",
      detail:
        "The shop attached a scan but has not typed the invoice number, date and amount, so it does not count yet.",
    };
  }
  return {
    label: "No scan yet",
    tone: "warning",
    icon: "circle-dashed",
    detail: "The shop has not sent a scan of its invoice for this order.",
  };
}

/** The paper side: GRIDGO holds the original, or still has to pick it up. */
export function presentOriginal(invoice: SupplierInvoice): InvoicePresentation {
  if (invoice.collected) {
    return {
      label: "Original collected",
      tone: "success",
      icon: "circle-check",
      detail: "GRIDGO has the paper original. The invoice details are final.",
    };
  }
  return {
    label: "Original to collect",
    tone: "neutral",
    icon: "clock",
    detail: "GRIDGO still needs to pick up the paper original from the shop.",
  };
}

/**
 * Why "Mark original collected" is not offered, or null when it is. The API
 * records the paper only against a scanned invoice (`409
 * supplier_invoice_scan_required`), so the desk says so before the click.
 */
export function collectBlocker(invoice: SupplierInvoice): string | null {
  if (invoice.collected) return null;
  if (invoice.received) return null;
  return "The shop's scan and invoice details come first. Ask the shop to send them, then record the original.";
}

export function canCollect(invoice: SupplierInvoice): boolean {
  return !invoice.collected && invoice.received;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export type InvoiceView = "all" | "missing" | "to_collect" | "collected";

export const INVOICE_VIEWS: readonly { value: InvoiceView; label: string }[] = [
  { value: "all", label: "All" },
  { value: "missing", label: "Missing scan" },
  { value: "to_collect", label: "Original to collect" },
  { value: "collected", label: "Collected" },
];

export function parseInvoiceView(value: string | null | undefined): InvoiceView {
  return INVOICE_VIEWS.some((view) => view.value === value) ? (value as InvoiceView) : "all";
}

export function matchesView(invoice: SupplierInvoice, view: InvoiceView): boolean {
  switch (view) {
    case "missing":
      return !invoice.received;
    case "to_collect":
      return !invoice.collected;
    case "collected":
      return invoice.collected;
    default:
      return true;
  }
}

/** The count beside each view tab, from the same figures the API totals. */
export function viewCount(counts: SupplierInvoiceCounts, view: InvoiceView): number {
  switch (view) {
    case "missing":
      return counts.missing;
    case "to_collect":
      return counts.toCollect;
    case "collected":
      return counts.collected;
    default:
      return counts.expected;
  }
}

/**
 * Shops with paper still to pick up first (most first), then shops whose
 * scans are missing, then by name. That is the order of a collection run.
 */
export function sortShops(shops: readonly SupplierInvoiceShop[]): SupplierInvoiceShop[] {
  return [...shops].sort(
    (a, b) =>
      b.toCollect - a.toCollect ||
      b.missing - a.missing ||
      shopName(a).localeCompare(shopName(b)),
  );
}

/** A shop with no name on record still reads as a shop, never as blank. */
export function shopName(shop: Pick<SupplierInvoiceShop, "shopName" | "supplierId"> | undefined): string {
  if (!shop) return "Shop not on record";
  return shop.shopName.trim() || `Shop ${shop.supplierId}`;
}

// ---------------------------------------------------------------------------
// The collection meter
// ---------------------------------------------------------------------------

/**
 * Three parts of one month's invoices, which always add up to `expected`:
 * paper collected, scanned but paper still out, and scan missing. (A
 * collected invoice whose scan was later deleted stays collected.)
 */
export function meterParts(counts: SupplierInvoiceCounts): {
  collected: number;
  scannedOnly: number;
  missing: number;
} {
  const collected = Math.min(counts.collected, counts.expected);
  const missing = Math.min(counts.missing, counts.expected - collected);
  return { collected, scannedOnly: Math.max(0, counts.expected - collected - missing), missing };
}

/** The meter's words, for screen readers and the shop table's mobile card. */
export function meterSentence(counts: SupplierInvoiceCounts): string {
  if (!counts.expected) return "No invoices expected";
  const parts = [`${counts.expected} expected`, `${counts.received} scanned in`];
  if (counts.missing) parts.push(`${counts.missing} missing a scan`);
  parts.push(`${counts.collected} original${counts.collected === 1 ? "" : "s"} collected`);
  if (counts.toCollect) parts.push(`${counts.toCollect} still to collect`);
  return parts.join(", ");
}

/** The month in one sentence, led by the number Operations acts on. */
export function monthHeadline(totals: SupplierInvoiceCounts, shops: number): string {
  if (!totals.expected) return "No invoices expected";
  if (!totals.toCollect) {
    return `All ${totals.expected} original${totals.expected === 1 ? "" : "s"} collected`;
  }
  const from = shops === 1 ? "1 shop" : `${shops} shops`;
  return `${totals.toCollect} of ${totals.expected} original${totals.expected === 1 ? "" : "s"} still to collect from ${from}`;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Plain recovery copy for the desk; never the raw code alone. */
export function invoiceErrorMessage(err: unknown, fallback: string): string {
  if (!isApiError(err)) return fallback;
  switch (err.code) {
    case "supplier_invoice_scan_required":
      return "This invoice has no scan with details on file, so the original cannot be recorded yet.";
    case "supplier_invoice_version_conflict":
      return "The shop changed this invoice a moment ago. The latest version is loaded; check it and try again.";
    case "supplier_invoice_not_expected":
      return "This order has not reached ready for pick-up, so no invoice is expected for it yet.";
    case "storage_object_missing":
    case "storage_object_mismatch":
      return "The scan could not be verified in storage. Ask the shop to send it again.";
    case "invalid_month":
      return "That month could not be read. Pick a month from the controls.";
  }
  switch (err.kind) {
    case "unauthorized":
      return "Your session expired. Sign in again.";
    case "forbidden":
      return "Only Operations and Super Admin can see supplier invoices.";
    case "server":
      return "The API could not answer just now. Retry in a moment.";
    default:
      return fallback;
  }
}

/** A stale version means the shop moved first: reload, then let the person decide again. */
export function isStaleInvoice(err: unknown): boolean {
  return isApiError(err) && err.code === "supplier_invoice_version_conflict";
}
