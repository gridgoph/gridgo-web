"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";

import { CollectionMeter } from "@/components/supplier-invoices/CollectionMeter";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { saveCsv } from "@/components/survey-responses/save-csv";
import { listOrders, listSupplierInvoices } from "@/lib/api/client";
import type { SupplierInvoice, SupplierInvoiceMonth } from "@/lib/api/types";
import { useLegalInboxReload } from "@/lib/live/useLegalInboxReload";
import {
  INVOICE_MAX_PAGES,
  INVOICE_PAGE_LIMIT,
  invoiceErrorMessage,
  manilaMonth,
  meterSentence,
  monthLabel,
  shiftMonth,
} from "@/lib/supplier-invoices";
import { receiptScanCsvName, receiptScansCsv } from "@/lib/supplier-invoices-csv";

/** How far back the month-end CSV reaches: this month and the eleven before it. */
const EXPORT_MONTHS = 12;

/**
 * This month's shop invoices on the Finance page: the one figure Finance asks
 * of them (originals still to collect) and the way into the full desk. Only
 * the totals are read (`limit=1`); they always cover the whole month.
 */
export function SupplierInvoicesSummary({ tree }: { tree: "ops" | "admin" }) {
  const month = manilaMonth();
  const [data, setData] = useState<SupplierInvoiceMonth | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await listSupplierInvoices(month, { limit: 1 }));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);
  useLegalInboxReload("supplier_invoice_", load);

  const totals = data?.totals;
  return (
    <section className="gg-card flex flex-col gap-3" aria-labelledby="finance-invoices-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-prose flex-col gap-1">
          <h2 id="finance-invoices-heading" className="text-h3 text-text-primary m-0">
            Supplier invoices, {monthLabel(month)}
          </h2>
          <p className="text-body text-text-secondary m-0">
            {failed
              ? "The invoice counts could not be read just now. The desk has the full list."
              : !totals
                ? "Counting this month's invoices…"
                : !totals.expected
                  ? "No order has become ready for pick-up this month, so no shop invoice is owed yet."
                  : `${meterSentence(totals)}.`}
          </p>
        </div>
        <Button
          variant="secondary"
          nativeButton={false}
          render={<Link href={`/${tree}/supplier-invoices`} />}
        >
          Open supplier invoices
        </Button>
      </div>
      {!data && !failed ? (
        <Skeleton className="h-3.5 w-full rounded-pill" aria-hidden />
      ) : totals?.expected ? (
        <CollectionMeter counts={totals} />
      ) : null}
      <ReceiptScansExport tree={tree} thisMonth={month} />
    </section>
  );
}

/**
 * The accountant's month-end CSV (gridgo-web#220): every invoice the month
 * owes, with the shop's scan details and a link back to its panel. Reads the
 * whole month on press; the ledger never includes test orders.
 */
function ReceiptScansExport({ tree, thisMonth }: { tree: "ops" | "admin"; thisMonth: string }) {
  const months = Array.from({ length: EXPORT_MONTHS }, (_, index) => shiftMonth(thisMonth, -index));
  const [month, setMonth] = useState(thisMonth);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function download() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const first = await listSupplierInvoices(month, { limit: INVOICE_PAGE_LIMIT });
      const invoices: SupplierInvoice[] = [...first.invoices];
      let cursor = first.nextCursor;
      let pages = 1;
      while (cursor && pages < INVOICE_MAX_PAGES) {
        const page = await listSupplierInvoices(month, { limit: INVOICE_PAGE_LIMIT, after: cursor });
        invoices.push(...page.invoices);
        cursor = page.nextCursor;
        pages += 1;
      }
      if (cursor) {
        setMessage(
          `${monthLabel(month)} has more orders than one download can hold, so no file was saved. Ask the tech team for this month's export.`,
        );
        return;
      }
      // Titles make rows recognisable; without them the order ID stands in.
      const orderTitles = await listOrders()
        .then((orders) => new Map(orders.map((order) => [order.id, order.title])))
        .catch(() => undefined);
      const csv = receiptScansCsv({
        month,
        invoices,
        shops: first.shops,
        orderTitles,
        origin: window.location.origin,
        tree,
      });
      saveCsv(new Blob([csv], { type: "text/csv;charset=utf-8" }), receiptScanCsvName(month));
      setMessage(
        invoices.length
          ? `Saved ${invoices.length} invoice${invoices.length === 1 ? "" : "s"} for ${monthLabel(month)}.`
          : `Saved an empty file: no invoice is owed for ${monthLabel(month)}.`,
      );
    } catch (err) {
      setMessage(invoiceErrorMessage(err, "The receipt scans could not be read just now. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex flex-col gap-1">
        <h3
          className="text-body text-text-primary m-0"
          style={{ fontFamily: "var(--font-bold)" }}
        >
          Month-end CSV for the accountant
        </h3>
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Each order&rsquo;s shop, invoice number and date, the amount the shop entered, when
          it sent the details, and a link that opens the scan here. An order counts in the
          month it became ready for pick-up. Test orders are never included.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={month} onValueChange={(value) => value && setMonth(String(value))}>
          <SelectTrigger
            className="min-h-11 w-full sm:w-56"
            aria-label="Month to export"
          >
            <SelectValue>{(value) => monthLabel(String(value))}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {months.map((value) => (
              <SelectItem key={value} value={value}>
                {monthLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="secondary" disabled={busy} onClick={() => void download()}>
          <Download aria-hidden />
          {busy ? "Preparing CSV…" : "Download CSV"}
        </Button>
      </div>
      <p className="text-caption text-text-muted m-0" role="status" aria-live="polite">
        {message ?? ""}
      </p>
    </div>
  );
}
