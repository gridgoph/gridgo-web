"use client";

/** The quote request's decisions that need words: validity, cancel, publish. */

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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  manilaDay,
  manilaDayOf,
  QUOTE_REASON_MAX,
  QUOTE_VALIDITY_MAX_DAYS,
  validityUntilFromDay,
} from "@/lib/quote-requests";

function useResetOnOpen(open: boolean, reset: () => void) {
  useEffect(() => {
    if (open) reset();
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

function failureText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function QuoteValidityDialog({
  open,
  validUntil,
  renewing,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  validUntil: string | null;
  /** The options lapsed; a new date brings them back. */
  renewing: boolean;
  onCancel: () => void;
  onSubmit: (body: { validUntil: string; reason: string }) => Promise<void>;
}) {
  const [day, setDay] = useState("");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  useResetOnOpen(open, () => {
    const current = manilaDayOf(validUntil);
    setDay(current && current > manilaDay() ? current : "");
    setReason("");
    setProblem(null);
    setFailure(null);
  });
  const max = manilaDay(Date.now() + (QUOTE_VALIDITY_MAX_DAYS - 1) * 86_400_000);

  async function submit() {
    const until = validityUntilFromDay(day);
    const why = reason.trim();
    if (!until.ok) {
      setProblem(until.problem);
      return;
    }
    if (!why) {
      setProblem("Write why the date changes. It is kept in the audit log.");
      return;
    }
    setProblem(null);
    setBusy(true);
    setFailure(null);
    try {
      await onSubmit({ validUntil: until.validUntil, reason: why });
    } catch (err) {
      setFailure(failureText(err, "Could not change the date. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next && !busy ? onCancel() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{renewing ? "Renew the options" : "Change how long the options stay open"}</DialogTitle>
          <DialogDescription>
            {renewing
              ? "The options lapsed. A new date opens them again for the client, or reopens the cart they accepted. The client is told."
              : "The client can accept until the end of this day, Manila time. The client is told."}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="quote-valid-until">Open until</FieldLabel>
            <Input
              id="quote-valid-until"
              type="date"
              className="max-w-48"
              min={manilaDay(Date.now() + 86_400_000)}
              max={max}
              value={day}
              disabled={busy}
              onChange={(event) => {
                setDay(event.target.value);
                setProblem(null);
              }}
            />
            <FieldDescription>At most {QUOTE_VALIDITY_MAX_DAYS} days from now.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="quote-validity-reason">Reason</FieldLabel>
            <Textarea
              id="quote-validity-reason"
              rows={2}
              maxLength={QUOTE_REASON_MAX}
              value={reason}
              disabled={busy}
              onChange={(event) => {
                setReason(event.target.value);
                setProblem(null);
              }}
              placeholder="For example: the shop holds its price until the 20th."
            />
            <FieldDescription>Kept in the audit log.</FieldDescription>
          </Field>
          {problem ? <FieldError>{problem}</FieldError> : null}
        </FieldGroup>
        {failure ? (
          <p className="text-body text-error m-0" role="alert">
            {failure}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>
            {busy ? "Saving…" : renewing ? "Renew" : "Save date"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CancelQuoteDialog({
  open,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  useResetOnOpen(open, () => {
    setReason("");
    setProblem(null);
    setFailure(null);
  });

  async function submit() {
    const why = reason.trim();
    if (!why) {
      setProblem("Write why the request is closing. The client reads it.");
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await onSubmit(why);
    } catch (err) {
      setFailure(failureText(err, "Could not cancel the request. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!next && !busy ? onCancel() : undefined)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this quote request?</AlertDialogTitle>
          <AlertDialogDescription>
            The client is told and its options stop working, including a cart they already
            opened. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field data-invalid={problem ? true : undefined}>
          <FieldLabel htmlFor="quote-cancel-reason">Reason for the client</FieldLabel>
          <Textarea
            id="quote-cancel-reason"
            rows={3}
            maxLength={QUOTE_REASON_MAX}
            value={reason}
            disabled={busy}
            aria-invalid={problem ? true : undefined}
            onChange={(event) => {
              setReason(event.target.value);
              setProblem(null);
            }}
            placeholder="For example: no shop can make this size before your event."
          />
          {problem ? (
            <FieldError>{problem}</FieldError>
          ) : (
            <FieldDescription>The client reads it word for word.</FieldDescription>
          )}
        </Field>
        {failure ? (
          <p className="text-body text-error m-0" role="alert">
            {failure}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            Keep it open
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={() => void submit()}>
            {busy ? "Cancelling…" : "Cancel request"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function PublishQuoteDialog({
  open,
  count,
  republish,
  validityDays,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  count: number;
  republish: boolean;
  validityDays: number | null;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  useResetOnOpen(open, () => setFailure(null));
  const options = `${count} ${count === 1 ? "option" : "options"}`;

  async function confirm() {
    setBusy(true);
    setFailure(null);
    try {
      await onConfirm();
    } catch (err) {
      setFailure(failureText(err, "Could not publish. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!next && !busy ? onCancel() : undefined)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send {options} to the client?</AlertDialogTitle>
          <AlertDialogDescription>
            {republish
              ? "These replace the options the client has now, and the validity starts again. "
              : ""}
            The client is told right away and can accept one
            {validityDays != null
              ? ` for ${validityDays} ${validityDays === 1 ? "day" : "days"}`
              : ""}
            . The notice cannot be unsent.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failure ? (
          <p className="text-body text-error m-0" role="alert">
            {failure}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            Not yet
          </AlertDialogCancel>
          <AlertDialogAction variant="primary" disabled={busy} onClick={() => void confirm()}>
            {busy ? "Publishing…" : `Publish ${options}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
