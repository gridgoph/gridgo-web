"use client";

/**
 * Every Operations cash decision on an order. Each dialog names the money and
 * the people before the click: these move a rider's wallet, cancel an order
 * or record a transfer, and none can be undone from the portal.
 */

import { useCallback, useEffect, useState } from "react";

import type { DeskContext } from "@/components/cash/CashDesk";
import {
  EvidenceButton,
  ErrorLine,
  FileIdField,
  MoneyPlate,
  ReasonField,
  type PlateLine,
} from "@/components/cash/parts";
import {
  PayoutDestinationWords,
  PayoutQrPlate,
} from "@/components/orders/PayoutDestination";
import { Confirmation } from "@/components/refunds/dialogs";
import { ScreenshotField } from "@/components/refunds/parts";
import { useCommandKeys, useUploadOnce } from "@/components/refunds/useCommand";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/components/ui/toast";
import {
  cashOrderAction,
  uploadCashEvidence,
  type CashIncident,
  type CashOrderAction,
  type StaffCashEvidencePurpose,
} from "@/lib/api/cash";
import { getSupplierPayoutAccount } from "@/lib/api/client";
import type { Order, SupplierPayoutAccount } from "@/lib/api/types";
import {
  CASH_INCIDENT_REASON_MAX,
  REMEDY_LABEL,
  cashErrorMessage,
  cashErrorNeedsReload,
  isRefundRemedy,
  type CashRemedyCase,
  type ShopFailurePath,
} from "@/lib/cash";
import { formatDateTime, formatPhp, minorToPesosInput, pesosToMinor } from "@/lib/format";

export const shopNameOf = (order: Order): string =>
  order.supplierContact?.shopName || "Shop not on record";

const orderLine = (order: Order): PlateLine => ({
  label: "Order",
  value: order.title ? `${order.title} (${order.id})` : order.id,
});

// ---------------------------------------------------------------------------
// One dialog shell: keys, busy state, error copy, reload.
// ---------------------------------------------------------------------------

type Submit = (
  run: (action: CashOrderAction, body: Record<string, unknown>) => Promise<void>,
) => Promise<void>;

function CashActionDialog({
  open,
  order,
  ctx,
  title,
  description,
  ready,
  submitLabel,
  busyLabel,
  variant = "primary",
  success,
  failure,
  onClose,
  onSubmit,
  children,
}: {
  open: boolean;
  order: Order;
  ctx: DeskContext;
  title: string;
  description: React.ReactNode;
  ready: boolean;
  submitLabel: string;
  busyLabel: string;
  variant?: "primary" | "destructive";
  success: string;
  failure: string;
  onClose: () => void;
  /** Uploads what it needs, then calls `run` once with the action body. */
  onSubmit: Submit;
  children: (busy: boolean) => React.ReactNode;
}) {
  const { keyFor, reset } = useCommandKeys();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    reset();
    setError(null);
  }, [open, reset]);

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(async (action, rest) => {
        const body = { expectedVersion: order.cash?.version ?? 1, ...rest };
        await cashOrderAction(
          order.id,
          action,
          body,
          keyFor({ order: order.id, action, ...body }),
        );
      });
      toast.add({ type: "success", title: success });
      onClose();
      await ctx.reload();
    } catch (err) {
      setError(cashErrorMessage(err, failure));
      if (cashErrorNeedsReload(err)) void ctx.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children(busy)}
        <ErrorLine error={error} />
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant={variant}
            disabled={busy || !ready}
            onClick={() => void submit()}
          >
            {busy ? busyLabel : submitLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function useStaffUpload(purpose: StaffCashEvidencePurpose) {
  const upload = useCallback(
    (file: File) => uploadCashEvidence(file, purpose),
    [purpose],
  );
  return useUploadOnce(upload);
}

function useOpenReset(open: boolean, reset: () => void) {
  useEffect(() => {
    if (open) reset();
    // Only on opening: a fresh decision starts blank.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

// ---------------------------------------------------------------------------
// No-show
// ---------------------------------------------------------------------------

export function NoShowDialog({
  order,
  action,
  ctx,
  onClose,
}: {
  order: Order;
  action: "approve" | "reject" | null;
  ctx: DeskContext;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [returned, setReturned] = useState(false);
  const upload = useStaffUpload("cash_return_photo");
  const open = action !== null;
  useOpenReset(open, () => {
    setReason("");
    setPhoto(null);
    setReturned(false);
  });
  const approving = action === "approve";
  const rider = ctx.riderName(order.riderId);
  const advance = order.cashAmounts?.shopMinor ?? 0;
  const ready = reason.trim().length > 0 && (!approving || (Boolean(photo) && returned));

  return (
    <CashActionDialog
      open={open}
      order={order}
      ctx={ctx}
      title={
        approving
          ? `Approve the no-show and reimburse ${rider}?`
          : "Reject this no-show report?"
      }
      description={
        approving
          ? "The rider's shop advance goes back to their wallet and the client owes the order total online before they can order with cash again. The order is not marked collected."
          : "The rider keeps the parcel and the order stays out for delivery. The report stays on record and the rider can report again."
      }
      ready={ready}
      variant={approving ? "primary" : "destructive"}
      submitLabel={approving ? `Reimburse ${formatPhp(advance)}` : "Reject report"}
      busyLabel={approving ? "Approving…" : "Rejecting…"}
      success={
        approving
          ? `${formatPhp(advance)} returned to ${rider}'s wallet`
          : "No-show report rejected"
      }
      failure="Could not record the no-show decision. Try again."
      onClose={onClose}
      onSubmit={async (run) => {
        if (approving) {
          const returnPhotoFileId = await upload(photo as File);
          await run("approve-no-show", { reason: reason.trim(), returnPhotoFileId });
        } else {
          await run("reject-no-show", { reason: reason.trim() });
        }
      }}
    >
      {(busy) => (
        <>
          {approving ? (
            <MoneyPlate
              caption={`Back to ${rider}'s wallet`}
              amountMinor={advance}
              lines={[
                { label: "Rider", value: rider },
                orderLine(order),
                { label: "Client then owes", value: formatPhp(order.totalMinor) },
              ]}
            />
          ) : null}
          <FieldGroup>
            {approving ? (
              <>
                <ScreenshotField
                  id="no-show-return-photo"
                  noun="photo"
                  label="Photo of the parcel back at GRIDGO"
                  description="Your own photo, taken when the rider returned it."
                  file={photo}
                  onFile={setPhoto}
                  disabled={busy}
                />
                <Confirmation
                  id="no-show-returned"
                  checked={returned}
                  disabled={busy}
                  onChange={setReturned}
                >
                  The parcel is back with GRIDGO.
                </Confirmation>
              </>
            ) : null}
            <ReasonField
              id="no-show-reason"
              label="Reason"
              value={reason}
              onChange={setReason}
              disabled={busy}
              placeholder={
                approving
                  ? "e.g. Called twice, waited 10 minutes"
                  : "e.g. Client answered; deliver again"
              }
              description="Kept with the decision in the audit log."
            />
          </FieldGroup>
        </>
      )}
    </CashActionDialog>
  );
}

// ---------------------------------------------------------------------------
// Client transfers: no-show repayment and paid redelivery
// ---------------------------------------------------------------------------

export function ClientTransferDialog({
  order,
  kind,
  action,
  ctx,
  onClose,
}: {
  order: Order;
  kind: "repayment" | "redelivery";
  action: "confirm" | "reject" | null;
  ctx: DeskContext;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [found, setFound] = useState(false);
  const open = action !== null;
  useOpenReset(open, () => {
    setReason("");
    setFound(false);
  });
  const p = order.cashProgress ?? {};
  const submission = kind === "repayment" ? p.repayment : p.redelivery?.payment;
  const amountMinor =
    kind === "repayment" ? order.totalMinor : (p.redelivery?.feeMinor ?? 0);
  const noTransfer = Boolean(submission?.noTransferRequired) || amountMinor === 0;
  const confirming = action === "confirm";
  const what = kind === "repayment" ? "repayment" : "redelivery payment";
  const ready = confirming ? noTransfer || found : reason.trim().length > 0;
  const name = order.clientName || "The client";

  return (
    <CashActionDialog
      open={open}
      order={order}
      ctx={ctx}
      title={
        confirming
          ? `Confirm the ${formatPhp(amountMinor)} ${what}?`
          : `Reject the ${what}?`
      }
      description={
        confirming
          ? kind === "repayment"
            ? "Confirming clears the client's debt, pays the original rider's fare and books GRIDGO's share. The sale stays a cash sale."
            : "Confirming issues the redelivery invoice and sends the order back to dispatch."
          : "No money is recorded. The client keeps their evidence on file and can send a new transfer."
      }
      ready={ready}
      variant={confirming ? "primary" : "destructive"}
      submitLabel={confirming ? `Confirm ${formatPhp(amountMinor)}` : `Reject ${what}`}
      busyLabel={confirming ? "Confirming…" : "Rejecting…"}
      success={
        confirming
          ? `${what[0].toUpperCase()}${what.slice(1)} confirmed`
          : `${what[0].toUpperCase()}${what.slice(1)} rejected`
      }
      failure={`Could not record the ${what}. Try again.`}
      onClose={onClose}
      onSubmit={async (run) => {
        const route =
          kind === "repayment"
            ? confirming
              ? "confirm-repayment"
              : "reject-repayment"
            : confirming
              ? "confirm-redelivery"
              : "reject-redelivery";
        await run(route, confirming ? {} : { reason: reason.trim() });
      }}
    >
      {(busy) => (
        <>
          <MoneyPlate
            caption={
              kind === "repayment"
                ? "Client's online repayment"
                : "Client's redelivery fare"
            }
            amountMinor={amountMinor}
            lines={[
              { label: "Client", value: name },
              orderLine(order),
              {
                label: "Reference",
                value: submission?.reference ? (
                  <span className="break-all tracking-wide">{submission.reference}</span>
                ) : (
                  "No transfer needed"
                ),
              },
              { label: "Submitted", value: formatDateTime(submission?.submittedAt) },
            ]}
          />
          {submission?.proofFileId ? (
            <EvidenceButton
              fileId={submission.proofFileId}
              label="View the client's proof"
              title="Client's transfer proof"
            />
          ) : null}
          <FieldGroup>
            {confirming && !noTransfer ? (
              <Confirmation
                id="transfer-found"
                checked={found}
                disabled={busy}
                onChange={setFound}
              >
                I found {formatPhp(amountMinor)} with this reference in GRIDGO&rsquo;s
                bank account.
              </Confirmation>
            ) : null}
            {!confirming ? (
              <ReasonField
                id="transfer-reason"
                label="Reason"
                value={reason}
                onChange={setReason}
                disabled={busy}
                placeholder="e.g. No transfer with this reference"
                description="Kept on the order with the rejected proof."
              />
            ) : null}
          </FieldGroup>
        </>
      )}
    </CashActionDialog>
  );
}

// ---------------------------------------------------------------------------
// The shop cannot produce: cancel before cash moved, or open a claim
// ---------------------------------------------------------------------------

export function ShopFailureDialog({
  order,
  path,
  ctx,
  onClose,
}: {
  order: Order;
  path: ShopFailurePath | null;
  ctx: DeskContext;
  onClose: () => void;
}) {
  const [reasonCode, setReasonCode] = useState<
    "supplier_failure" | "artwork_unproducible"
  >("supplier_failure");
  const [reason, setReason] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [riderPhotoId, setRiderPhotoId] = useState("");
  const [noCash, setNoCash] = useState(false);
  const upload = useStaffUpload("cash_incident_photo");
  const open = path !== null;
  useOpenReset(open, () => {
    setReasonCode("supplier_failure");
    setReason("");
    setPhoto(null);
    setRiderPhotoId("");
    setNoCash(false);
  });
  const rider = order.riderId ? ctx.riderName(order.riderId) : null;
  const shop = shopNameOf(order);
  const advance = order.cashAmounts?.shopMinor ?? 0;
  const cancelling = path === "cancel_unpaid";
  // Once a rider holds the order, the API takes the rider's own photo.
  const riderPhoto = cancelling && Boolean(order.riderId);
  const ready = cancelling
    ? noCash && (riderPhoto ? riderPhotoId.trim().length > 0 : Boolean(photo))
    : reason.trim().length > 0 && Boolean(photo);

  return (
    <CashActionDialog
      open={open}
      order={order}
      ctx={ctx}
      title={cancelling ? "Cancel this cash order?" : `Open a claim on ${shop}'s cash?`}
      description={
        cancelling
          ? "No cash has moved, so the order is cancelled outright. Any wallet reservation is released, eligible vouchers come back and the client can order with cash again."
          : `${rider ?? "The rider"} already paid the shop. This stops every handover and collection on the order until the shop returns the cash. No GRIDGO money moves.`
      }
      ready={ready}
      variant="destructive"
      submitLabel={cancelling ? "Cancel order" : "Open claim"}
      busyLabel={cancelling ? "Cancelling…" : "Opening…"}
      success={
        cancelling ? "Order cancelled; no cash was owed" : "Shop-cash claim opened"
      }
      failure={
        cancelling
          ? "Could not cancel the order. Try again."
          : "Could not open the claim. Try again."
      }
      onClose={onClose}
      onSubmit={async (run) => {
        if (cancelling) {
          const photoFileId = riderPhoto
            ? riderPhotoId.trim()
            : await upload(photo as File);
          await run("cancel-unpaid", {
            reasonCode,
            noCashAdvancedConfirmed: true,
            shopObligationMinor: 0,
            photoFileId,
          });
        } else {
          const photoFileId = await upload(photo as File);
          await run("incident-open", { reason: reason.trim(), photoFileId });
        }
      }}
    >
      {(busy) => (
        <>
          <MoneyPlate
            caption={
              cancelling
                ? "Cash the shop is owed"
                : `Shop cash to return to ${rider ?? "the rider"}`
            }
            amountMinor={cancelling ? 0 : advance}
            lines={[
              { label: "Shop", value: shop },
              { label: "Rider", value: rider ?? "Not assigned yet" },
              orderLine(order),
            ]}
          />
          <FieldGroup>
            {cancelling ? (
              <Field>
                <FieldLabel id="cancel-reason-label">
                  Why it cannot be produced
                </FieldLabel>
                <RadioGroup
                  aria-labelledby="cancel-reason-label"
                  value={reasonCode}
                  onValueChange={(value) => setReasonCode(value as typeof reasonCode)}
                  disabled={busy}
                >
                  <label className="flex min-h-11 items-center gap-3">
                    <RadioGroupItem value="supplier_failure" />
                    <span className="text-body text-text-primary">
                      The shop cannot produce it
                    </span>
                  </label>
                  <label className="flex min-h-11 items-center gap-3">
                    <RadioGroupItem value="artwork_unproducible" />
                    <span className="text-body text-text-primary">
                      The artwork cannot be produced
                    </span>
                  </label>
                </RadioGroup>
              </Field>
            ) : (
              <ReasonField
                id="claim-reason"
                label="What happened"
                value={reason}
                onChange={setReason}
                disabled={busy}
                max={CASH_INCIDENT_REASON_MAX}
                placeholder="e.g. The shop's press broke after the rider paid; the shop agreed to return the cash."
                description="The rider and shop see this claim."
              />
            )}
            {riderPhoto ? (
              <FileIdField
                id="cancel-rider-photo"
                label="Rider's photo file ID"
                value={riderPhotoId}
                onChange={setRiderPhotoId}
                disabled={busy}
                description={`A rider holds this order, so the API takes ${rider}'s own incident photo. Ask the rider for the file ID their app shows after uploading it.`}
              />
            ) : (
              <ScreenshotField
                id="shop-failure-photo"
                noun="photo"
                label="Photo of the problem"
                description="Your own photo or screenshot showing why the order cannot be made."
                file={photo}
                onFile={setPhoto}
                disabled={busy}
              />
            )}
            {cancelling ? (
              <Confirmation
                id="no-cash-moved"
                checked={noCash}
                disabled={busy}
                onChange={setNoCash}
              >
                No cash was advanced to the shop and none was collected from the client.
              </Confirmation>
            ) : null}
          </FieldGroup>
        </>
      )}
    </CashActionDialog>
  );
}

// ---------------------------------------------------------------------------
// The shop returns the rider's cash
// ---------------------------------------------------------------------------

export function ClaimReturnDialog({
  order,
  incident,
  ctx,
  onClose,
}: {
  order: Order;
  incident: CashIncident | null;
  ctx: DeskContext;
  onClose: () => void;
}) {
  const [pesos, setPesos] = useState("");
  const [receiptId, setReceiptId] = useState("");
  const [inHand, setInHand] = useState(false);
  const open = incident !== null;
  const remaining = incident?.remainingMinor ?? 0;
  useOpenReset(open, () => {
    setPesos(minorToPesosInput(remaining));
    setReceiptId("");
    setInHand(false);
  });
  const zero = remaining === 0;
  const amount = zero ? 0 : pesosToMinor(pesos);
  const amountOk = zero || (amount !== null && amount > 0 && amount <= remaining);
  const ready = amountOk && inHand && receiptId.trim().length > 0;
  const rider = ctx.riderName(incident?.riderId ?? order.riderId);
  const settles = amount !== null && amount === remaining;

  return (
    <CashActionDialog
      open={open}
      order={order}
      ctx={ctx}
      title={`Record ${formatPhp(amount ?? 0)} returned to ${rider}?`}
      description={
        settles
          ? "This returns the whole advance: the claim closes, the order is cancelled and the client can order with cash again."
          : "A partial return keeps the claim open for the rest."
      }
      ready={ready}
      submitLabel={`Record ${formatPhp(amount ?? 0)}`}
      busyLabel="Recording…"
      success={
        settles
          ? "Claim settled; order cancelled"
          : `${formatPhp(amount ?? 0)} return recorded`
      }
      failure="Could not record the return. Try again."
      onClose={onClose}
      onSubmit={async (run) => {
        await run("incident-return", {
          resolutionType: "supplier_cash_return",
          amountMinor: amount ?? 0,
          riderReceiptConfirmed: true,
          receiptFileId: receiptId.trim(),
          ...(zero ? { noTransferRequired: true } : {}),
        });
      }}
    >
      {(busy) => (
        <>
          <MoneyPlate
            caption={`Returned by ${shopNameOf(order)} to ${rider}`}
            amountMinor={amount ?? 0}
            lines={[
              { label: "Advance", value: formatPhp(incident?.amountMinor ?? 0) },
              { label: "Still owed", value: formatPhp(remaining) },
              orderLine(order),
            ]}
          />
          <FieldGroup>
            {zero ? null : (
              <Field data-invalid={amountOk ? undefined : true}>
                <FieldLabel htmlFor="return-amount">Amount returned (₱)</FieldLabel>
                <Input
                  id="return-amount"
                  inputMode="decimal"
                  className="max-w-48 tabular-nums"
                  value={pesos}
                  disabled={busy}
                  aria-invalid={amountOk ? undefined : true}
                  onChange={(event) => setPesos(event.target.value)}
                />
                <FieldDescription>
                  {amountOk
                    ? "Exactly what the shop handed back. Up to what is still owed."
                    : `Enter an amount above ₱0.00 and no more than ${formatPhp(remaining)}.`}
                </FieldDescription>
              </Field>
            )}
            <FileIdField
              id="return-receipt"
              label="Rider's return receipt file ID"
              value={receiptId}
              onChange={setReceiptId}
              disabled={busy}
              description={`The API takes ${rider}'s own photo of the shop's return. Ask the rider for the file ID their app shows after uploading it.`}
            />
            <Confirmation
              id="return-in-hand"
              checked={inHand}
              disabled={busy}
              onChange={setInHand}
            >
              {rider} confirmed they have this cash back from the shop.
            </Confirmation>
          </FieldGroup>
        </>
      )}
    </CashActionDialog>
  );
}

// ---------------------------------------------------------------------------
// Remedies: reserve, record the transfer, or reconcile
// ---------------------------------------------------------------------------

export type RemedyStep = "reserve" | "pay" | "reconcile";

export function RemedyDialog({
  remedy,
  step,
  ctx,
  onClose,
}: {
  remedy: CashRemedyCase;
  step: RemedyStep | null;
  ctx: DeskContext;
  onClose: () => void;
}) {
  const { order, issue, decision } = remedy;
  const refund = isRefundRemedy(decision.remedy);
  const p = order.cashProgress ?? {};
  const live = p.remedy?.decisionId === decision.id ? p.remedy : null;
  const amount = live?.amountMinor ?? decision.costMinor ?? 0;
  const open = step !== null;

  const [sourceWallet, setSourceWallet] = useState("");
  const [provider, setProvider] = useState("");
  const [verified, setVerified] = useState(false);
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [outcome, setOutcome] = useState<"unknown" | "not_sent">("unknown");
  const [notSent, setNotSent] = useState(false);
  const [reason, setReason] = useState("");
  const [account, setAccount] = useState<SupplierPayoutAccount | null | undefined>(
    undefined,
  );
  const upload = useStaffUpload(refund ? "cash_remedy_receipt" : "cash_reprint_receipt");

  useOpenReset(open, () => {
    setSourceWallet("");
    setProvider("");
    setVerified(false);
    setReference("");
    setReceipt(null);
    setOutcome("unknown");
    setNotSent(false);
    setReason("");
  });

  // A reprint or replacement pays the shop's own verified payout account.
  useEffect(() => {
    if (!open || step !== "reserve" || refund || !order.supplierId) return;
    let live = true;
    setAccount(undefined);
    void (async () => {
      try {
        const next = await getSupplierPayoutAccount(order.supplierId as string);
        if (live) setAccount(next);
      } catch {
        if (live) setAccount(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [open, step, refund, order.supplierId]);

  const label = REMEDY_LABEL[decision.remedy] ?? "Remedy";
  const payee = refund ? order.clientName || "the client" : shopNameOf(order);

  let ready = false;
  if (step === "reserve") {
    ready =
      verified &&
      sourceWallet.trim().length > 0 &&
      provider.trim().length > 0 &&
      (refund ? Boolean(p.remedyDestination) : Boolean(account?.qr));
  } else if (step === "pay") {
    ready = reference.trim().length > 0 && Boolean(receipt);
  } else if (step === "reconcile") {
    ready = reason.trim().length > 0 && (outcome === "unknown" || notSent);
  }

  const titles: Record<RemedyStep, string> = {
    reserve: `Reserve the ${formatPhp(amount)} ${label.toLowerCase()} transfer to ${payee}?`,
    pay: `Record the ${formatPhp(amount)} transfer to ${payee}?`,
    reconcile: "What happened to this transfer?",
  };
  const descriptions: Record<RemedyStep, string> = {
    reserve:
      "Reserving makes you the one payer for this decision. It sends nothing: send the transfer from GRIDGO's wallet next, then record it here.",
    pay: "Record only a transfer that left GRIDGO's wallet. The amount, reference and receipt become the ledger's record.",
    reconcile:
      "Use this when you are not sure the transfer went, or you are sure it did not. Nobody else can reserve it while the outcome is unknown.",
  };

  return (
    <CashActionDialog
      open={open}
      order={order}
      ctx={ctx}
      title={step ? titles[step] : ""}
      description={step ? descriptions[step] : ""}
      ready={ready}
      variant={step === "reconcile" ? "destructive" : "primary"}
      submitLabel={
        step === "reserve"
          ? "Reserve transfer"
          : step === "pay"
            ? `Record ${formatPhp(amount)}`
            : "Record outcome"
      }
      busyLabel="Saving…"
      success={
        step === "reserve"
          ? "Transfer reserved; send it next"
          : step === "pay"
            ? `${formatPhp(amount)} transfer recorded`
            : "Transfer outcome recorded"
      }
      failure="Could not save the remedy. Try again."
      onClose={onClose}
      onSubmit={async (run) => {
        if (step === "reserve") {
          await run("remedy-reserve", {
            issueId: issue.id,
            decisionId: decision.id,
            destinationVerified: true,
            sourceWallet: sourceWallet.trim(),
            provider: provider.trim(),
            ...(refund
              ? { destinationRevision: p.remedyDestination?.revision }
              : { supplierDestinationVersion: account?.version }),
          });
        } else if (step === "pay") {
          const receiptFileId = await upload(receipt as File);
          await run("remedy-pay", {
            amountMinor: amount,
            reference: reference.trim(),
            receiptFileId,
          });
        } else if (step === "reconcile") {
          await run("remedy-reconcile", {
            outcome,
            reason: reason.trim(),
            ...(outcome === "not_sent" ? { noTransferConfirmed: true } : {}),
          });
        }
      }}
    >
      {(busy) => (
        <>
          <MoneyPlate
            caption={`${label} to ${payee}`}
            amountMinor={amount}
            lines={[
              orderLine(order),
              {
                label: "GRIDGO funds",
                value: formatPhp(live?.advanceMinor ?? decision.gridgoCostMinor ?? 0),
              },
              ...(live?.reference ? [{ label: "Reference", value: live.reference }] : []),
              ...(live?.provider
                ? [
                    {
                      label: "Paid from",
                      value: `${live.provider}, ${live.sourceWallet ?? ""}`,
                    },
                  ]
                : []),
            ]}
          />
          {step === "reserve" ? (
            <FieldGroup>
              {refund ? (
                p.remedyDestination ? (
                  <div className="flex flex-wrap items-start gap-3">
                    <PayoutQrPlate
                      fileId={p.remedyDestination.qrFileId}
                      className="w-32"
                      alt={`${payee}'s receiving QR`}
                    />
                    <p className="text-body text-text-primary m-0">
                      Account name:{" "}
                      <span style={{ fontFamily: "var(--font-medium)" }}>
                        {p.remedyDestination.accountName}
                      </span>
                    </p>
                  </div>
                ) : (
                  <p className="text-body text-text-secondary m-0">
                    The client has not sent a receiving QR yet.
                  </p>
                )
              ) : account === undefined ? (
                <p className="text-body text-text-secondary m-0">
                  Loading the shop&rsquo;s payout account…
                </p>
              ) : account?.qr ? (
                <div className="flex flex-wrap items-start gap-3">
                  <PayoutQrPlate
                    fileId={account.qr.fileId}
                    shopName={payee}
                    className="w-32"
                  />
                  <PayoutDestinationWords account={account} shopName={payee} />
                </div>
              ) : (
                <p className="text-body text-error m-0" role="alert">
                  The shop has no verified payout QR. Ask the shop to set one before
                  reserving.
                </p>
              )}
              <Field>
                <FieldLabel htmlFor="remedy-provider">
                  Wallet or bank you will pay from
                </FieldLabel>
                <Input
                  id="remedy-provider"
                  value={provider}
                  maxLength={120}
                  disabled={busy}
                  autoComplete="off"
                  onChange={(event) => setProvider(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="remedy-source">
                  GRIDGO account you will pay from
                </FieldLabel>
                <Input
                  id="remedy-source"
                  value={sourceWallet}
                  maxLength={120}
                  disabled={busy}
                  autoComplete="off"
                  onChange={(event) => setSourceWallet(event.target.value)}
                />
                <FieldDescription>
                  The account name or last digits, so the ledger can find it.
                </FieldDescription>
              </Field>
              <Confirmation
                id="remedy-verified"
                checked={verified}
                disabled={busy}
                onChange={setVerified}
              >
                I checked the receiving account belongs to {payee}.
              </Confirmation>
            </FieldGroup>
          ) : null}
          {step === "pay" ? (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="remedy-reference">Transfer reference</FieldLabel>
                <Input
                  id="remedy-reference"
                  value={reference}
                  maxLength={120}
                  disabled={busy}
                  autoComplete="off"
                  onChange={(event) => setReference(event.target.value)}
                />
              </Field>
              <ScreenshotField
                id="remedy-receipt"
                label="Transfer receipt"
                description="The wallet or bank screenshot showing the transfer."
                file={receipt}
                onFile={setReceipt}
                disabled={busy}
              />
            </FieldGroup>
          ) : null}
          {step === "reconcile" ? (
            <FieldGroup>
              <Field>
                <FieldLabel id="reconcile-label">Outcome</FieldLabel>
                <RadioGroup
                  aria-labelledby="reconcile-label"
                  value={outcome}
                  onValueChange={(value) => setOutcome(value as typeof outcome)}
                  disabled={busy}
                >
                  <label className="flex min-h-11 items-center gap-3">
                    <RadioGroupItem value="unknown" />
                    <span className="text-body text-text-primary">Not sure it went</span>
                  </label>
                  <label className="flex min-h-11 items-center gap-3">
                    <RadioGroupItem value="not_sent" />
                    <span className="text-body text-text-primary">It was not sent</span>
                  </label>
                </RadioGroup>
              </Field>
              {outcome === "not_sent" ? (
                <Confirmation
                  id="reconcile-not-sent"
                  checked={notSent}
                  disabled={busy}
                  onChange={setNotSent}
                >
                  I checked GRIDGO&rsquo;s wallet: no money left for this transfer. It can
                  be reserved again.
                </Confirmation>
              ) : null}
              <ReasonField
                id="reconcile-reason"
                label="Reason"
                value={reason}
                onChange={setReason}
                disabled={busy}
                placeholder="e.g. App timed out before confirming"
              />
            </FieldGroup>
          ) : null}
        </>
      )}
    </CashActionDialog>
  );
}
