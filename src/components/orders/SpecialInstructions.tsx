"use client";

import { useEffect, useState } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { ItemNotes } from "@/components/order-changes/ItemNotes";
import { EvidencePlate } from "@/components/orders/EvidencePreview";
import {
  ColourCorrectionPages,
  originalColourOf,
} from "@/components/orders/ColourCorrectionPages";
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
import { confirmChangePayment, isApiError, rejectChangePayment } from "@/lib/api/client";
import type { Order, OrderChangeRequest } from "@/lib/api/types";
import { formatDateTime, formatPhp } from "@/lib/format";
import {
  acknowledgementFor,
  changeRequestsOf,
  hasSpecialInstructions,
  itemInstructions,
  itemLabel,
  presentChangeForStaff,
  staffChangeLine,
} from "@/lib/order-changes";

const REASON_MAX = 2000;
const medium = { fontFamily: "var(--font-medium)" } as const;

/** Codes after which the request on screen is out of date: reload before anything else. */
const RELOAD_CODES = new Set([
  "change_request_stale",
  "change_payment_unavailable",
  "change_request_idempotency_conflict",
  "change_request_not_found",
]);

type Props = {
  order: Order;
  names: Record<string, string>;
  /** Re-read the order after a decision (or a stale one). */
  onUpdated: () => Promise<void> | void;
};

/**
 * The Special instructions row: each item's note as the client wrote it
 * (contact details masked by GRIDGO), when the shop ticked that it read them,
 * and every change request with its money and where it stands.
 *
 * The GRIDGO Team's one decision here is a client's QR transfer for a priced
 * change: verify the exact amount (which applies the change) or reject it with
 * a reason the client reads. Everything else is the client's or the shop's.
 */
export function SpecialInstructionsPanel({ order, names, onUpdated }: Props) {
  // Lives here, not on the decision block: a decision reloads the order and
  // that block leaves with the payment it decided.
  const [notice, setNotice] = useState<string | null>(null);
  const notes = itemInstructions(order);
  const ack = acknowledgementFor(order);
  const requests = changeRequestsOf(order);
  // Newest first: the one being worked is on top, the history below it.
  const ordered = [...requests].reverse();

  return (
    <div className="flex flex-col gap-4">
      {notes.length ? (
        <div className="flex flex-col gap-3">
          <ItemNotes notes={notes} agreedLabel="Agreed change" />
          <p className="text-caption text-text-muted m-0">
            Notes never change the price. Contact details are masked by GRIDGO before they are
            stored.
          </p>
        </div>
      ) : (
        <p className="text-body text-text-secondary m-0">The client left no special instructions.</p>
      )}

      {hasSpecialInstructions(order) ? <ShopTick order={order} ack={ack} names={names} /> : null}

      {ordered.map((request) => (
        <ChangeRequestRecord
          key={request.id}
          order={order}
          request={request}
          names={names}
          onUpdated={onUpdated}
          onNotice={setNotice}
        />
      ))}

      {notice ? (
        <p className="text-body text-text-primary m-0" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

function ShopTick({
  order,
  ack,
  names,
}: {
  order: Order;
  ack: ReturnType<typeof acknowledgementFor>;
  names: Record<string, string>;
}) {
  if (ack?.currentShop) {
    const who = (ack.supplierId && names[ack.supplierId]) || "The shop";
    return (
      <p className="text-body text-success m-0 flex items-start gap-2">
        <CircleCheck size={16} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          {who} ticked that it read them {formatDateTime(ack.at)}, when it accepted.
        </span>
      </p>
    );
  }
  const offer = order.state === "supplier_assigned";
  return (
    <p className="text-body text-text-secondary m-0 flex items-start gap-2">
      <TriangleAlert size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-warning" aria-hidden />
      <span>
        {ack && !ack.currentShop
          ? `The shop it was taken from ticked them ${formatDateTime(ack.at)}. The shop now on the order ticks again when it accepts.`
          : offer
            ? "Not ticked yet. GRIDGO refuses the shop's acceptance until it ticks that it read them."
            : "No tick on record. This order was accepted before notes needed one."}
      </span>
    </p>
  );
}

function ChangeRequestRecord({
  order,
  request,
  names,
  onUpdated,
  onNotice,
}: {
  order: Order;
  request: OrderChangeRequest;
  names: Record<string, string>;
  onUpdated: () => Promise<void> | void;
  onNotice: (notice: string | null) => void;
}) {
  const status = presentChangeForStaff(request);
  const item = itemLabel(order, request.lineItemId);
  const extra = request.extraPrincipalMinor ?? 0;
  const fee = request.feeMinor;
  const total = request.totalMinor;
  const shop = (request.supplierId && names[request.supplierId]) || "The shop";

  return (
    <section
      aria-label={`Change request, ${status.label.toLowerCase()}`}
      className="flex flex-col gap-3 rounded-card border border-outline-subtle px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body text-text-primary m-0" style={medium}>
          Change request{item ? ` on ${item}` : ""}
        </h3>
        <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
      </div>
      <p className="text-body text-text-secondary m-0">
        {shop} asked {formatDateTime(request.createdAt)}
        {request.answeredAt && request.status !== "pending"
          ? `; the client answered ${formatDateTime(request.answeredAt)}`
          : ""}
        {request.appliedAt ? `; applied ${formatDateTime(request.appliedAt)}` : ""}.{" "}
        {staffChangeLine(request)}
      </p>

      <dl className="bg-surface-variant border-outline m-0 flex flex-col gap-2 rounded-field border p-3">
        {request.originalInstructions ? (
          <Term label="The client asked">
            <span className="text-text-secondary">{request.originalInstructions}</span>
          </Term>
        ) : null}
        {request.proposedSpec ? (
          <Term label="The shop's change">
            <span style={medium}>{request.proposedSpec}</span>
          </Term>
        ) : null}
        {request.colourCorrection ? (
          <Term label="The shop's corrected colour pages">
            <ColourCorrectionPages
              request={request}
              original={originalColourOf(order, request.lineItemId)}
            />
          </Term>
        ) : null}
        {request.proposedReadyBy || request.proposedPromiseBy ? (
          <Term label="New dates">
            {request.proposedReadyBy ? `Ready by ${formatDateTime(request.proposedReadyBy)}` : ""}
            {request.proposedReadyBy && request.proposedPromiseBy ? ", " : ""}
            {request.proposedPromiseBy
              ? `client promised ${formatDateTime(request.proposedPromiseBy)}`
              : ""}
            {request.originalPromiseBy
              ? ` (was ${formatDateTime(request.originalPromiseBy)})`
              : ""}
          </Term>
        ) : null}
        {request.reason ? (
          <Term label="The shop's reason, as the client read it">
            <span className="text-text-secondary">{request.reason}</span>
          </Term>
        ) : null}
      </dl>

      <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
        <MoneyLine term="Extra for the shop" value={formatPhp(extra)} />
        {typeof fee === "number" ? (
          <MoneyLine term="GRIDGO's fee on it" value={formatPhp(fee)} />
        ) : null}
        {typeof total === "number" ? (
          <MoneyLine term="The client pays for the change" value={formatPhp(total)} strong />
        ) : null}
      </dl>
      {total ? (
        <p className="text-caption text-text-muted m-0">
          Collected up front by QR, on top of the checkout total. No voucher or organization
          discount applies to it. The shop&rsquo;s extra is paid with the final payout stage.
        </p>
      ) : null}

      {request.status === "pending_payment" && request.rejectionReason ? (
        <p className="text-caption text-text-secondary m-0">
          Last screenshot rejected: &ldquo;{request.rejectionReason}&rdquo; The client can send a
          new one.
        </p>
      ) : null}

      {request.status === "pending_confirmation" ? (
        <PaymentDecision
          order={order}
          request={request}
          onUpdated={onUpdated}
          onNotice={onNotice}
        />
      ) : null}

      {request.status === "applied" && request.payment ? (
        <CollectedPayment request={request} names={names} />
      ) : null}

      {request.status === "applied" && request.payout ? (
        <p className="text-body text-text-primary m-0">{payoutLine(request)}</p>
      ) : null}

      {request.paymentHistory?.length ? (
        <div className="flex flex-col gap-1 border-t border-outline-subtle pt-3">
          <p className="text-caption text-text-muted m-0">Rejected transfers</p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {request.paymentHistory.map((row) => (
              <li key={`${row.proofFileId}-${row.rejectedAt}`} className="text-caption text-text-secondary">
                {formatDateTime(row.rejectedAt)}, reference{" "}
                <span className="break-all">{row.reference}</span>
                {row.reason ? `: “${row.reason}”` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function payoutLine(request: OrderChangeRequest): string {
  const payout = request.payout!;
  const amount = formatPhp(payout.amountMinor ?? request.extraPrincipalMinor ?? 0);
  if (payout.status === "released") {
    return `${amount} extra released to the shop${payout.createdAt ? ` ${formatDateTime(payout.createdAt)}` : ""}${payout.reference ? `, reference ${payout.reference}` : ""}.`;
  }
  if (payout.status === "superseded") return `${amount} extra replaced by the refund settlement. Never pay it.`;
  return `${amount} extra owed to the shop, released with the final payout stage.`;
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="text-body text-text-primary m-0 break-words">{children}</dd>
    </div>
  );
}

function MoneyLine({ term, value, strong = false }: { term: string; value: string; strong?: boolean }) {
  const weight = strong ? medium : undefined;
  return (
    <>
      <dt
        className={`text-body m-0 ${strong ? "text-text-primary" : "text-text-secondary"}`}
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

function CollectedPayment({
  request,
  names,
}: {
  request: OrderChangeRequest;
  names: Record<string, string>;
}) {
  const payment = request.payment;
  if (!payment) return null;
  const who = (payment.confirmedBy && names[payment.confirmedBy]) || "the GRIDGO Team";
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-primary m-0">
        Collected {formatPhp(request.totalMinor ?? 0)} by QR
        {payment.confirmedAt ? `, verified ${formatDateTime(payment.confirmedAt)} by ${who}` : ""}.
        Reference <span className="break-all">{payment.reference}</span>.
      </p>
      <EvidencePlate fileId={payment.proofFileId} label="Change payment proof" caption={payment.reference} />
    </div>
  );
}

/**
 * The client's transfer for an approved change, waiting on the GRIDGO Team.
 * The change applies only once the exact amount is verified; the job is made
 * as ordered meanwhile.
 */
function PaymentDecision({
  order,
  request,
  onUpdated,
  onNotice,
}: {
  order: Order;
  request: OrderChangeRequest;
  onUpdated: () => Promise<void> | void;
  onNotice: (notice: string | null) => void;
}) {
  const payment = request.payment;
  const totalMinor = request.totalMinor ?? 0;
  const amount = formatPhp(totalMinor);
  const keys = useCommandKeys();
  const [dialog, setDialog] = useState<"confirm" | "reject" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: () => Promise<OrderChangeRequest>, done: string): Promise<void> {
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
        The client sent {amount} for this change. Verify it or reject it; the job is made as
        ordered until it is verified.
      </p>
      {payment ? (
        <dl className="m-0 flex flex-col gap-1">
          {payment.proofFileId ? (
            <ReceiptReferenceOcr fileId={payment.proofFileId} submittedReference={payment.reference} />
          ) : null}
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-caption text-text-muted m-0">Submitted</dt>
            <dd className="text-caption text-text-secondary m-0">{formatDateTime(payment.submittedAt)}</dd>
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
        <EvidencePlate fileId={payment.proofFileId} label="Change payment proof" caption={payment.reference} />
      ) : null}

      <ConfirmChangePaymentDialog
        open={dialog === "confirm"}
        amount={amount}
        reference={payment?.reference ?? ""}
        change={
          request.proposedSpec || (request.colourCorrection ? "the corrected colour prices" : "the new dates")
        }
        busy={busy}
        error={error}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) => {
          const body = { expectedVersion: request.version, amountMinor: totalMinor, reason };
          void decide(
            () => confirmChangePayment(order.id, request.id, body, keys.keyFor({ confirm: body })),
            "Payment verified. The change is agreed, and the shop and the client have been told.",
          );
        }}
      />
      <RejectChangePaymentDialog
        open={dialog === "reject"}
        amount={amount}
        busy={busy}
        error={error}
        onCancel={() => setDialog(null)}
        onReject={(reason) => {
          const body = { expectedVersion: request.version, reason };
          void decide(
            () => rejectChangePayment(order.id, request.id, body, keys.keyFor({ reject: body })),
            "Payment rejected. The client has your reason and can send a new screenshot.",
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

function ConfirmChangePaymentDialog({
  open,
  amount,
  reference,
  change,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  amount: string;
  reference: string;
  change: string;
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
          <AlertDialogTitle>Confirm the {amount} change payment?</AlertDialogTitle>
          <AlertDialogDescription>
            This applies the change straight away: the shop makes the job with &ldquo;{change}
            &rdquo;, and its extra is added to the final payout stage. It cannot be undone here.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Confirmation id="change-payment-found" checked={found} onChange={setFound} disabled={busy}>
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
            <FieldLabel htmlFor="change-payment-note">Note for the audit log</FieldLabel>
            <Textarea
              id="change-payment-note"
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
            {busy ? "Saving…" : "Confirm and apply the change"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RejectChangePaymentDialog({
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
      `We could not find a transfer of exactly ${amount} for your change. Check that it went through, then send a new screenshot.`,
    );
  }, [open, amount]);
  const ready = reason.trim().length > 0;
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Reject the {amount} change payment?</AlertDialogTitle>
          <AlertDialogDescription>
            Say this only when no matching transfer arrived: rejecting does not send any money
            back. The change stays approved but unpaid, and the client can send a new screenshot.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="change-payment-reject">Reason for the client</FieldLabel>
            <Textarea
              id="change-payment-reject"
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
