"use client";

import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/toast";
import { collectSupplierInvoice } from "@/lib/api/client";
import type { SupplierInvoice } from "@/lib/api/types";
import { invoiceErrorMessage, isStaleInvoice } from "@/lib/supplier-invoices";

/**
 * The one confirmation for "Mark original collected", from the invoice panel
 * or straight from a row during a collection run. It restates which paper,
 * that the person's name goes on the record, and that it is final.
 */
export function CollectInvoiceDialog({
  invoice,
  shopName,
  orderName,
  onCancel,
  onCollected,
  onStale,
}: {
  /** The invoice being confirmed; null closes the dialog. */
  invoice: SupplierInvoice | null;
  shopName: string;
  orderName: string;
  onCancel: () => void;
  onCollected: (invoice: SupplierInvoice) => void;
  onStale: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function collect(target: SupplierInvoice) {
    setBusy(true);
    setError(null);
    try {
      const result = await collectSupplierInvoice(target.orderId, target.version);
      onCollected(result.invoice);
      toast.add({
        type: "success",
        title: "Original collected",
        description: `${shopName}'s invoice${result.invoice.number ? ` ${result.invoice.number}` : ""} is on record as collected.`,
      });
    } catch (err) {
      setError(invoiceErrorMessage(err, "The original was not recorded. Try again."));
      if (isStaleInvoice(err)) onStale();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={invoice !== null}
      onOpenChange={(open) => {
        if (open || busy) return;
        setError(null);
        onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark the paper original collected?</AlertDialogTitle>
          <AlertDialogDescription>
            GRIDGO now holds {shopName}&rsquo;s invoice
            {invoice?.number ? ` ${invoice.number}` : ""} for {orderName}. Your name and the time
            go on the record. This cannot be undone, and the shop can no longer change the
            invoice details.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-body text-error m-0">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="primary"
            disabled={busy || !invoice}
            onClick={() => {
              if (invoice) void collect(invoice);
            }}
          >
            {busy ? "Recording…" : "Mark collected"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
