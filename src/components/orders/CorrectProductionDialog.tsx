"use client";

/**
 * Operations or Super Admin moving a job out of production on the shop's
 * behalf. The API accepts it on the edges it gates for the shop, only with a
 * written reason (`400 production_override_reason_required`), and audits it
 * as `order.production_override`. It never invents a photo: the client's
 * order keeps saying it is waiting for one.
 *
 * An AlertDialog rather than a Dialog: the move offers the job to riders at
 * once and cannot be taken back from here.
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

export function CorrectProductionDialog({
  open,
  photoMissing,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** The API's word on the gallery; the copy changes with it. */
  photoMissing: boolean;
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
          <AlertDialogTitle>Move this job to ready for dispatch?</AlertDialogTitle>
          <AlertDialogDescription>
            {photoMissing
              ? "The shop has not sent a progress photo. Riders are offered the job straight away, and the client's order keeps saying it is waiting for a progress photo."
              : "The shop has sent a progress photo but has not marked the job ready for dispatch. Riders are offered it straight away."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="production-correction-reason">
              Why you are moving it on
            </FieldLabel>
            <Textarea
              id="production-correction-reason"
              rows={3}
              maxLength={REASON_MAX}
              value={reason}
              disabled={busy}
              aria-invalid={error ? true : undefined}
              placeholder="e.g. Saw the finished job at the counter; the shop's phone cannot upload."
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldDescription>
              Kept in the audit log with your name. The shop sees it in the job&rsquo;s
              history; the client never does.
            </FieldDescription>
          </Field>
        </FieldGroup>
        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            Keep it with the shop
          </AlertDialogCancel>
          <AlertDialogAction
            variant="primary"
            disabled={busy || !ready}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy ? "Moving…" : "Move to ready for dispatch"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
