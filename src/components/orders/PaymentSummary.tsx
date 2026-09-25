import type { ReactNode } from "react";
/**
 * The installments of an order's digital payment, with what the client sent
 * and where each one stands: one full payment on an order paid up front, the
 * downpayment and the balance on a split one. The review workspace supplies
 * authorized actions beside the matching installment; other callers keep this
 * read-only.
 */

import { EvidencePlate } from "@/components/orders/EvidencePreview";
import { ReceiptReferenceOcr } from "@/components/orders/ReceiptReferenceOcr";
import { StatusChip } from "@/components/ui/StatusChip";
import type { Order, PaymentInstallment } from "@/lib/api/types";
import { formatDateTime, formatPhp } from "@/lib/format";
import {
  presentConfirmationSource,
  presentInstallment,
  presentPaymentMethod,
  presentPaymentStatus,
} from "@/lib/order-state";
import { balanceNotRequired, listedInstallments, paymentOf } from "@/lib/payments";

type Props = {
  order: Order;
  renderActions?: (code: PaymentInstallment) => ReactNode;
};

export function PaymentSummary({ order, renderActions }: Props) {
  const installments = listedInstallments(order);
  const upfront = balanceNotRequired(order);
  if (installments.length === 0) {
    return (
      <p className="text-body text-text-secondary m-0">
        The payment is set up when the supplier accepts and names its price. Nothing is
        owed before then.
      </p>
    );
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {installments.map((code) => {
        const payment = paymentOf(order, code);
        if (!payment) return null;
        const status = presentPaymentStatus(payment.status);
        return (
          <li key={code} className="rounded-card border border-outline-subtle px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p
                className="text-body text-text-primary m-0"
                style={{ fontFamily: "var(--font-medium)" }}
              >
                {presentInstallment(code, order)}
              </p>
              <p
                className="text-body text-text-primary m-0 tabular-nums"
                style={{ fontFamily: "var(--font-bold)" }}
              >
                {formatPhp(payment.amountMinor)}
              </p>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
              {/*
                Every payment is a QR transfer, so naming the method on every
                row tells the reader nothing. It earns its place only on the
                migrated orders whose method really is different.
              */}
              {payment.method && payment.method !== "qr_manual" ? (
                <span className="text-caption text-text-muted">
                  {presentPaymentMethod(payment.method)}
                </span>
              ) : null}
            </div>

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
                      {presentConfirmationSource(payment.confirmationSource)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : payment.rejectionReason ? (
              <p className="text-caption text-text-secondary m-0 mt-2">
                Sent back {formatDateTime(payment.rejectedAt)}: &ldquo;
                {payment.rejectionReason}&rdquo; The client can submit a new reference.
              </p>
            ) : (
              <p className="text-caption text-text-muted m-0 mt-2">
                {code === "downpayment"
                  ? upfront
                    ? "The client pays the whole order by QR transfer once they have been told the final price."
                    : "The client sends this by QR transfer once they have been told the final price."
                  : "The client can send the balance once the downpayment is confirmed."}
              </p>
            )}
            {renderActions?.(code)}
            {payment.proofFileId ? (
              <div className="mt-3">
                <EvidencePlate
                  fileId={payment.proofFileId}
                  label="QR proof"
                  caption={payment.reference}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
