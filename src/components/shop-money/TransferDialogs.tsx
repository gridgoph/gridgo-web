"use client";

/**
 * The irreversible steps on the shop money desk. Each dialog restates the
 * shop, the amount and where the money goes before the press, keeps its
 * button disabled while the request is in flight (and behind a ref, so a
 * double click cannot send twice), and leans on the API's replay rules for a
 * retry after a dropped connection.
 */

import { useEffect, useRef, useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import {
  describePayoutDestination,
  PayoutDestinationWords,
  PayoutQrPlate,
} from "@/components/orders/PayoutDestination";
import {
  cancelShopTransfer,
  confirmShopPayment,
  confirmShopTransfer,
  markShopTransferUnknown,
  prepareShopTransfer,
  uploadPayoutReceipt,
} from "@/lib/api/client";
import type {
  ShopMoneyRun,
  ShopMoneyRunShop,
  ShopMoneyTransfer,
  ShopPayGridgo,
} from "@/lib/api/types";
import { formatPhp, pesosToMinor } from "@/lib/format";
import {
  isOffsetTransfer,
  manilaInputToIso,
  manilaLocalInput,
  manilaWhenWords,
  recoveredMinor,
  shopMoneyErrorMessage,
  transferRecordBlockers,
} from "@/lib/shop-money";

const RECEIPT_MAX_BYTES = 15 * 1024 * 1024;
const medium = { fontFamily: "var(--font-medium)" } as const;

/** Runs one request at a time; a second press while one is in flight is dropped. */
function useOnce() {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  async function run(task: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return { busy, run };
}

function Restate({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="border-outline m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-field border p-3">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-caption text-text-muted self-baseline">{r.label}</dt>
          <dd className="text-body text-text-primary m-0 self-baseline break-words tabular-nums" style={medium}>
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p className="text-body text-error m-0" role="alert">
      {error}
    </p>
  ) : null;
}

// ---------------------------------------------------------------------------
// Prepare
// ---------------------------------------------------------------------------

export function PrepareTransferDialog({
  open,
  run,
  shop,
  shopName,
  onClose,
  onPrepared,
}: {
  open: boolean;
  run: ShopMoneyRun;
  shop: ShopMoneyRunShop;
  shopName: string;
  onClose: () => void;
  onPrepared: (transfer: ShopMoneyTransfer) => Promise<void> | void;
}) {
  const { busy, run: once } = useOnce();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  function prepare() {
    void once(async () => {
      setError(null);
      try {
        const { transfer } = await prepareShopTransfer(run.id, shop.supplierId);
        await onPrepared(transfer);
      } catch (err) {
        setError(shopMoneyErrorMessage(err, "The transfer was not prepared. Try again."));
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!next && !busy ? onClose() : null)}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Prepare {formatPhp(shop.amountMinor)} for {shopName}?</AlertDialogTitle>
          <AlertDialogDescription>
            GRIDGO checks these {shop.items.length === 1 ? "item" : `${shop.items.length} items`} again,
            freezes the amount and the shop&rsquo;s receiving QR, and reserves them for you. Nothing is
            sent yet: you send it from the wallet next, once, and record it here.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Restate
          rows={[
            { label: "Shop", value: shopName },
            { label: "Amount in the run", value: formatPhp(shop.amountMinor) },
            { label: "Run", value: `${run.data.date}, ${run.data.payoutTime}` },
          ]}
        />
        <p className="text-caption text-text-secondary m-0">
          Only you (or Super Admin) can record or cancel it afterwards. If the amount changes when
          it is prepared, the slip shows the new frozen amount: send that one.
        </p>
        <ErrorLine error={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Not now</AlertDialogCancel>
          <AlertDialogAction variant="primary" disabled={busy} onClick={prepare}>
            {busy ? "Preparing…" : "Prepare transfer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Record (sent)
// ---------------------------------------------------------------------------

export const DEFAULT_SENT_NOTE = "Sent the prepared daily transfer";

export function RecordTransferDialog({
  open,
  transfer,
  shopName,
  onClose,
  onRecorded,
}: {
  open: boolean;
  transfer: ShopMoneyTransfer;
  shopName: string;
  onClose: () => void;
  onRecorded: (message: string) => Promise<void> | void;
}) {
  const { busy, run: once } = useOnce();
  const offset = isOffsetTransfer(transfer);
  const frozen = transfer.data.netAmountMinor;
  const account = transfer.data.payoutAccount;

  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(() => manilaLocalInput());
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptProblem, setReceiptProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState(DEFAULT_SENT_NOTE);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  // An uploaded receipt is kept for a retry so a dropped connection never
  // uploads the same screenshot twice.
  const uploaded = useRef<{ file: File; id: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setPaidAt(manilaLocalInput());
    setReference("");
    setReceipt(null);
    setReceiptProblem(null);
    setConfirmed(false);
    setReason(offset ? "Whole amount covered by recovered debt" : DEFAULT_SENT_NOTE);
    setError(null);
    setTried(false);
  }, [open, offset]);

  useEffect(() => {
    if (!receipt) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(receipt);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [receipt]);

  const paidAtIso = manilaInputToIso(paidAt);
  const blockers = offset
    ? [
        ...(!paidAtIso ? ["Enter when this was settled."] : []),
        ...(!reason.trim() ? ["Write a note for the record."] : []),
        ...(!confirmed ? ["Tick that nothing was sent."] : []),
      ]
    : transferRecordBlockers(frozen, {
        typedAmount: pesosToMinor(amount),
        paidAtIso,
        reference,
        hasReceipt: Boolean(receipt),
        confirmed,
        reason,
      });

  function pickReceipt(file: File | undefined) {
    setReceiptProblem(null);
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setReceiptProblem("Use a JPEG, PNG or WebP screenshot of the receipt.");
      return;
    }
    if (file.size > RECEIPT_MAX_BYTES) {
      setReceiptProblem("That screenshot is over 15 MB. A plain phone screenshot is enough.");
      return;
    }
    setReceipt(file);
  }

  function record() {
    setTried(true);
    if (blockers.length || !paidAtIso) return;
    void once(async () => {
      setError(null);
      try {
        if (offset) {
          await confirmShopTransfer(transfer.id, {
            amountMinor: 0,
            paidAt: paidAtIso,
            offsetConfirmed: true,
            reason: reason.trim(),
          });
          await onRecorded(`Recorded. ${shopName}'s items are settled from recovered debt; nothing was sent.`);
          return;
        }
        let receiptFileId = uploaded.current?.file === receipt ? uploaded.current.id : null;
        if (!receiptFileId && receipt) {
          const stored = await uploadPayoutReceipt(receipt);
          uploaded.current = { file: receipt, id: stored.fileId };
          receiptFileId = stored.fileId;
        }
        const { replayed } = await confirmShopTransfer(transfer.id, {
          amountMinor: frozen,
          paidAt: paidAtIso,
          reference: reference.trim(),
          receiptFileId: receiptFileId!,
          fundsSentConfirmed: true,
          reason: reason.trim(),
        });
        await onRecorded(
          replayed
            ? `Already recorded: ${formatPhp(frozen)} to ${shopName}. Nothing was recorded twice.`
            : `Recorded: ${formatPhp(frozen)} sent to ${shopName}. The shop sees the reference in Money.`,
        );
      } catch (err) {
        setError(shopMoneyErrorMessage(err, "The transfer was not recorded. Try again."));
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!next && !busy ? onClose() : null)}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl!">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {offset ? `Settle ${shopName}'s items without a transfer?` : `Record ${formatPhp(frozen)} sent to ${shopName}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {offset
              ? `The whole ${formatPhp(transfer.data.grossAmountMinor)} is covered by what ${shopName} owed GRIDGO, so no money moves. Recording settles the items and the debt.`
              : "Record only after the money has left. This marks every item in the transfer paid, and it cannot be undone here."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Restate
          rows={[
            { label: "Shop", value: shopName },
            { label: offset ? "To send" : "Sent", value: offset ? "Nothing (₱0.00)" : formatPhp(frozen) },
            ...(recoveredMinor(transfer.data.items) > 0
              ? [{ label: "Recovered debt", value: formatPhp(recoveredMinor(transfer.data.items)) }]
              : []),
            ...(offset ? [] : [{ label: "To", value: describePayoutDestination(account) }]),
          ]}
        />

        <FieldGroup>
          {!offset ? (
            <>
              <Field data-invalid={tried && pesosToMinor(amount) !== frozen ? true : undefined}>
                <FieldLabel htmlFor="record-amount">Amount you sent (₱)</FieldLabel>
                <Input
                  id="record-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  className="max-w-48 tabular-nums"
                  value={amount}
                  disabled={busy}
                  placeholder={(frozen / 100).toFixed(2)}
                  aria-invalid={tried && pesosToMinor(amount) !== frozen ? true : undefined}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <FieldDescription>
                  Type it from the receipt, not from this screen. It must be the prepared {formatPhp(frozen)}.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="record-receipt">Receipt screenshot</FieldLabel>
                <input
                  id="record-receipt"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  className="text-caption text-text-secondary file:mr-3 file:min-h-11 file:rounded-field file:border file:border-outline file:bg-surface file:px-3 file:py-1.5 file:text-caption file:text-text-primary"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    pickReceipt(file);
                  }}
                />
                {preview && receipt ? (
                  <div className="flex items-start gap-3">
                    <div className="w-28 shrink-0 overflow-hidden rounded-card border border-outline bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, never uploaded until Record */}
                      <img src={preview} alt={`Receipt ${receipt.name}`} className="block h-auto w-full" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-body text-text-primary m-0 truncate">{receipt.name}</p>
                      <button
                        type="button"
                        className="text-caption text-text-secondary min-h-11 underline-offset-2 hover:underline"
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
                    "The wallet's or bank's confirmation screen after you send. Required."
                  )}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="record-reference">Reference number</FieldLabel>
                <Input
                  id="record-reference"
                  value={reference}
                  maxLength={80}
                  autoComplete="off"
                  disabled={busy}
                  placeholder="As printed on the receipt"
                  onChange={(e) => setReference(e.target.value)}
                />
                <FieldDescription>The shop sees it with its payout.</FieldDescription>
              </Field>
            </>
          ) : null}
          <Field>
            <FieldLabel htmlFor="record-paid-at">{offset ? "Settled at (Manila time)" : "Sent at (Manila time)"}</FieldLabel>
            <Input
              id="record-paid-at"
              type="datetime-local"
              className="max-w-64"
              value={paidAt}
              max={manilaLocalInput()}
              disabled={busy}
              onChange={(e) => setPaidAt(e.target.value)}
            />
            <FieldDescription>When the money actually left, from the receipt.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="record-note">Note for the record</FieldLabel>
            <Textarea
              id="record-note"
              rows={2}
              maxLength={2000}
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
            <FieldDescription>Kept on the audit trail with your name and the time.</FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id="record-confirmed"
              checked={confirmed}
              disabled={busy}
              onCheckedChange={(checked) => setConfirmed(Boolean(checked))}
            />
            <FieldLabel htmlFor="record-confirmed" className="font-normal">
              {offset
                ? "No money was sent, and none should be: the debt covers it."
                : `I sent ${formatPhp(frozen)} to ${account.accountName} once.`}
            </FieldLabel>
          </Field>
        </FieldGroup>

        {tried && blockers.length ? (
          <ul className="text-body text-error m-0 flex list-disc flex-col gap-1 pl-5" role="alert">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : null}
        <ErrorLine error={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Not yet</AlertDialogCancel>
          <AlertDialogAction
            variant="primary"
            disabled={busy}
            aria-disabled={blockers.length > 0 || undefined}
            onClick={(event) => {
              // Keep the dialog open on a refused press; it shows what is missing.
              event.preventDefault();
              record();
            }}
          >
            {busy ? "Recording…" : offset ? "Settle without a transfer" : "Record transfer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Unknown / not sent
// ---------------------------------------------------------------------------

export function TransferOutcomeDialog({
  open,
  mode,
  transfer,
  shopName,
  onClose,
  onDone,
}: {
  open: boolean;
  mode: "unknown" | "cancel";
  transfer: ShopMoneyTransfer;
  shopName: string;
  onClose: () => void;
  onDone: (message: string) => Promise<void> | void;
}) {
  const { busy, run: once } = useOnce();
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (!open) return;
    setReason("");
    setChecked(false);
    setError(null);
    setTried(false);
  }, [open, mode]);
  const amount = formatPhp(transfer.data.netAmountMinor);
  const missing = !reason.trim() || (mode === "cancel" && !checked);

  function submit() {
    setTried(true);
    if (missing) return;
    void once(async () => {
      setError(null);
      try {
        if (mode === "unknown") {
          await markShopTransferUnknown(transfer.id, reason.trim());
          await onDone(`Marked unknown. ${amount} to ${shopName} stays reserved; do not send it again until you know.`);
        } else {
          await cancelShopTransfer(transfer.id, reason.trim());
          await onDone(`Recorded as not sent. ${amount} stays owed to ${shopName} and joins the next run.`);
        }
      } catch (err) {
        setError(shopMoneyErrorMessage(err, "Nothing was changed. Try again."));
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!next && !busy ? onClose() : null)}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {mode === "unknown" ? `Not sure whether ${amount} reached ${shopName}?` : `Record that ${amount} was not sent?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {mode === "unknown"
              ? "The transfer stays reserved and must not be sent again. Check the wallet or bank, then come back and record it as sent or as not sent."
              : `Only after checking the wallet or bank history: no money left GRIDGO for this transfer. The attempt is retired and ${shopName}'s balance goes into a later run.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Restate
          rows={[
            { label: "Shop", value: shopName },
            { label: "Prepared amount", value: amount },
            { label: "To", value: describePayoutDestination(transfer.data.payoutAccount) },
          ]}
        />
        <FieldGroup>
          <Field data-invalid={tried && !reason.trim() ? true : undefined}>
            <FieldLabel htmlFor="outcome-reason">
              {mode === "unknown" ? "What happened" : "How you checked"}
            </FieldLabel>
            <Textarea
              id="outcome-reason"
              rows={2}
              maxLength={2000}
              value={reason}
              disabled={busy}
              placeholder={
                mode === "unknown" ? "e.g. The wallet app timed out after I pressed Send" : "e.g. Wallet history shows no transfer to this shop today"
              }
              aria-invalid={tried && !reason.trim() ? true : undefined}
              onChange={(e) => setReason(e.target.value)}
            />
            <FieldDescription>Kept on the audit trail with your name and the time.</FieldDescription>
          </Field>
          {mode === "cancel" ? (
            <Field orientation="horizontal">
              <Checkbox
                id="outcome-checked"
                checked={checked}
                disabled={busy}
                onCheckedChange={(c) => setChecked(Boolean(c))}
              />
              <FieldLabel htmlFor="outcome-checked" className="font-normal">
                I checked: no money was sent for this transfer.
              </FieldLabel>
            </Field>
          ) : null}
        </FieldGroup>
        {tried && missing ? (
          <p className="text-body text-error m-0" role="alert">
            {!reason.trim() ? "Write a note for the record." : "Tick that you checked no money was sent."}
          </p>
        ) : null}
        <ErrorLine error={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Back</AlertDialogCancel>
          <AlertDialogAction
            variant={mode === "cancel" ? "danger" : "outline"}
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            {busy ? "Saving…" : mode === "unknown" ? "Mark unknown" : "Record not sent"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Pay GRIDGO received
// ---------------------------------------------------------------------------

export function ConfirmPayGridgoDialog({
  open,
  request,
  shopName,
  onClose,
  onConfirmed,
}: {
  open: boolean;
  request: ShopPayGridgo;
  shopName: string;
  onClose: () => void;
  onConfirmed: (message: string) => Promise<void> | void;
}) {
  const { busy, run: once } = useOnce();
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("Payment seen in GRIDGO's account");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (!open) return;
    setReference("");
    setReason("Payment seen in GRIDGO's account");
    setChecked(false);
    setError(null);
    setTried(false);
  }, [open]);
  const amount = formatPhp(request.amountMinor);
  const problems = [
    ...(!reference.trim() ? ["Enter the bank reference of the incoming payment."] : []),
    ...(!reason.trim() ? ["Write a note for the record."] : []),
    ...(!checked ? [`Tick that ${amount} arrived.`] : []),
  ];

  function submit() {
    setTried(true);
    if (problems.length) return;
    void once(async () => {
      setError(null);
      try {
        const { replayed } = await confirmShopPayment(request.requestId, {
          amountMinor: request.amountMinor,
          reference: reference.trim(),
          reason: reason.trim(),
        });
        await onConfirmed(
          replayed
            ? `Already confirmed: ${amount} from ${shopName}. Nothing was recorded twice.`
            : `Confirmed ${amount} from ${shopName}. If new orders were paused, they reopen now.`,
        );
      } catch (err) {
        setError(shopMoneyErrorMessage(err, "The payment was not confirmed. Try again."));
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!next && !busy ? onClose() : null)}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm {amount} received from {shopName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Check GRIDGO&rsquo;s own account for the incoming payment first. Confirming lowers what the
            shop owes and lifts its new-order pause. It cannot be undone here.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Restate
          rows={[
            { label: "Shop", value: shopName },
            { label: "Amount", value: amount },
            { label: "Shop's reference", value: request.reference },
            { label: "Due by", value: manilaWhenWords(request.deadlineAt) },
          ]}
        />
        <FieldGroup>
          <Field data-invalid={tried && !reference.trim() ? true : undefined}>
            <FieldLabel htmlFor="paygg-reference">Bank reference of the payment</FieldLabel>
            <Input
              id="paygg-reference"
              value={reference}
              maxLength={80}
              autoComplete="off"
              disabled={busy}
              placeholder="From GRIDGO's incoming transaction"
              aria-invalid={tried && !reference.trim() ? true : undefined}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="paygg-note">Note for the record</FieldLabel>
            <Textarea id="paygg-note" rows={2} maxLength={2000} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="paygg-checked" checked={checked} disabled={busy} onCheckedChange={(c) => setChecked(Boolean(c))} />
            <FieldLabel htmlFor="paygg-checked" className="font-normal">
              I saw {amount} arrive in GRIDGO&rsquo;s account.
            </FieldLabel>
          </Field>
        </FieldGroup>
        {tried && problems.length ? (
          <p className="text-body text-error m-0" role="alert">
            {problems[0]}
          </p>
        ) : null}
        <ErrorLine error={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Back</AlertDialogCancel>
          <AlertDialogAction
            variant="primary"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            {busy ? "Confirming…" : "Confirm payment"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The frozen account, drawn the way the release dialog draws it: the plate to scan and the name to check. */
export function FrozenDestination({ transfer, shopName }: { transfer: ShopMoneyTransfer; shopName: string }) {
  const account = transfer.data.payoutAccount;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="w-full max-w-56 shrink-0">
        <PayoutQrPlate fileId={account.qr?.fileId} shopName={account.shopName ?? shopName} />
      </div>
      <div className="min-w-0 flex-1">
        <PayoutDestinationWords account={account} />
        <p className="text-caption text-text-muted m-0 mt-2">
          Frozen when prepared. Scan it, check that the wallet shows this name, then send.
        </p>
      </div>
    </div>
  );
}
