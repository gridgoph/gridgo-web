"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ORDER_REMOVAL_REASON_MAX,
  orderRemovalBlockedReason,
  orderRemovalErrorMessage,
  orderRemovalReady,
  reasonTooLong,
} from "@/app/admin/_lib/order-removal";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { removeOrder } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";

type Props = {
  order: Order;
  /** Where to land once the order is gone. Its list is read fresh on arrival. */
  returnHref: string;
};

/**
 * Super Admin's Remove order, at the end of the workspace and away from the
 * steps being worked. The reason and the client's exact email follow Remove
 * account on Roles; the API checks both again.
 */
export function RemoveOrder({ order, returnHref }: Props) {
  const router = useRouter();
  const headingId = useId();
  const reasonId = useId();
  const emailId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [typedEmail, setTypedEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientEmail = order.clientEmail ?? null;
  const title = order.title || "Untitled order";
  const blockedReason = orderRemovalBlockedReason(order);
  const ready = orderRemovalReady({ reason, typedEmail, clientEmail });
  const reasonLength = reason.trim().length;
  const reasonOver = reasonTooLong(reason);
  const showCount = reasonLength > ORDER_REMOVAL_REASON_MAX - 200;
  const emailOff =
    clientEmail !== null &&
    typedEmail.length >= clientEmail.length &&
    typedEmail !== clientEmail;

  function close() {
    setOpen(false);
    setReason("");
    setTypedEmail("");
    setError(null);
  }

  async function submit() {
    if (!clientEmail || !ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await removeOrder(order.id, { reason: reason.trim(), confirmEmail: typedEmail });
      toast.add({
        type: "success",
        title: "Order removed",
        description: `${title} is off every list. The reason is on the audit log.`,
      });
      router.replace(returnHref);
    } catch (err) {
      setError(orderRemovalErrorMessage(err));
      setBusy(false);
    }
  }

  if (blockedReason) {
    return (
      <section
        aria-labelledby={headingId}
        className="flex flex-col gap-1 rounded-card border border-outline p-4"
      >
        <h2 id={headingId} className="text-h3 text-text-primary m-0">
          Remove order
        </h2>
        <p className="text-body text-text-secondary m-0">{blockedReason}</p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className="border-destructive/40 flex flex-col gap-3 rounded-card border p-4 md:flex-row md:items-center md:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id={headingId} className="text-h3 text-text-primary m-0">
          Remove order
        </h2>
        <p className="text-body text-text-secondary m-0">
          {clientEmail
            ? "For test orders and orders that will never finish. The order leaves every list and app. No money moves."
            : "This order has no client email to confirm against, so it cannot be removed here."}
        </p>
      </div>
      <Button
        variant="danger"
        className="shrink-0"
        disabled={!clientEmail}
        onClick={() => setOpen(true)}
      >
        Remove order
      </Button>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          if (next) setOpen(true);
          else close();
        }}
      >
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="min-w-0 max-w-full break-words">
              Remove {title}
            </AlertDialogTitle>
            <AlertDialogDescription>
              The reason is written to the audit log with your name.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <FieldGroup>
            <div
              className="rounded-field border border-outline bg-surface-variant px-3 py-3"
              role="note"
            >
              <p className="text-body text-text-primary m-0">
                The order disappears from every list and app, for the client, the shop and
                the rider. Nobody is notified, and it cannot be put back from here.
              </p>
              <p className="text-body text-text-primary m-0 mt-2">
                The record and your reason stay on the audit log. No money moves.
              </p>
            </div>

            <Field data-invalid={reasonOver || undefined}>
              <FieldLabel htmlFor={reasonId}>Reason (required)</FieldLabel>
              <Textarea
                id={reasonId}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                className="max-h-40 overflow-y-auto"
                placeholder="Why this order should be removed"
                disabled={busy}
                required
                aria-invalid={reasonOver || undefined}
                aria-describedby={showCount ? `${reasonId}-count` : undefined}
              />
              {showCount ? (
                <p
                  id={`${reasonId}-count`}
                  className={`text-caption m-0 ${reasonOver ? "text-error" : "text-text-muted"}`}
                >
                  {reasonOver
                    ? `${reasonLength.toLocaleString("en-PH")} characters. Keep it to ${ORDER_REMOVAL_REASON_MAX.toLocaleString("en-PH")}.`
                    : `${reasonLength.toLocaleString("en-PH")} of ${ORDER_REMOVAL_REASON_MAX.toLocaleString("en-PH")} characters`}
                </p>
              ) : null}
            </Field>

            <Field data-invalid={emailOff || undefined}>
              <FieldLabel htmlFor={emailId} className="block">
                Type the client&rsquo;s email to confirm:{" "}
                <span className="break-all">{clientEmail}</span>
              </FieldLabel>
              <Input
                id={emailId}
                value={typedEmail}
                onChange={(event) => setTypedEmail(event.target.value)}
                aria-invalid={emailOff || undefined}
                aria-describedby={emailOff ? `${emailId}-off` : undefined}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                inputMode="email"
                spellCheck={false}
                disabled={busy}
              />
              {emailOff ? (
                <p id={`${emailId}-off`} className="text-caption text-error m-0">
                  That does not match yet. Capitals and spaces count.
                </p>
              ) : null}
            </Field>
          </FieldGroup>

          {error ? (
            <p className="text-body text-error m-0" role="alert">
              {error}
            </p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary" disabled={busy} onClick={close}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              disabled={busy || !ready}
              onClick={() => void submit()}
            >
              {busy ? "Removing…" : "Remove order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
