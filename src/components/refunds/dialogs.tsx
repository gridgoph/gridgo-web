"use client";

/**
 * The refund case's confirmations. Each one restates what is about to happen
 * in money and people before the click, because none of them can be undone
 * from the portal: a rejection reaches the client, an approval reserves money,
 * a recorded transfer is the ledger's word that cash left GRIDGO's wallet.
 */

import { useEffect, useState } from "react";

import {
  PayoutDestinationWords,
  PayoutQrPlate,
} from "@/components/orders/PayoutDestination";
import { ScreenshotField } from "@/components/refunds/parts";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type {
  RefundAttempt,
  RefundKind,
  SupplierPayoutAccount,
  SupplierSettlementPayout,
} from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import {
  SETTLEMENT_PAYOUT_LABEL,
  TRANSFER_EVIDENCE_LABEL,
  isoFromLocalInput,
  localDateTimeInput,
} from "@/lib/refunds";

export const CLIENT_READS_THIS = "The client can read this in the GRIDGO app.";
const REASON_MAX = 2000;

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p className="text-body text-error m-0" role="alert">
      {error}
    </p>
  ) : null;
}

/** A labelled tick box that keeps the 44px floor and reads as one control. */
export function Confirmation({
  id,
  checked,
  onChange,
  disabled,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5" htmlFor={id}>
      <Checkbox
        id={id}
        className="mt-1"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <span className="text-body text-text-primary">{children}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Reject
// ---------------------------------------------------------------------------

export function RejectRefundDialog({
  open,
  busy,
  error,
  onCancel,
  onReject,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onReject: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const ready = reason.trim().length > 0;
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Reject this refund request?</AlertDialogTitle>
          <AlertDialogDescription>
            The client is told it was rejected and sees your reason. Work and payouts on
            the order resume. Any claim on the order stays open on its own.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="reject-reason">Reason for the client</FieldLabel>
            <Textarea
              id="reject-reason"
              rows={3}
              maxLength={REASON_MAX}
              value={reason}
              disabled={busy}
              placeholder="e.g. The replacement was delivered and you confirmed it is correct."
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldDescription>{CLIENT_READS_THIS} Write it for them.</FieldDescription>
          </Field>
        </FieldGroup>
        <ErrorLine error={error} />
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            Keep the request open
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy || !ready}
            onClick={() => onReject(reason.trim())}
          >
            {busy ? "Rejecting…" : "Reject request"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Approve the settlement
// ---------------------------------------------------------------------------

export function ApproveSettlementDialog({
  open,
  totalMinor,
  remainingShopMinor,
  cancelsOrder,
  busy,
  error,
  onCancel,
  onApprove,
}: {
  open: boolean;
  totalMinor: number;
  remainingShopMinor: number;
  /** Before handover the order is cancelled; after it, it completes with a refund. */
  cancelsOrder: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onApprove: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Approve a {formatPhp(totalMinor)} refund?</AlertDialogTitle>
          <AlertDialogDescription>
            Approving reserves the money. It sends nothing: a payer reserves the transfer
            next, sends it from a wallet and records the evidence.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">
          <li className="text-body text-text-secondary">
            {cancelsOrder
              ? "The order is cancelled and any unpaid balance is dropped."
              : "The order closes as delivered, with this refund on it."}
          </li>
          <li className="text-body text-text-secondary">
            The shop&rsquo;s unpaid shares close as replaced by this settlement. Shares
            already paid stay paid.
          </li>
          {remainingShopMinor > 0 ? (
            <li className="text-body text-text-secondary">
              {formatPhp(remainingShopMinor)} becomes the shop&rsquo;s agreed refund
              settlement payout, recorded separately.
            </li>
          ) : null}
          <li className="text-body text-text-secondary">
            An approval cannot be rejected or withdrawn afterwards.
          </li>
        </ul>
        <ErrorLine error={error} />
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            Go back
          </AlertDialogCancel>
          <AlertDialogAction variant="primary" disabled={busy} onClick={onApprove}>
            {busy ? "Approving…" : `Approve ${formatPhp(totalMinor)}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Record the client transfer
// ---------------------------------------------------------------------------

export type TransferRecord = {
  reference: string;
  paidAt: string;
  evidence: File;
  reason: string;
};

export function RecordTransferDialog({
  attempt,
  open,
  unconfirmed,
  busy,
  error,
  onCancel,
  onRecord,
}: {
  attempt: RefundAttempt | null;
  open: boolean;
  /** The wallet did not confirm earlier: this records that same transfer. */
  unconfirmed: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onRecord: (record: TransferRecord) => void;
}) {
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const [now, setNow] = useState("");

  useEffect(() => {
    if (!open) return;
    const stamp = localDateTimeInput(new Date());
    setReference("");
    setPaidAt(stamp);
    setNow(stamp);
    setEvidence(null);
    setReason(
      unconfirmed
        ? "The wallet history confirms your refund was sent."
        : "Your refund was sent to your receiving account.",
    );
  }, [open, unconfirmed]);

  const paidIso = isoFromLocalInput(paidAt);
  const future = paidIso !== null && Date.parse(paidIso) > Date.now() + 60_000;
  const ready =
    reference.trim().length > 0 &&
    paidIso !== null &&
    !future &&
    evidence &&
    reason.trim();

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {unconfirmed
              ? "Record the transfer that went through"
              : "Record the transfer"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {attempt
              ? `${formatPhp(attempt.amountMinor)} to ${attempt.destination.accountName}. `
              : ""}
            {unconfirmed
              ? "Only record it if the wallet history shows this exact transfer. Do not send it again."
              : "Record it once the wallet shows the transfer as sent."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="transfer-reference">Wallet reference number</FieldLabel>
            <Input
              id="transfer-reference"
              value={reference}
              maxLength={120}
              autoComplete="off"
              disabled={busy}
              placeholder="As printed on the wallet screen"
              onChange={(event) => setReference(event.target.value)}
            />
            <FieldDescription>
              Stored in capitals. The same reference cannot be recorded twice.
            </FieldDescription>
          </Field>
          <Field data-invalid={future ? true : undefined}>
            <FieldLabel htmlFor="transfer-paid-at">Sent at</FieldLabel>
            <Input
              id="transfer-paid-at"
              type="datetime-local"
              value={paidAt}
              max={now || undefined}
              disabled={busy}
              aria-invalid={future ? true : undefined}
              onChange={(event) => setPaidAt(event.target.value)}
            />
            <FieldDescription>
              {future ? (
                <span className="text-error">
                  The transfer time cannot be in the future.
                </span>
              ) : (
                "The time on the wallet's confirmation screen, in your local time."
              )}
            </FieldDescription>
          </Field>
          <ScreenshotField
            id="transfer-evidence"
            label={TRANSFER_EVIDENCE_LABEL}
            description="A screenshot of the wallet's confirmation. It is evidence of the transfer, not an official receipt. The client can see it."
            file={evidence}
            onFile={setEvidence}
            disabled={busy}
          />
          <Field>
            <FieldLabel htmlFor="transfer-reason">Note for the client</FieldLabel>
            <Textarea
              id="transfer-reason"
              rows={2}
              maxLength={REASON_MAX}
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldDescription>{CLIENT_READS_THIS}</FieldDescription>
          </Field>
        </FieldGroup>
        <ErrorLine error={error} />
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            Not yet
          </AlertDialogCancel>
          <AlertDialogAction
            variant="primary"
            disabled={busy || !ready}
            onClick={() =>
              evidence && paidIso
                ? onRecord({
                    reference: reference.trim(),
                    paidAt: paidIso,
                    evidence,
                    reason: reason.trim(),
                  })
                : undefined
            }
          >
            {busy ? "Recording…" : "Record transfer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Reconcile
// ---------------------------------------------------------------------------

export type ReconcileMode = "unknown" | "failed";

export function ReconcileDialog({
  mode,
  busy,
  error,
  onCancel,
  onReconcile,
}: {
  mode: ReconcileMode | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onReconcile: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (!mode) return;
    setConfirmed(false);
    setReason(
      mode === "unknown"
        ? "We are confirming your refund transfer with the wallet."
        : "The transfer did not go through. Your refund will be sent again.",
    );
  }, [mode]);
  const ready = reason.trim().length > 0 && (mode === "unknown" || confirmed);

  return (
    <AlertDialog
      open={mode !== null}
      onOpenChange={(next) => !next && !busy && onCancel()}
    >
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {mode === "failed"
              ? "Confirm no money left the wallet?"
              : "Mark this transfer as unconfirmed?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {mode === "failed"
              ? "The reservation is released and the refund can be reserved and sent again. Only do this after checking the sending wallet's history."
              : "Use this when the wallet timed out or you cannot tell whether money moved. The transfer stays reserved to you, and nobody can send again until it is settled."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          {mode === "failed" ? (
            <Confirmation
              id="no-transfer-confirmed"
              checked={confirmed}
              onChange={setConfirmed}
              disabled={busy}
            >
              I checked the sending wallet&rsquo;s history. No money left it for this
              refund.
            </Confirmation>
          ) : null}
          <Field>
            <FieldLabel htmlFor="reconcile-reason">Note for the client</FieldLabel>
            <Textarea
              id="reconcile-reason"
              rows={2}
              maxLength={REASON_MAX}
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldDescription>{CLIENT_READS_THIS}</FieldDescription>
          </Field>
        </FieldGroup>
        <ErrorLine error={error} />
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            Go back
          </AlertDialogCancel>
          <AlertDialogAction
            variant="outline"
            disabled={busy || !ready}
            onClick={() => onReconcile(reason.trim())}
          >
            {busy
              ? "Saving…"
              : mode === "failed"
                ? "Confirm no transfer"
                : "Mark unconfirmed"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// The shop's agreed settlement payout
// ---------------------------------------------------------------------------

export type SettlementPayoutRecord = {
  reference: string;
  receipt: File;
  reason: string;
};

export function SettlementPayoutDialog({
  payout,
  account,
  busy,
  error,
  onCancel,
  onRecord,
}: {
  payout: SupplierSettlementPayout | null;
  /** The shop's current receiving account; its version is what gets verified. */
  account: SupplierPayoutAccount | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onRecord: (record: SettlementPayoutRecord) => void;
}) {
  const [verified, setVerified] = useState(false);
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!payout) return;
    setVerified(false);
    setReference("");
    setReceipt(null);
    setReason("Agreed remaining shop payment sent.");
  }, [payout]);
  const ready =
    Boolean(account?.qr) &&
    verified &&
    reference.trim().length > 0 &&
    receipt !== null &&
    reason.trim().length > 0;

  return (
    <AlertDialog
      open={payout !== null}
      onOpenChange={(next) => !next && !busy && onCancel()}
    >
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl!">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Record {payout ? formatPhp(payout.amountMinor) : ""} to the shop?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {SETTLEMENT_PAYOUT_LABEL}: the exact amount the shop is still owed after the
            client refund. Pay it to the shop&rsquo;s current receiving QR first. This
            record cannot be undone from the portal.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div
          className="rounded-card border border-outline p-3"
          role="group"
          aria-label="Where this money goes"
        >
          {account ? (
            <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
              <PayoutQrPlate
                fileId={account.qr?.fileId}
                shopName={account.shopName}
                enlarge={false}
              />
              <div className="min-w-0">
                <PayoutDestinationWords account={account} />
                <p className="text-caption text-text-muted m-0 mt-2 tabular-nums">
                  Receiving account version {account.version}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-body text-warning m-0" role="status">
              This shop has no receiving account on file. Ask them to add one before
              paying.
            </p>
          )}
        </div>
        <FieldGroup>
          <Confirmation
            id="settlement-destination-verified"
            checked={verified}
            onChange={setVerified}
            disabled={busy || !account?.qr}
          >
            I scanned this QR and the wallet named{" "}
            <span style={{ fontFamily: "var(--font-medium)" }}>
              {account?.accountName ?? "the shop"}
            </span>{" "}
            before I sent the money.
          </Confirmation>
          <ScreenshotField
            id="settlement-receipt"
            label={TRANSFER_EVIDENCE_LABEL}
            description="The wallet's confirmation screen. Required. The shop can see it; the client never does."
            file={receipt}
            onFile={setReceipt}
            disabled={busy}
          />
          <Field>
            <FieldLabel htmlFor="settlement-reference">
              Wallet reference number
            </FieldLabel>
            <Input
              id="settlement-reference"
              value={reference}
              maxLength={80}
              autoComplete="off"
              disabled={busy}
              onChange={(event) => setReference(event.target.value)}
            />
            <FieldDescription>
              Required. The shop sees it with the payout.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="settlement-reason">Note for the record</FieldLabel>
            <Textarea
              id="settlement-reason"
              rows={2}
              maxLength={REASON_MAX}
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldDescription>
              Operations and Super Admin read this. The client never sees shop payments.
            </FieldDescription>
          </Field>
        </FieldGroup>
        <ErrorLine error={error} />
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            Not yet
          </AlertDialogCancel>
          <AlertDialogAction
            variant="primary"
            disabled={busy || !ready}
            onClick={() =>
              receipt
                ? onRecord({
                    reference: reference.trim(),
                    receipt,
                    reason: reason.trim(),
                  })
                : undefined
            }
          >
            {busy ? "Recording…" : "Record shop payout"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// File a request for the client
// ---------------------------------------------------------------------------

export type FiledRequest = { kind: RefundKind; reason: string; evidence: File | null };

export function FileRefundDialog({
  open,
  late,
  busy,
  error,
  onCancel,
  onFile,
}: {
  open: boolean;
  /** The complaint deadline has passed: only Super Admin may file. */
  late: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onFile: (request: FiledRequest) => void;
}) {
  const [kind, setKind] = useState<RefundKind>("cancellation");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  useEffect(() => {
    if (!open) return;
    setKind("cancellation");
    setReason("");
    setEvidence(null);
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>File a refund request for the client?</AlertDialogTitle>
          <AlertDialogDescription>
            Filing stops work and every payout on this order at once. The client then adds
            their own receiving QR in the GRIDGO app; nobody else can.
            {late ? " The complaint deadline has passed, so this is a late case." : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel id="file-kind-label">What the client is asking for</FieldLabel>
            <RadioGroup
              aria-labelledby="file-kind-label"
              value={kind}
              onValueChange={(value) => setKind(value as RefundKind)}
              disabled={busy}
              className="gap-1"
            >
              {(
                [
                  ["cancellation", "Cancellation", "They no longer want the order."],
                  [
                    "complaint",
                    "Complaint",
                    "Something is wrong with the work or the delivery.",
                  ],
                ] as const
              ).map(([value, label, detail]) => (
                <label
                  key={value}
                  className="flex min-h-11 cursor-pointer items-start gap-3 py-1"
                >
                  <RadioGroupItem value={value} className="mt-1" aria-label={label} />
                  <span className="min-w-0">
                    <span className="text-body text-text-primary block">{label}</span>
                    <span className="text-caption text-text-muted block">{detail}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="file-reason">The client&rsquo;s reason</FieldLabel>
            <Textarea
              id="file-reason"
              rows={3}
              maxLength={REASON_MAX}
              value={reason}
              disabled={busy}
              placeholder="In the client's words, as they told you"
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldDescription>{CLIENT_READS_THIS}</FieldDescription>
          </Field>
          <ScreenshotField
            id="file-evidence"
            label="Evidence (optional)"
            description="A photo or screenshot that supports the request."
            file={evidence}
            onFile={setEvidence}
            disabled={busy}
          />
        </FieldGroup>
        <ErrorLine error={error} />
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            Go back
          </AlertDialogCancel>
          <AlertDialogAction
            variant="outline"
            disabled={busy || !reason.trim()}
            onClick={() => onFile({ kind, reason: reason.trim(), evidence })}
          >
            {busy ? "Filing…" : "File and pause the order"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
