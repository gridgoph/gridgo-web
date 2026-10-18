"use client";

/**
 * Super Admin marking a late finish no-fault
 * (`POST /orders/:orderId/performance-no-fault`). It takes the order out of
 * this shop's counts, on-time rate and Top Pick consequences; the notice stays
 * on record, marked exempt. It cannot be undone or reworded: a retry returns
 * the first declaration. It changes no date and moves no money.
 */

import { useEffect, useId, useState } from "react";

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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { PerformanceEvent } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { NO_FAULT_REASON_MAX, hoursLateText } from "@/lib/supplier-performance";

export function NoFaultDialog({
  event,
  shopName,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  event: PerformanceEvent | null;
  shopName: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (event) setReason("");
  }, [event]);
  const text = reason.trim();
  const ready = text.length > 0 && reason.length <= NO_FAULT_REASON_MAX;
  const late = event ? hoursLateText(event) : null;
  return (
    <AlertDialog open={event !== null} onOpenChange={(next) => !next && !busy && onCancel()}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Mark this late finish no-fault?</AlertDialogTitle>
          <AlertDialogDescription>
            Order {event?.orderId}
            {event ? `, finished ${formatDateTime(event.at)}` : ""}
            {late ? `, ${late}` : ""}. {shopName}&rsquo;s counts, on-time rate and Top Pick
            standing stop counting this order. The notice stays on record, marked exempt. This
            cannot be undone or reworded later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor={`${id}-reason`}>Why it was not the shop&rsquo;s fault</FieldLabel>
          <Textarea
            id={`${id}-reason`}
            rows={3}
            maxLength={NO_FAULT_REASON_MAX}
            value={reason}
            disabled={busy}
            aria-invalid={error ? true : undefined}
            placeholder="e.g. A verified power outage in the shop's area that day."
            onChange={(change) => setReason(change.target.value)}
          />
          <FieldDescription>
            The shop and every Operations and Super Admin member get this as a written notice.
          </FieldDescription>
        </Field>
        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            Keep it counted
          </AlertDialogCancel>
          <AlertDialogAction
            variant="primary"
            disabled={busy || !ready}
            onClick={() => onConfirm(text)}
          >
            {busy ? "Saving…" : "Mark no-fault"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
