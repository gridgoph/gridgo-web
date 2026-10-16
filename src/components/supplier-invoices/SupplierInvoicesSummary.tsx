"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { CollectionMeter } from "@/components/supplier-invoices/CollectionMeter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listSupplierInvoices } from "@/lib/api/client";
import type { SupplierInvoiceMonth } from "@/lib/api/types";
import { useLegalInboxReload } from "@/lib/live/useLegalInboxReload";
import { manilaMonth, meterSentence, monthLabel } from "@/lib/supplier-invoices";

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
    </section>
  );
}
