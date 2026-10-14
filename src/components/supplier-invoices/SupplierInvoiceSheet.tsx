"use client";

/**
 * One order's shop invoice: the scan, what the shop typed from it, and the
 * paper original. "Mark original collected" is final (contract "Record paper
 * collection" in SUPPLIER_INVOICES_API.md), so it opens the desk's
 * confirmation. The API refuses it without a scan, so the panel says so first.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { PackageCheck } from "lucide-react";

import { EvidencePlate } from "@/components/orders/EvidencePreview";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusChip } from "@/components/ui/StatusChip";
import { getUser } from "@/lib/api/client";
import type { SupplierInvoice } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDateTime, formatPhp } from "@/lib/format";
import {
  collectBlocker,
  invoiceDateLabel,
  monthLabel,
  presentOriginal,
  presentScan,
} from "@/lib/supplier-invoices";

type Props = {
  tree: "ops" | "admin";
  invoice: SupplierInvoice | null;
  shopName: string;
  /** The order's title when the order list had it; the order ID otherwise. */
  orderTitle: string | null;
  onClose: () => void;
  /** Opens the desk's confirmation (`CollectInvoiceDialog`). */
  onCollect: (invoice: SupplierInvoice) => void;
};

export function SupplierInvoiceSheet(props: Props) {
  const { invoice, onClose } = props;
  return (
    <Sheet
      open={invoice !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        {invoice ? (
          <Body key={`${invoice.orderId}:${invoice.version}`} {...props} invoice={invoice} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Body({
  tree,
  invoice,
  shopName,
  orderTitle,
  onCollect,
}: Props & { invoice: SupplierInvoice }) {
  const scan = presentScan(invoice);
  const original = presentOriginal(invoice);
  const blocker = collectBlocker(invoice);
  const scanId = invoice.fileId ?? invoice.scanFileIds[0] ?? null;
  const otherScans = invoice.scanFileIds.filter((id) => id !== scanId);
  const orderName = orderTitle || `Order ${invoice.orderId}`;

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <SheetHeader className="gap-2 p-0 pr-10">
        <SheetTitle>
          <span className="text-h3 text-text-primary">{shopName}</span>
        </SheetTitle>
        <SheetDescription>
          <span className="text-body text-text-secondary">
            Invoice for {orderName}. Ready for pick-up {formatDateTime(invoice.expectedAt)},
            so it counts in {monthLabel(invoice.month)}.
          </span>
        </SheetDescription>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={scan.tone} label={scan.label} icon={scan.icon} />
          <StatusChip tone={original.tone} label={original.label} icon={original.icon} />
        </div>
      </SheetHeader>

      <section className="flex flex-col gap-2" aria-labelledby="invoice-scan-heading">
        <h3 id="invoice-scan-heading" className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-bold)" }}>
          Scan
        </h3>
        <p className="text-body text-text-secondary m-0">{scan.detail}</p>
        {scanId ? (
          <EvidencePlate fileId={scanId} label="Invoice scan" downloadable />
        ) : null}
        {otherScans.length ? (
          <details className="text-body">
            <summary className="text-text-secondary min-h-11 cursor-pointer content-center">
              {otherScans.length === 1
                ? "1 other scan the shop attached"
                : `${otherScans.length} other scans the shop attached`}
            </summary>
            <div className="mt-2 flex flex-col gap-3">
              {otherScans.map((id, index) => (
                <EvidencePlate key={id} fileId={id} label={`Other scan ${index + 1}`} />
              ))}
            </div>
          </details>
        ) : null}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="invoice-details-heading">
        <h3 id="invoice-details-heading" className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-bold)" }}>
          What the shop entered
        </h3>
        {invoice.submittedAt ? (
          <>
            <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
              <Fact term="Invoice number">{invoice.number}</Fact>
              <Fact term="Invoice date">{invoiceDateLabel(invoice.date)}</Fact>
              <Fact term="Amount">
                {invoice.amountMinor !== null ? formatPhp(invoice.amountMinor) : "—"}
              </Fact>
              <Fact term="Sent">{formatDateTime(invoice.submittedAt)}</Fact>
              {invoice.updatedAt && invoice.updatedAt !== invoice.submittedAt && !invoice.collected ? (
                <Fact term="Last corrected">{formatDateTime(invoice.updatedAt)}</Fact>
              ) : null}
            </dl>
            <p className="text-caption text-text-muted m-0">
              The amount is what the shop typed from its own invoice. It is not checked against
              the order&rsquo;s price.
            </p>
          </>
        ) : (
          <p className="text-body text-text-secondary m-0">Nothing entered yet.</p>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="invoice-original-heading">
        <h3 id="invoice-original-heading" className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-bold)" }}>
          Paper original
        </h3>
        {invoice.collected ? (
          <CollectedLine invoice={invoice} />
        ) : (
          <>
            <p className="text-body text-text-secondary m-0">{original.detail}</p>
            {blocker ? (
              <p className="text-body text-text-primary m-0">{blocker}</p>
            ) : (
              <div>
                <Button variant="primary" size="lg" onClick={() => onCollect(invoice)}>
                  <PackageCheck data-icon="inline-start" aria-hidden />
                  Mark original collected
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      <div className="border-outline-subtle flex flex-col gap-2 border-t pt-4">
        <p className="text-caption text-text-muted m-0">
          A missing scan or original never holds up dispatch or the shop&rsquo;s payout.
        </p>
        <div>
          <Button
            variant="secondary"
            nativeButton={false}
            render={<Link href={`/${tree}/orders/${encodeURIComponent(invoice.orderId)}`} />}
          >
            Open the order
          </Button>
        </div>
      </div>

    </div>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-caption text-text-muted self-center">{term}</dt>
      <dd className="text-body text-text-primary m-0 tabular-nums break-words">{children}</dd>
    </>
  );
}

/** Who recorded the original. "You" for the reader; a name when the API gives one. */
function CollectedLine({ invoice }: { invoice: SupplierInvoice }) {
  const { user: me } = useAuth();
  const mine = Boolean(me && invoice.collectedBy === me.id);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (mine || !invoice.collectedBy) return;
    let cancelled = false;
    getUser(invoice.collectedBy)
      .then((user) => {
        if (!cancelled) setName(user.name || user.email || null);
      })
      .catch(() => {
        /* The time is the record; a name is a courtesy. */
      });
    return () => {
      cancelled = true;
    };
  }, [mine, invoice.collectedBy]);

  const who = mine ? "you" : name ?? "a staff member";
  return (
    <p className="text-body text-text-primary m-0">
      Collected {formatDateTime(invoice.collectedAt)} by {who}. The invoice details are final.
    </p>
  );
}
