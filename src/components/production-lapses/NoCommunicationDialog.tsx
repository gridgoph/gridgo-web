"use client";

/**
 * Operations recording that a shop on an overdue, unfinished job could not be
 * reached (`POST /orders/:id/production-no-communication`). Silence in the app
 * proves nothing — the shop may have called — so a person attests it with a
 * reason, and the API makes the lapse severe: a severe warning, the severe
 * rate if deductions are on, and the order eligible for reassignment review.
 *
 * An AlertDialog: the escalation is audited and cannot be taken back here.
 */

import { useEffect, useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";

const REASON_MAX = 500;

export function NoCommunicationDialog({
  open,
  orderTitle,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  orderTitle: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const ready = reason.trim().length > 0;

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Record no word from the shop?</AlertDialogTitle>
          <AlertDialogDescription>
            {orderTitle} is past its ready-by time. Recording that the shop could not be
            reached makes this a severe lapse straight away: the shop gets a severe
            warning, and the order can be reviewed for handing to another shop. Only
            record it if you tried to reach them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="no-communication-reason">
              How you tried to reach the shop
            </FieldLabel>
            <Textarea
              id="no-communication-reason"
              rows={3}
              maxLength={REASON_MAX}
              value={reason}
              disabled={busy}
              aria-invalid={error ? true : undefined}
              placeholder="e.g. Called twice and messaged in chat since the deadline; no answer."
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldDescription>Kept in the audit log with your name.</FieldDescription>
          </Field>
        </FieldGroup>
        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            disabled={busy || !ready}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy ? "Recording…" : "Record no word"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
