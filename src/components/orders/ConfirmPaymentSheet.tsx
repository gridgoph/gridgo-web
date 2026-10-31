"use client";

/**
 * Confirm or reject a client's payment from the order queue, without opening
 * the order.
 *
 * The sheet draws the same decision the order workspace's Payment step draws
 * -- the amount, the reference the client sent, the QR proof, and the same
 * Confirm and Reject -- over a fresh read of the order, and sends the same
 * request. A grouped order's payment is the basket's, decided once for every
 * group, exactly as on the workspace. Nothing here is a shortcut past a check:
 * the API refuses whatever it refused before, and the reason is shown.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { BasketPayment } from "@/components/orders/BasketPayment";
import { PaymentDecision } from "@/components/orders/PaymentDecision";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SkeletonLines } from "@/components/ui/loading";
import { toast } from "@/components/ui/toast";
import {
  confirmBasketPayment,
  confirmPayment,
  getBasket,
  getOrder,
  rejectBasketPayment,
  rejectPayment,
} from "@/lib/api/client";
import type { Basket, Order } from "@/lib/api/types";
import { clientLabel } from "@/lib/client-name";

type Props = {
  /** The queue's row; the sheet re-reads it before anything is decided. */
  order: Order | null;
  onClose: () => void;
  /** A decision went through: re-read the queue. */
  onDecided: () => void;
};

const FAILED = "That did not go through. Refresh the order and try again.";

export function ConfirmPaymentSheet({ order, onClose, onDecided }: Props) {
  const [fresh, setFresh] = useState<Order | null>(null);
  const [basket, setBasket] = useState<Basket | null>(null);
  const [basketError, setBasketError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const orderId = order?.id ?? null;
  useEffect(() => {
    setFresh(null);
    setBasket(null);
    setBasketError(null);
    setLoadError(null);
    setActionError(null);
    if (!orderId) return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await getOrder(orderId);
        if (cancelled) return;
        setFresh(next);
        if (next.basketId) {
          try {
            const read = await getBasket(next.basketId);
            if (!cancelled) setBasket(read);
          } catch {
            if (!cancelled) {
              setBasketError(
                "That payment could not be loaded, so it cannot be confirmed from here. Refresh the order to try again.",
              );
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            opsErrorMessage(err, "This order could not be loaded. Try again."),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  async function decide(done: string, action: () => Promise<unknown>) {
    if (!fresh) return;
    setBusy(true);
    setActionError(null);
    try {
      await action();
      toast.add({
        type: "success",
        title: done,
        description: fresh.title || `Order ${fresh.id}`,
      });
      onDecided();
      onClose();
    } catch (err) {
      setActionError(opsErrorMessage(err, FAILED));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={order !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
      >
        <SheetHeader className="gap-1 border-b border-border p-4 pr-14">
          <SheetTitle>Confirm payment</SheetTitle>
          <SheetDescription render={<div />}>
            <span className="text-body text-text-primary block">
              {order?.title || "Untitled order"}
            </span>
            <span className="text-caption text-text-secondary block">
              {order ? `${clientLabel(order)} · Order ${order.id}` : null}
            </span>
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 p-4">
          {loadError ? (
            <p className="text-body text-text-primary m-0" role="alert">
              {loadError}
            </p>
          ) : !fresh ? (
            <SkeletonLines lines={4} />
          ) : fresh.basketId ? (
            <BasketPayment
              order={fresh}
              basket={basket}
              basketError={basketError}
              tree="ops"
              busy={busy}
              onConfirm={() =>
                void decide("Payment confirmed", () =>
                  confirmBasketPayment(fresh.basketId as string),
                )
              }
              onReject={(reason) =>
                void decide("Payment sent back", () =>
                  rejectBasketPayment(fresh.basketId as string, { reason }),
                )
              }
            />
          ) : (
            <PaymentDecision
              order={fresh}
              busy={busy}
              onConfirm={(installment) =>
                void decide("Payment confirmed", () =>
                  confirmPayment(fresh.id, installment),
                )
              }
              onReject={(installment, reason) =>
                void decide("Payment sent back", () =>
                  rejectPayment(fresh.id, installment, { reason }),
                )
              }
            />
          )}
          {actionError ? (
            <p className="text-body text-text-primary m-0" role="alert">
              {actionError}
            </p>
          ) : null}
          {order ? (
            <Link
              href={`/ops/orders/${order.id}`}
              className={buttonVariants({ variant: "ghost" })}
            >
              Open the whole order
            </Link>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
