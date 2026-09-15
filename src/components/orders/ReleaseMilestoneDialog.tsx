"use client";

/**
 * The one irreversible click on the payout desk.
 *
 * Releasing pays the shop and cannot be undone from the portal, so the dialog
 * names the share, the amount and the order before asking, shows the shop's
 * own receiving QR at scan size so the person can pay right here, and keeps
 * the wallet's receipt screenshot and reference beside the decision so the
 * proof that money moved lands on the order with it.
 */

import { useEffect, useState } from "react";

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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  NO_PAYOUT_ACCOUNT,
  PayoutDestinationWords,
  PayoutQrPlate,
} from "@/components/orders/PayoutDestination";
import type { Order, PayoutMilestone, SupplierPayoutAccount } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import { presentMilestone } from "@/lib/order-state";

export type ReleaseTarget = {
  order: Pick<Order, "id" | "title">;
  milestone: PayoutMilestone;
};

/** What the person confirms with: the note for the record, the wallet's reference, the receipt screenshot. */
export type ReleaseDecision = {
  note: string;
  reference: string;
  receipt: File | null;
};

type Props = {
  target: ReleaseTarget | null;
  /**
   * Where the money goes. Drawn inside the dialog because this is the moment
   * the person actually scans and sends; `undefined` means the page did not
   * ask, `null` means the shop has no account on file.
   */
  destination?: SupplierPayoutAccount | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (decision: ReleaseDecision) => void;
};

export const DEFAULT_RELEASE_NOTE = "Proof of Fulfilment reviewed";
const RECEIPT_MAX_BYTES = 15 * 1024 * 1024;

export function ReleaseMilestoneDialog({
  target,
  destination,
  busy,
  error,
  onCancel,
  onConfirm,
}: Props) {
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptProblem, setReceiptProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // A fresh record for every share; a note, reference or receipt left over
  // from the last release would be the wrong proof on this one.
  useEffect(() => {
    if (target) {
      setNote("");
      setReference("");
      setReceipt(null);
      setReceiptProblem(null);
    }
  }, [target]);

  // The preview is the picked file itself, shown before any upload so the
  // person can see they grabbed the receipt and not the QR again.
  useEffect(() => {
    if (!receipt) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(receipt);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [receipt]);

  const amount =
    target?.milestone.amountMinor !== undefined
      ? formatPhp(target.milestone.amountMinor)
      : null;

  function pickReceipt(file: File | undefined) {
    setReceiptProblem(null);
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setReceiptProblem("Use a JPEG, PNG or WebP screenshot of the wallet receipt.");
      return;
    }
    if (file.size > RECEIPT_MAX_BYTES) {
      setReceiptProblem(
        "That screenshot is over 15 MB. A plain phone screenshot is enough.",
      );
      return;
    }
    setReceipt(file);
  }

  return (
    <AlertDialog
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <AlertDialogContent
        className={
          destination !== undefined
            ? "max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl!"
            : "max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
        }
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            Release {amount ?? "this share"} to the supplier?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {target
              ? `${presentMilestone(target.milestone.code, target.milestone.sharePercent)} on ${
                  target.order.title || "this order"
                }. This pays the shop and cannot be undone from the portal.`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {destination !== undefined ? (
          <div
            className="rounded-card border border-outline p-3"
            role="group"
            aria-label="Where this money goes"
          >
            {destination ? (
              <div className="flex flex-col gap-3">
                {/* As big as the dialog allows: this is the plate a phone scans. */}
                <div className="w-full">
                  <PayoutQrPlate
                    fileId={destination.qr?.fileId}
                    shopName={destination.shopName}
                    enlarge={false}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <PayoutDestinationWords account={destination} />
                  <p className="text-caption text-text-muted m-0 mt-2">
                    {destination.qr
                      ? "Scan, check the name the wallet shows, send, then release."
                      : "No QR on file. Send to this name and number by hand, then release."}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-body text-warning m-0" role="status">
                {NO_PAYOUT_ACCOUNT}
              </p>
            )}
          </div>
        ) : null}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="release-receipt">Wallet receipt (screenshot)</FieldLabel>
            <input
              id="release-receipt"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              className="text-caption text-text-secondary file:mr-3 file:rounded-field file:border file:border-outline file:bg-surface file:px-3 file:py-1.5 file:text-caption file:text-text-primary"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                pickReceipt(file);
              }}
            />
            {preview && receipt ? (
              <div className="flex items-start gap-3">
                <div className="w-32 shrink-0 overflow-hidden rounded-card border border-outline bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt={`Wallet receipt ${receipt.name}`}
                    className="block h-auto w-full"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-body text-text-primary m-0 truncate">
                    {receipt.name}
                  </p>
                  <button
                    type="button"
                    className="text-caption text-text-secondary mt-1 underline-offset-2 hover:underline"
                    disabled={busy}
                    onClick={() => setReceipt(null)}
                  >
                    Remove this screenshot
                  </button>
                </div>
              </div>
            ) : null}
            <FieldDescription>
              {receiptProblem ? (
                <span className="text-error">{receiptProblem}</span>
              ) : (
                "The wallet's confirmation screen after you send. Stored on the order beside the proof it paid for. Optional, but it is the only record the money moved."
              )}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="release-reference">
              Reference number (optional)
            </FieldLabel>
            <Input
              id="release-reference"
              value={reference}
              maxLength={80}
              autoComplete="off"
              placeholder="e.g. 1234 567 890"
              disabled={busy}
              onChange={(event) => setReference(event.target.value)}
            />
            <FieldDescription>
              As printed on the wallet receipt. The shop sees it with its payout.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="release-note">Note for the record (optional)</FieldLabel>
            <Textarea
              id="release-note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Proof shows the full run boxed and labelled"
              disabled={busy}
            />
            <FieldDescription>
              Stored on the audit trail with your name and the time.
            </FieldDescription>
          </Field>
        </FieldGroup>
        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            Keep waiting
          </AlertDialogCancel>
          <AlertDialogAction
            variant="primary"
            disabled={busy}
            onClick={() =>
              onConfirm({
                note: note.trim() || DEFAULT_RELEASE_NOTE,
                reference: reference.trim(),
                receipt,
              })
            }
          >
            {busy ? "Releasing…" : "Release payout"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
