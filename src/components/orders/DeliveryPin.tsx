"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { EvidencePlate } from "@/components/orders/EvidencePreview";
import { DeliveryPinMap } from "@/components/orders/DeliveryPinMap";
import { ReceiptReferenceOcr } from "@/components/orders/ReceiptReferenceOcr";
import { CLIENT_READS_THIS, Confirmation } from "@/components/refunds/dialogs";
import { useCommandKeys } from "@/components/refunds/useCommand";
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
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import {
  confirmDeliveryPinPayment,
  isApiError,
  rejectDeliveryPinPayment,
} from "@/lib/api/client";
import type { DeliveryPin, DeliveryPinChange, Order, RefundRequest } from "@/lib/api/types";
import {
  pinChangeAllowanceLine,
  pinConfirmationLine,
  pinCreditLine,
  pinDistanceLine,
  pinFeeDifferenceLine,
  pinMapPoints,
  pinNotesLine,
  pinReceiverLine,
  pinZoneLabel,
  presentPinChange,
  presentPinConfirmation,
  signedPhp,
} from "@/lib/delivery-pin";
import { formatDateTime, formatPhp } from "@/lib/format";

const REASON_MAX = 2000;

/** Codes after which the pin on screen is out of date: reload before anything else. */
const RELOAD_CODES = new Set([
  "delivery_pin_stale",
  "delivery_pin_payment_unavailable",
  "delivery_pin_idempotency_conflict",
]);

type Props = {
  order: Order;
  /** The order's refund requests, for a cheaper pin's credit. Null: could not be read. */
  refunds: RefundRequest[] | null;
  tree: "ops" | "admin";
  names: Record<string, string>;
  /** Re-read the order after a decision (or a stale one). */
  onUpdated: () => Promise<void> | void;
};

/**
 * The Delivery pin row: whether the client will be at the pin and when they
 * said so, who receives it and the notes for the rider, the pin on a map (the
 * checkout pin beside the one in use once it moved), and the client's one
 * change with its money.
 *
 * Operations' only decision here is a dearer pin's QR transfer: verify the
 * exact amount (which saves the new pin) or reject it with a reason the client
 * reads. A cheaper pin's credit is paid from its own refund case and never
 * cancels or settles anything.
 */
export function DeliveryPinPanel({ order, refunds, tree, names, onUpdated }: Props) {
  // Lives here, not on the decision block: a decision reloads the order and
  // that block leaves with the payment it decided.
  const [notice, setNotice] = useState<string | null>(null);
  const pin = order.deliveryPin;
  if (!pin) return null;
  const confirmation = presentPinConfirmation(pin);
  const points = pinMapPoints(order);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusChip tone={confirmation.tone} label={confirmation.label} icon={confirmation.icon} />
        <span className="text-body text-text-secondary">{pinConfirmationLine(pin)}</span>
      </div>

      <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)]">
        <Fact term="Delivers to">{pin.point.label || "No address label"}</Fact>
        <Fact term="Receiver">{pinReceiverLine(pin)}</Fact>
        <Fact term="Notes for the rider">
          <span className="whitespace-pre-line">{pinNotesLine(pin)}</span>
        </Fact>
        <Fact term="Zone">{pinZoneLabel(pin.zone)}</Fact>
        <Fact term="Pin change">{pinChangeAllowanceLine(order)}</Fact>
      </dl>

      {points.length ? <DeliveryPinMap points={points} /> : null}

      {pin.change ? (
        <ChangeRecord
          order={order}
          pin={pin}
          change={pin.change}
          refunds={refunds}
          tree={tree}
          names={names}
          onUpdated={onUpdated}
          onNotice={setNotice}
        />
      ) : null}

      {notice ? (
        <p className="text-body text-text-primary m-0" role="status">
          {notice}
        </p>
      ) : null}

      <p className="text-caption text-text-muted m-0">
        Confirming tells the rider someone will be there. It does not mark the order
        delivered or move any money.
      </p>
    </div>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-caption text-text-muted sm:pt-0.5">{term}</dt>
      <dd className="m-0 text-body text-text-primary break-words">{children}</dd>
    </>
  );
}

function ChangeRecord({
  order,
  pin,
  change,
  refunds,
  tree,
  names,
  onUpdated,
  onNotice,
}: {
  order: Order;
  pin: DeliveryPin;
  change: DeliveryPinChange;
  refunds: RefundRequest[] | null;
  tree: "ops" | "admin";
  names: Record<string, string>;
  onUpdated: () => Promise<void> | void;
  onNotice: (notice: string | null) => void;
}) {
  const status = presentPinChange(change);
  const diff = change.feeDifferenceMinor;
  const applied = change.status === "applied";
  const from = pin.original?.label;

  return (
    <section
      aria-label="The client's pin change"
      className="flex flex-col gap-3 rounded-card border border-outline-subtle px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
          The one pin change
        </h3>
        <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
      </div>
      <p className="text-body text-text-secondary m-0">
        {from ? (
          <>
            From <span className="text-text-primary">{from}</span> to{" "}
            <span className="text-text-primary">{change.point.label}</span>.{" "}
          </>
        ) : null}
        Asked {formatDateTime(change.createdAt)}
        {applied && change.appliedAt ? `, saved ${formatDateTime(change.appliedAt)}` : ""}.{" "}
        {pinDistanceLine(change)}.
      </p>

      <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
        <MoneyLine term="Delivery fee at checkout" value={formatPhp(order.deliveryFeeMinor)} />
        <MoneyLine term="Delivery fee at the new pin" value={formatPhp(change.deliveryFeeMinor)} />
        <MoneyLine term="Difference" value={signedPhp(diff)} strong />
        {typeof change.riderDifferenceMinor === "number" ? (
          <MoneyLine term="Rider's share of it" value={signedPhp(change.riderDifferenceMinor)} indent />
        ) : null}
        {typeof change.platformDifferenceMinor === "number" ? (
          <MoneyLine
            term="GRIDGO's share of it"
            value={signedPhp(change.platformDifferenceMinor)}
            indent
          />
        ) : null}
      </dl>
      <p className="text-caption text-text-muted m-0">
        {pinFeeDifferenceLine(diff)}. The shop&rsquo;s price and payout never change.
      </p>

      {change.status === "pending_payment" ? (
        <PendingPayment pin={pin} change={change} />
      ) : null}

      {change.status === "pending_confirmation" ? (
        <PaymentDecision
          order={order}
          pin={pin}
          change={change}
          onUpdated={onUpdated}
          onNotice={onNotice}
        />
      ) : null}

      {applied && diff > 0 ? <CollectedPayment change={change} names={names} /> : null}

      {applied && diff < 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-body text-text-primary m-0">{pinCreditLine(change, refunds)}</p>
          <p className="text-caption text-text-muted m-0">
            Paid by hand from its refund case once the client adds their receiving QR. It
            does not cancel the order or hold dispatch, work or any payout.
          </p>
          {change.refundRequestId ? (
            <Link
              href={`/${tree}/refunds/${encodeURIComponent(change.refundRequestId)}`}
              className="text-body text-text-primary inline-flex min-h-11 items-center underline-offset-2 hover:underline"
            >
              Open the credit&rsquo;s refund case
            </Link>
          ) : null}
        </div>
      ) : null}

      {applied && diff === 0 ? (
        <p className="text-body text-text-secondary m-0">
          Same delivery fee. Nothing to collect or give back.
        </p>
      ) : null}
    </section>
  );
}

function MoneyLine({
  term,
  value,
  strong = false,
  indent = false,
}: {
  term: string;
  value: string;
  strong?: boolean;
  indent?: boolean;
}) {
  const weight = strong ? { fontFamily: "var(--font-medium)" } : undefined;
  return (
    <>
      <dt
        className={`text-body m-0 ${strong ? "text-text-primary" : "text-text-secondary"} ${indent ? "pl-3" : ""}`}
        style={weight}
      >
        {term}
      </dt>
      <dd
        className={`text-body m-0 text-right tabular-nums ${strong ? "text-text-primary" : "text-text-secondary"}`}
        style={weight}
      >
        {value}
      </dd>
    </>
  );
}

function PendingPayment({ pin, change }: { pin: DeliveryPin; change: DeliveryPinChange }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-body text-text-primary m-0">
        {pin.canChange
          ? `Waiting on the client to send ${formatPhp(change.feeDifferenceMinor)} by QR. The original pin stays in use, and dispatch is not held.`
          : "Never paid before a rider was assigned, so it lapsed. The original pin is in use."}
      </p>
      {change.rejectionReason ? (
        <p className="text-caption text-text-secondary m-0">
          Last screenshot rejected: &ldquo;{change.rejectionReason}&rdquo; The client can send a
          new one.
        </p>
      ) : null}
    </div>
  );
}

function CollectedPayment({
  change,
  names,
}: {
  change: DeliveryPinChange;
  names: Record<string, string>;
}) {
  const payment = change.payment;
  if (!payment) return null;
  const who = (payment.confirmedBy && names[payment.confirmedBy]) || "Operations";
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-primary m-0">
        Collected {formatPhp(payment.amountMinor ?? change.feeDifferenceMinor)} by QR, verified{" "}
        {formatDateTime(payment.confirmedAt)} by {who}. Reference{" "}
        <span className="break-all">{payment.reference}</span>.
      </p>
      <EvidencePlate fileId={payment.proofFileId} label="Pin payment proof" caption={payment.reference} />
    </div>
  );
}

/**
 * The client's transfer for a dearer pin, waiting on Operations. Dispatch is
 * held until it is decided either way.
 */
function PaymentDecision({
  order,
  pin,
  change,
  onUpdated,
  onNotice,
}: {
  order: Order;
  pin: DeliveryPin;
  change: DeliveryPinChange;
  onUpdated: () => Promise<void> | void;
  onNotice: (notice: string | null) => void;
}) {
  const payment = change.payment;
  const amount = formatPhp(change.feeDifferenceMinor);
  const keys = useCommandKeys();
  const [dialog, setDialog] = useState<"confirm" | "reject" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(
    action: () => Promise<DeliveryPin>,
    done: string,
  ): Promise<void> {
    setBusy(true);
    setError(null);
    onNotice(null);
    try {
      await action();
      keys.reset();
      setDialog(null);
      onNotice(done);
      await onUpdated();
    } catch (err) {
      const message = opsErrorMessage(err, "That did not go through. Try again.");
      if (isApiError(err) && RELOAD_CODES.has(err.code)) {
        keys.reset();
        setDialog(null);
        onNotice(message);
        await onUpdated();
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-primary m-0">
        The client sent {amount} for the new pin. Dispatch is held until you verify or reject
        it; the original pin stays in use meanwhile.
      </p>
      {payment ? (
        <dl className="m-0 flex flex-col gap-1">
          {payment.proofFileId ? (
            <ReceiptReferenceOcr fileId={payment.proofFileId} submittedReference={payment.reference} />
          ) : null}
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-caption text-text-muted m-0">Submitted</dt>
            <dd className="text-caption text-text-secondary m-0">
              {formatDateTime(payment.submittedAt)}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-caption text-text-muted m-0">Exactly</dt>
            <dd className="text-caption text-text-primary m-0 tabular-nums">{amount}</dd>
          </div>
        </dl>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => {
            setError(null);
            setDialog("confirm");
          }}
        >
          Confirm {amount} received
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setError(null);
            setDialog("reject");
          }}
        >
          Reject the payment
        </Button>
      </div>
      {payment?.proofFileId ? (
        <EvidencePlate fileId={payment.proofFileId} label="Pin payment proof" caption={payment.reference} />
      ) : null}

      <ConfirmPinPaymentDialog
        open={dialog === "confirm"}
        amount={amount}
        reference={payment?.reference ?? ""}
        destination={change.point.label}
        feeAfter={formatPhp(change.deliveryFeeMinor)}
        busy={busy}
        error={error}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) => {
          const body = {
            expectedVersion: pin.version,
            amountMinor: change.feeDifferenceMinor,
            reason,
          };
          void decide(
            () => confirmDeliveryPinPayment(order.id, body, keys.keyFor({ confirm: body })),
            "Payment verified. The new pin is saved and the rider will go there.",
          );
        }}
      />
      <RejectPinPaymentDialog
        open={dialog === "reject"}
        amount={amount}
        busy={busy}
        error={error}
        onCancel={() => setDialog(null)}
        onReject={(reason) => {
          const body = { expectedVersion: pin.version, reason };
          void decide(
            () => rejectDeliveryPinPayment(order.id, body, keys.keyFor({ reject: body })),
            "Payment rejected. The original pin stays, and the client has your reason.",
          );
        }}
      />
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p className="text-body text-error m-0" role="alert">
      {error}
    </p>
  ) : null;
}

function ConfirmPinPaymentDialog({
  open,
  amount,
  reference,
  destination,
  feeAfter,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  amount: string;
  reference: string;
  destination: string;
  feeAfter: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [found, setFound] = useState(false);
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!open) return;
    setFound(false);
    setReason("Exact wallet transfer verified.");
  }, [open]);
  const ready = found && reason.trim().length > 0;
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm the {amount} pin payment?</AlertDialogTitle>
          <AlertDialogDescription>
            This saves the new pin straight away: the rider goes to {destination}, and the
            delivery fee becomes {feeAfter}. It cannot be undone here.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Confirmation id="pin-payment-found" checked={found} onChange={setFound} disabled={busy}>
            I found a transfer of exactly {amount}
            {reference ? (
              <>
                {" "}
                with reference <span className="break-all">{reference}</span>
              </>
            ) : null}{" "}
            in GRIDGO&rsquo;s wallet.
          </Confirmation>
          <Field>
            <FieldLabel htmlFor="pin-payment-note">Note for the audit log</FieldLabel>
            <Textarea
              id="pin-payment-note"
              rows={2}
              maxLength={REASON_MAX}
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldDescription>Kept with the order&rsquo;s audit record.</FieldDescription>
          </Field>
        </FieldGroup>
        <ErrorLine error={error} />
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            Keep checking
          </AlertDialogCancel>
          <AlertDialogAction disabled={busy || !ready} onClick={() => onConfirm(reason.trim())}>
            {busy ? "Saving…" : "Confirm and save the pin"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RejectPinPaymentDialog({
  open,
  amount,
  busy,
  error,
  onCancel,
  onReject,
}: {
  open: boolean;
  amount: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onReject: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!open) return;
    setReason(
      `We could not find a transfer of exactly ${amount} for your new pin. Check that it went through, then send a new screenshot.`,
    );
  }, [open, amount]);
  const ready = reason.trim().length > 0;
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Reject the {amount} pin payment?</AlertDialogTitle>
          <AlertDialogDescription>
            Say this only when no matching transfer arrived: rejecting does not send any
            money back. The original pin stays in use, and the client can send a new
            screenshot before a rider is assigned.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="pin-payment-reject">Reason for the client</FieldLabel>
            <Textarea
              id="pin-payment-reject"
              rows={3}
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
            Keep checking
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy || !ready}
            onClick={() => onReject(reason.trim())}
          >
            {busy ? "Rejecting…" : "Reject payment"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
