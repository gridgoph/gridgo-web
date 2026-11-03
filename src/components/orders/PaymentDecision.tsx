import { PaymentSummary } from "@/components/orders/PaymentSummary";
import { Button } from "@/components/ui/button";
import type { Order, PaymentInstallment } from "@/lib/api/types";
import { paymentOf } from "@/lib/payments";

/**
 * An order's own payment, with Confirm and Reject beside the installment that
 * is waiting on a decision. The QR proof and the reference the client sent sit
 * on the same card, so the transfer is checked where it is decided. The order
 * workspace's Payment step and the queue's Confirm payment sheet both draw this.
 */
export function PaymentDecision({
  order,
  busy,
  onConfirm,
  onReject,
}: {
  order: Order;
  busy: boolean;
  onConfirm: (installment: PaymentInstallment) => void;
  onReject: (installment: PaymentInstallment, reason: string) => void;
}) {
  return (
    <PaymentSummary
      order={order}
      renderActions={(installment) =>
        paymentOf(order, installment)?.status === "pending_confirmation" ? (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-caption text-text-secondary m-0">
              Check the transfer against the amount and receipt before confirming.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={() => onConfirm(installment)}
                disabled={busy}
              >
                {installment === "balance"
                  ? "Confirm balance payment"
                  : "Confirm this payment"}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  onReject(
                    installment,
                    "The transfer could not be matched to this order.",
                  )
                }
              >
                {installment === "balance" ? "Reject balance" : "Reject"}
              </Button>
            </div>
          </div>
        ) : null
      }
    />
  );
}
