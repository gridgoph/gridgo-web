"use client";

/**
 * The shop's receipt scan on Operations and Super Admin order views: a small
 * marker for the order list and the workspace's Receipt scan row. Rules and
 * copy live in `src/lib/receipt-scan.ts`; the contract is
 * `gridgo-api/docs/SHOP_RECEIPT_SCAN_API.md`.
 */

import Link from "next/link";

import { EvidencePlate } from "@/components/orders/EvidencePreview";
import { StatusMark } from "@/components/ui/StatusChip";
import type { Order } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import type { ProductionCorrection } from "@/lib/production-progress";
import {
  earlierReceiptScans,
  receiptScanMark,
  receiptScanOf,
  receiptScanRowState,
  receiptScanSkippedAt,
} from "@/lib/receipt-scan";

/** The list's marker: attached or missing, icon and word, never colour alone. */
export function ReceiptScanMark({ order }: { order: Order }) {
  const mark = receiptScanMark(order);
  if (!mark) {
    return (
      <span className="text-body text-text-muted" aria-label="Receipt scan: not due yet">
        —
      </span>
    );
  }
  return (
    <span
      className="text-body text-text-secondary whitespace-nowrap"
      aria-label={`Receipt scan: ${mark.label.toLowerCase()}`}
    >
      <StatusMark tone={mark.tone} icon={mark.icon} label={mark.label} />
    </span>
  );
}

type PanelProps = {
  order: Order;
  corrections: readonly ProductionCorrection[];
  tree: "ops" | "admin";
};

/** The workspace row's body: what holds the job, the latest scan, earlier ones. */
export function ReceiptScanPanel({ order, corrections, tree }: PanelProps) {
  const scan = receiptScanOf(order);
  const state = receiptScanRowState(order, corrections);
  const skippedAt = receiptScanSkippedAt(order, corrections);
  const earlier = scan ? earlierReceiptScans(scan) : [];

  return (
    <div className="flex flex-col gap-3">
      {state === "holding" ? (
        <p
          className="text-body text-text-primary m-0 rounded-card border border-warning bg-surface-variant p-3 max-w-prose"
          data-testid="receipt-scan-holding"
        >
          Receipt scans are required before a rider is called. The shop cannot mark this
          job ready for rider pickup until it sends its receipt scan.
        </p>
      ) : null}

      {skippedAt ? (
        <p
          className="text-body text-text-primary m-0 rounded-card border border-outline bg-surface-variant p-3 max-w-prose"
          data-testid="receipt-scan-skipped"
        >
          Skipped. GRIDGO moved this job on {formatDateTime(skippedAt)} without the
          shop&rsquo;s receipt scan.
        </p>
      ) : null}

      {scan?.latestFileId ? (
        <div className="flex flex-col gap-1">
          <EvidencePlate
            fileId={scan.latestFileId}
            label="Latest scan"
            downloadable
            whole
          />
          {scan.latestUploadedAt ? (
            <p className="text-caption text-text-muted m-0">
              Sent {formatDateTime(scan.latestUploadedAt)}
            </p>
          ) : null}
        </div>
      ) : state !== "holding" ? (
        <p className="text-body text-text-secondary m-0">
          The shop has not sent a receipt scan for this order.
        </p>
      ) : null}

      {earlier.length ? (
        <details className="text-body">
          <summary className="text-text-secondary min-h-11 cursor-pointer content-center">
            {earlier.length === 1 ? "1 earlier scan" : `${earlier.length} earlier scans`}
          </summary>
          <div className="mt-2 flex flex-col gap-3">
            {earlier.map((id, index) => (
              <EvidencePlate key={id} fileId={id} label={`Earlier scan ${index + 1}`} whole />
            ))}
          </div>
        </details>
      ) : null}

      <p className="text-caption text-text-muted m-0">
        Every shop&rsquo;s scans and paper originals, by month:{" "}
        <Link
          href={`/${tree}/supplier-invoices?order=${encodeURIComponent(order.id)}`}
          className="text-text-secondary underline-offset-2 hover:underline"
        >
          open Supplier invoices
        </Link>
        .
      </p>
    </div>
  );
}
