"use client";

import { QrCode } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getApiBase } from "@/lib/api/client";
import { formatPhp } from "@/lib/format";
import { whenLabel, type PayGridgo } from "@/lib/supplier-money";

/** GRIDGO's QR is an API path (`/public/payment-qr?v=…`) or an absolute link. */
export function payGridgoQrSrc(qrImageUrl: string | null): string | null {
  const value = qrImageUrl?.trim() ?? "";
  if (!value) return null;
  if (value.startsWith("/")) return `${getApiBase().replace(/\/$/, "")}${value}`;
  return /^https:\/\//i.test(value) ? value : null;
}

/**
 * Pay GRIDGO (gridgo-api `docs/SHOP_MONEY_API.md`): GRIDGO's QR Ph, the amount
 * and the reference to put on the transfer, and the deadline. The phone app's
 * `/pay-gridgo` sheet, as a dialog.
 *
 * There is no payment gateway behind this: the QR is GRIDGO's static one, so
 * the shop types the amount and the reference in its own banking app, and the
 * GRIDGO team checks the money arrived before confirming it. Nothing here says
 * it is confirmed automatically, and nothing reopens the shop on a click; the
 * next read after the team confirms does that.
 *
 * It is handed the request from the latest read, so an amount GRIDGO has since
 * lowered (recovered from a payout) is the one shown.
 */
export function PayGridgoDialog({
  open,
  onOpenChange,
  pay,
  paused,
  now = new Date(),
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pay: PayGridgo | null;
  paused: boolean;
  now?: Date;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const qr = pay ? payGridgoQrSrc(pay.qrImageUrl) : null;
  const deadline = pay ? whenLabel(pay.deadlineAt, now) : null;

  async function copy() {
    if (!pay) return;
    try {
      await navigator.clipboard.writeText(pay.reference);
      setCopied(true);
    } catch {
      // The reference stays on screen and selectable.
      setCopied(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="pay-gridgo-dialog">
        {pay ? (
          <>
            <DialogHeader>
              <DialogTitle>
                <span className="text-h3 text-text-primary">Pay GRIDGO {formatPhp(pay.amountMinor)}</span>
              </DialogTitle>
              <DialogDescription>
                <span className="text-body text-text-secondary">
                  {paused
                    ? "New orders are paused until the GRIDGO team confirms this payment. Jobs you already accepted can still be finished."
                    : deadline
                      ? `Due ${deadline}. Unpaid by then, new orders pause until it is paid.`
                      : "Unpaid by the deadline, new orders pause until it is paid."}
                </span>
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-2">
              {qr ? (
                // Drawn on white in both themes: a banking app's camera reads dark on light.
                <div className="rounded-card border border-outline bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the API serves it; no image optimizer */}
                  <img
                    src={qr}
                    alt="GRIDGO's QR Ph code"
                    width={200}
                    height={200}
                    className="block size-[200px] object-contain"
                  />
                </div>
              ) : (
                <div className="flex size-48 flex-col items-center justify-center gap-2 rounded-card bg-surface-variant px-4 text-center">
                  <QrCode className="size-8 text-text-muted" aria-hidden />
                  <p className="text-caption text-text-muted m-0">
                    Ask the GRIDGO team in chat for the QR.
                  </p>
                </div>
              )}
              <p className="text-caption text-text-muted m-0">GRIDGO · QR Ph</p>
            </div>

            <dl className="gg-panel m-0 flex flex-col gap-3">
              <Row label="Amount" value={formatPhp(pay.amountMinor)} testId="pay-gridgo-amount" />
              <Row
                label="Reference"
                value={pay.reference}
                testId="pay-gridgo-reference"
                className="border-t border-outline-subtle pt-3"
              />
            </dl>

            <p className="text-body text-text-secondary m-0">
              Scan with your banking app, enter this amount, and put the reference in the note. The
              GRIDGO team checks the payment arrived and confirms it
              {paused ? "; new orders reopen then." : "."}
            </p>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button variant="primary" onClick={() => void copy()} data-testid="pay-gridgo-copy">
                {copied ? "Reference copied" : "Copy reference"}
              </Button>
            </DialogFooter>
            <p className="sr-only" role="status">
              {copied ? "Reference copied" : ""}
            </p>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                <span className="text-h3 text-text-primary">Nothing to pay</span>
              </DialogTitle>
              <DialogDescription>
                <span className="text-body text-text-secondary">
                  You do not owe GRIDGO anything right now.
                </span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  testId,
  className = "",
}: {
  label: string;
  value: string;
  testId: string;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${className}`} data-testid={testId}>
      <dt className="text-body text-text-muted m-0">{label}</dt>
      <dd
        className="text-body-lg text-text-primary m-0 min-w-0 text-right tabular-nums select-all break-all"
        style={{ fontFamily: "var(--font-medium)" }}
      >
        {value}
      </dd>
    </div>
  );
}
