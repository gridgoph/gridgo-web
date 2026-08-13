"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import {
  formatWait,
  PAYMENT_REJECTION_REASONS,
} from "@/app/ops/_lib/payments";
import { MoneyBreakdown } from "@/components/orders/MoneyBreakdown";
import { Timeline } from "@/components/orders/Timeline";
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
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { confirmPayment, getOrder, rejectPayment } from "@/lib/api/client";
import type { Order, PaymentInstallment } from "@/lib/api/types";
import { formatDateTime, formatPhp } from "@/lib/format";
import {
  presentInstallment,
  presentOrderState,
  presentPaymentMethod,
  presentPaymentStatus,
} from "@/lib/order-state";

function readInstallment(raw: string | null): PaymentInstallment {
  return raw === "balance" ? "balance" : "downpayment";
}

export default function OpsPaymentReviewPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const orderId = params.id;

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [confirmNote, setConfirmNote] = useState("");
  const [reasonId, setReasonId] = useState(PAYMENT_REJECTION_REASONS[0].id);
  const [reasonDetail, setReasonDetail] = useState("");

  const installment = readInstallment(search.get("installment"));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrder(await getOrder(orderId));
    } catch (err) {
      setOrder(null);
      setError(opsErrorMessage(err, "Could not load this order."));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const payment = order?.payments?.[installment];

  const waitingMinutes = useMemo(() => {
    if (!payment?.submittedAt) return 0;
    const ms = Date.parse(payment.submittedAt);
    if (Number.isNaN(ms)) return 0;
    return Math.max(0, Math.floor((Date.now() - ms) / 60_000));
  }, [payment?.submittedAt]);

  const selectedReason = PAYMENT_REJECTION_REASONS.find(
    (r) => r.id === reasonId,
  )!;

  async function runConfirm() {
    if (!order) return;
    setBusy(true);
    setActionError(null);
    try {
      const updated = await confirmPayment(order.id, installment, {
        note: confirmNote.trim() || "Reference matched the GRIDGO wallet",
      });
      setOrder(updated);
      setConfirmOpen(false);
      setConfirmNote("");
      setActionOk(
        installment === "downpayment"
          ? "Downpayment confirmed. The order has moved on and the supplier can start production."
          : "Balance confirmed. The order is paid in full and can be delivered.",
      );
    } catch (err) {
      setActionError(
        opsErrorMessage(err, "Could not confirm this payment. Try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function runReject() {
    if (!order) return;
    const detail = reasonDetail.trim();
    const message = detail
      ? `${selectedReason.clientMessage} ${detail}`
      : selectedReason.clientMessage;
    setBusy(true);
    setActionError(null);
    try {
      const updated = await rejectPayment(order.id, installment, {
        reason: message,
      });
      setOrder(updated);
      setRejectOpen(false);
      setReasonDetail("");
      setActionOk(
        "Sent back to the client with your reason. They can submit a new reference once they have sorted it out.",
      );
    } catch (err) {
      setActionError(
        opsErrorMessage(err, "Could not send this payment back. Try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading && !order) {
    return <LoadingBlock label="Loading payment…" />;
  }
  if (error || !order) {
    return (
      <ErrorState
        body={error ?? "Order not found."}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
            <Button
              variant="secondary"
              onClick={() => router.push("/ops/payments")}
            >
              Back to payments
            </Button>
          </div>
        }
      />
    );
  }

  if (!payment) {
    return (
      <ErrorState
        title="No payment set up on this order"
        body="The two installments are created when the supplier accepts and names its price. Nothing is owed on this order yet."
        action={
          <Button
            variant="secondary"
            onClick={() => router.push("/ops/payments")}
          >
            Back to payments
          </Button>
        }
      />
    );
  }

  const status = presentPaymentStatus(payment.status);
  const orderStatus = presentOrderState(order.state);
  const decidable = payment.status === "pending_confirmation";

  return (
    <div className="flex w-full flex-col gap-3">
      <header className="gg-card flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-overline text-text-muted m-0 uppercase">
              {presentInstallment(installment)}
            </p>
            <h2 className="text-h2 text-text-primary m-0 mt-1">{order.title}</h2>
          </div>
          <StatusChip
            tone={status.tone}
            label={status.label}
            icon={status.icon}
          />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-outline-subtle pt-4">
          <div>
            <p className="text-caption text-text-muted m-0">Expected in the wallet</p>
            <p
              className="text-h1 text-text-primary m-0 tabular-nums"
              style={{ fontFamily: "var(--font-bold)" }}
            >
              {formatPhp(payment.amountMinor)}
            </p>
          </div>
          {decidable ? (
            <p className="text-body text-text-secondary m-0">
              Client has waited {formatWait(waitingMinutes)}
            </p>
          ) : null}
        </div>

        <dl className="m-0 grid grid-cols-1 gap-3 border-t border-outline-subtle pt-4 sm:grid-cols-2">
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-caption text-text-muted m-0">
              Reference the client sent
            </dt>
            <dd
              className="text-h3 text-text-primary m-0 mt-0.5 font-mono break-all"
              aria-label="Client transfer reference"
            >
              {payment.reference ?? "None given"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-caption text-text-muted m-0">Sent by</dt>
            <dd className="text-body text-text-primary m-0 mt-0.5">
              {presentPaymentMethod(payment.method)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-caption text-text-muted m-0">Submitted</dt>
            <dd className="text-body text-text-primary m-0 mt-0.5">
              {formatDateTime(payment.submittedAt)}
            </dd>
          </div>
          {payment.confirmedAt ? (
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-caption text-text-muted m-0">Confirmed</dt>
              <dd className="text-body text-text-primary m-0 mt-0.5">
                {formatDateTime(payment.confirmedAt)}
              </dd>
            </div>
          ) : null}
          {payment.rejectionReason ? (
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-caption text-text-muted m-0">
                Sent back {formatDateTime(payment.rejectedAt)}
              </dt>
              <dd className="text-body text-text-primary m-0 mt-0.5">
                “{payment.rejectionReason}”
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-col gap-2 border-t border-outline-subtle pt-4">
          {decidable ? (
            <>
              <p className="text-body text-text-secondary m-0 max-w-prose">
                Open the GRIDGO wallet and find this reference. Confirm it only
                when you can see {formatPhp(payment.amountMinor)} against it.
                Sending it back returns the installment to unpaid so the client
                can try again.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => setConfirmOpen(true)}>
                  Confirm payment received
                </Button>
                <Button variant="danger" onClick={() => setRejectOpen(true)}>
                  Send back to client
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <StatusChip
                tone={orderStatus.tone}
                label={orderStatus.label}
                icon={orderStatus.icon}
              />
              <p className="text-body text-text-secondary m-0">
                {payment.status === "not_submitted"
                  ? "Nothing to decide — the client has not sent a transfer for this installment yet."
                  : "This installment is settled. Nothing further is needed here."}
              </p>
            </div>
          )}

          {actionOk ? (
            <p className="text-body text-success m-0" role="status">
              {actionOk}
            </p>
          ) : null}
          {actionError && !confirmOpen && !rejectOpen ? (
            <p className="text-body text-error m-0" role="alert">
              {actionError}
            </p>
          ) : null}
        </div>
      </header>

      <div className="grid w-full gap-3 lg:grid-cols-2 lg:items-start">
      <section className="gg-card p-3" aria-labelledby="money-heading">
        <h3 id="money-heading" className="text-h3 text-text-primary m-0">
          What this order is worth
        </h3>
        <p className="text-body text-text-secondary m-0 mt-1 mb-3 max-w-prose">
          Operations and Super Admin only. The client never sees the supplier
          price or the commission.
        </p>
        <MoneyBreakdown order={order} />
      </section>

      <section className="gg-card p-3" aria-labelledby="timeline-heading">
        <h3 id="timeline-heading" className="text-h3 text-text-primary m-0 mb-3">
          Order history
        </h3>
        <Timeline entries={order.timeline} />
      </section>
      </div>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmOpen(false);
            setActionError(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirm {formatPhp(payment.amountMinor)} arrived?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {installment === "downpayment"
                ? "This releases the order into production and cannot be undone from the portal. Confirm only if you can see the transfer against reference " +
                  (payment.reference ?? "—") +
                  "."
                : "This marks the order paid in full and clears it for delivery. Confirm only if you can see the transfer against reference " +
                  (payment.reference ?? "—") +
                  "."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="confirm-note">
                Note for the record (optional)
              </FieldLabel>
              <Textarea
                id="confirm-note"
                rows={2}
                value={confirmNote}
                onChange={(e) => setConfirmNote(e.target.value)}
                placeholder="e.g. Matched GCash receipt 10:42"
              />
              <FieldDescription>
                Stored on the audit trail with your name and the time.
              </FieldDescription>
            </Field>
          </FieldGroup>
          {actionError ? (
            <p className="text-body text-error m-0" role="alert">
              {actionError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="primary"
              disabled={busy}
              onClick={() => void runConfirm()}
            >
              {busy ? "Confirming…" : "Confirm payment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={rejectOpen}
        onOpenChange={(open) => {
          if (!open) {
            setRejectOpen(false);
            setActionError(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Send this payment back?</AlertDialogTitle>
            <AlertDialogDescription>
              The installment returns to unpaid and the client is told why, so
              they can send a new transfer. Pick the reason that matches what
              you found in the wallet.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="reject-reason">What went wrong</FieldLabel>
              <RadioGroup
                id="reject-reason"
                value={reasonId}
                onValueChange={(v) => setReasonId(String(v))}
              >
                {PAYMENT_REJECTION_REASONS.map((reason) => (
                  <label
                    key={reason.id}
                    className="flex min-h-11 cursor-pointer items-start gap-3 rounded-field border border-outline-subtle px-3 py-2"
                  >
                    <RadioGroupItem value={reason.id} className="mt-1" />
                    <span className="min-w-0">
                      <span className="text-body text-text-primary block">
                        {reason.label}
                      </span>
                      <span className="text-caption text-text-muted block">
                        {reason.clientMessage}
                      </span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </Field>

            <Field>
              <FieldLabel htmlFor="reject-detail">
                Anything to add (optional)
              </FieldLabel>
              <Textarea
                id="reject-detail"
                rows={2}
                value={reasonDetail}
                onChange={(e) => setReasonDetail(e.target.value)}
                placeholder="e.g. We received ₱500 against this reference."
              />
              <FieldDescription>
                Added to the end of the message above. The client reads all of
                it, so write it for them.
              </FieldDescription>
            </Field>
          </FieldGroup>

          {actionError ? (
            <p className="text-body text-error m-0" role="alert">
              {actionError}
            </p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel
              variant="secondary"
              disabled={busy}
              onClick={() => setRejectOpen(false)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              disabled={busy}
              onClick={() => void runReject()}
            >
              {busy ? "Sending…" : "Send back to client"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
