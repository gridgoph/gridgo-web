import Link from "next/link";

import { EvidencePlate } from "@/components/orders/EvidencePreview";
import { ReceiptReferenceOcr } from "@/components/orders/ReceiptReferenceOcr";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import type { Basket, Order } from "@/lib/api/types";
import {
  basketPaymentPending,
  cancelledShares,
  currentGroup,
  type CancelledShare,
} from "@/lib/baskets";
import { formatDateTime, formatPhp } from "@/lib/format";
import { presentConfirmationSource, presentPaymentStatus } from "@/lib/order-state";

type Props = {
  order: Order;
  basket: Basket | null;
  /** Set when the basket could not be read; the actions then stay hidden. */
  basketError: string | null;
  /** Which tree the links stay inside. */
  tree: "ops" | "admin";
  busy: boolean;
  onConfirm: () => void;
  onReject: (reason: string) => void;
};

/**
 * The Payment step of one shop group of a multi-shop basket.
 *
 * The client made one transfer for every shop, so it is checked and confirmed
 * once, for the whole basket (`POST /baskets/:id/payment/confirm`). A group's
 * own payment routes refuse with `409 basket_payment_required`, which is why
 * this step never offers them.
 */
export function BasketPayment({
  order,
  basket,
  basketError,
  tree,
  busy,
  onConfirm,
  onReject,
}: Props) {
  if (!basket) {
    return (
      <p
        className="text-body text-text-secondary m-0"
        role={basketError ? "alert" : "status"}
      >
        {order.groupLabel ?? "This shop"} is part of a grouped order, paid with one
        transfer for every group. {basketError ?? "Loading that payment…"}
      </p>
    );
  }
  const payment = basket.payment;
  const status = presentPaymentStatus(payment.status);
  const group = currentGroup(basket, order.id);
  const owed = cancelledShares(basket);
  return (
    <div className="rounded-card border border-outline-subtle px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p
          className="text-body text-text-primary m-0"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          One payment for {basket.groups.length} groups
        </p>
        <p
          className="text-body text-text-primary m-0 tabular-nums"
          style={{ fontFamily: "var(--font-bold)" }}
          data-testid="basket-payment-amount"
        >
          {formatPhp(payment.amountMinor ?? basket.totalMinor)}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
      </div>
      <p className="text-caption text-text-secondary m-0 mt-2">
        {basket.groups
          .map((entry) => `${entry.label} ${formatPhp(entry.totalMinor)}`)
          .join(" + ")}
        {group
          ? `. ${group.label}, this order, is ${formatPhp(group.totalMinor)} of it.`
          : "."}
      </p>

      {payment.reference || payment.proofFileId ? (
        <dl className="mt-2 m-0 flex flex-col gap-1">
          {payment.proofFileId ? (
            <ReceiptReferenceOcr
              fileId={payment.proofFileId}
              submittedReference={payment.reference}
            />
          ) : (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-caption text-text-muted m-0">Client reference</dt>
              <dd className="text-caption text-text-primary m-0 font-mono break-all">
                {payment.reference}
              </dd>
            </div>
          )}
          {payment.submittedAt ? (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-caption text-text-muted m-0">Submitted</dt>
              <dd className="text-caption text-text-secondary m-0">
                {formatDateTime(payment.submittedAt)}
              </dd>
            </div>
          ) : null}
          {payment.confirmedAt ? (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-caption text-text-muted m-0">Confirmed</dt>
              <dd className="text-caption text-text-secondary m-0">
                {formatDateTime(payment.confirmedAt)} ·{" "}
                {presentConfirmationSource(payment.confirmationSource ?? null)}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : payment.rejectionReason ? (
        <p className="text-caption text-text-secondary m-0 mt-2">
          Sent back {formatDateTime(payment.rejectedAt)}: &ldquo;{payment.rejectionReason}
          &rdquo; The client can submit a new reference for the whole order.
        </p>
      ) : (
        <p className="text-caption text-text-muted m-0 mt-2">
          The client pays every shop with one QR transfer.
        </p>
      )}

      {basketPaymentPending(basket) ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-caption text-text-secondary m-0">
            Check the transfer against{" "}
            {formatPhp(payment.amountMinor ?? basket.totalMinor)} before confirming.
            Confirming pays for all {basket.groups.length} groups at once; each
            shop&rsquo;s file check still happens on its own order.
          </p>
          <CancelledShareNotes shares={owed} orderId={order.id} tree={tree} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} onClick={onConfirm}>
              Confirm payment for all {basket.groups.length} groups
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => onReject("The transfer could not be matched to this order.")}
            >
              Reject
            </Button>
          </div>
        </div>
      ) : null}

      {owed.length && !basketPaymentPending(basket) ? (
        <div className="mt-3">
          <CancelledShareNotes shares={owed} orderId={order.id} tree={tree} />
        </div>
      ) : null}

      {payment.proofFileId ? (
        <div className="mt-3">
          <EvidencePlate
            fileId={payment.proofFileId}
            label="QR proof"
            caption={payment.reference ?? undefined}
            deletable
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * A cancelled group's money is inside the one payment, and confirming takes
 * it. Each note says how much, and links to the order it is refunded from.
 */
export function CancelledShareNotes({
  shares,
  orderId,
  tree,
}: {
  shares: CancelledShare[];
  /** The order this workspace is open on; it gets no link to itself. */
  orderId: string;
  tree: "ops" | "admin";
}) {
  if (!shares.length) return null;
  return (
    <ul
      className="m-0 flex list-none flex-col gap-2 p-0"
      aria-label="Cancelled shops to refund"
    >
      {shares.map((share) => (
        <li
          key={share.orderId}
          className="rounded-field border-warning flex flex-col gap-2 border px-3 py-2"
          data-testid={`cancelled-share-${share.label}`}
        >
          <p className="text-body text-text-primary m-0">{share.sentence}</p>
          {share.orderId === orderId ? null : (
            <div>
              <Link
                href={`/${tree}/orders/${encodeURIComponent(share.orderId)}`}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Open {share.label}&rsquo;s order
              </Link>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
