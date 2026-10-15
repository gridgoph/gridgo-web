"use client";

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { DECLINE_REASONS, type DeclineReasonId, declineReasonText } from "@/lib/order-changes";

type Props = {
  open: boolean;
  /** Chosen when the dialog opens: "Not possible? Decline this job" opens on the notes reason. */
  initialReason: DeclineReasonId | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onDecline: (reason: string) => void;
};

/**
 * Declining an offer, with the reason GRIDGO records. The reason is a fixed
 * choice, as in the shop app, so the GRIDGO Team always knows why; the shop
 * can add its own words after it.
 */
export function DeclineJobDialog({ open, initialReason, busy, error, onCancel, onDecline }: Props) {
  const [reason, setReason] = useState<DeclineReasonId | null>(initialReason);
  const [detail, setDetail] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason(initialReason);
    setDetail("");
    setMissing(false);
  }, [open, initialReason]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Decline this job?</AlertDialogTitle>
          <AlertDialogDescription>
            It goes back to GRIDGO to be given to another shop, and you lose this
            assignment.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Field data-invalid={missing && !reason ? true : undefined}>
            <FieldLabel id="decline-reason-label">Why are you declining?</FieldLabel>
            <RadioGroup
              aria-labelledby="decline-reason-label"
              value={reason ?? ""}
              onValueChange={(value) => {
                setReason(value as DeclineReasonId);
                setMissing(false);
              }}
              disabled={busy}
              className="gap-0"
            >
              {DECLINE_REASONS.map((option) => (
                <label key={option.id} className="flex min-h-11 cursor-pointer items-center gap-3 py-1">
                  <RadioGroupItem value={option.id} />
                  <span className="text-body text-text-primary">{option.label}</span>
                </label>
              ))}
            </RadioGroup>
            {missing && !reason ? (
              <p className="text-body text-error m-0" role="alert">
                Choose why you are declining.
              </p>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="decline-detail">Anything to add (optional)</FieldLabel>
            <Textarea
              id="decline-detail"
              rows={2}
              maxLength={500}
              value={detail}
              disabled={busy}
              onChange={(event) => setDetail(event.target.value)}
            />
            <FieldDescription>The GRIDGO Team reads this with your reason.</FieldDescription>
          </Field>
        </FieldGroup>
        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy}>
            Keep job
          </AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (!reason) {
                setMissing(true);
                return;
              }
              onDecline(declineReasonText(reason, detail));
            }}
          >
            {busy ? "Declining…" : "Confirm decline"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
