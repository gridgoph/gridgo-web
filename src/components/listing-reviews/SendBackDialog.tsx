"use client";

import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { REVIEW_REASON_MAX } from "@/lib/listing-review";

type Props = {
  open: boolean;
  /** "Send back “Glossy flyers”". */
  title: string;
  /** Who reads the reason, in one sentence. */
  audience: string;
  presets: readonly string[];
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSend: (reason: string) => void;
};

/**
 * The reason a reviewer sends back, written for the shop. A ready-made
 * reason fills the box and stays editable; the shop reads exactly what is
 * sent, so nothing is added to it here.
 */
export function SendBackDialog({
  open,
  title,
  audience,
  presets,
  busy,
  error,
  onCancel,
  onSend,
}: Props) {
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState(false);
  const fieldId = useId();
  const left = REVIEW_REASON_MAX - reason.length;

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setMissing(true);
      return;
    }
    onSend(trimmed);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) {
          setReason("");
          setMissing(false);
          onCancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{audience}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <p className="text-caption text-text-secondary m-0">
              Start from a common reason
            </p>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {presets.map((preset) => (
                <li key={preset}>
                  <button
                    type="button"
                    className="text-body text-text-primary border-outline hover:bg-overlay-hover aria-pressed:bg-muted aria-pressed:border-foreground min-h-11 w-full rounded-[var(--radius-field)] border px-3 py-2 text-left"
                    aria-pressed={reason === preset}
                    onClick={() => {
                      setReason(preset);
                      setMissing(false);
                    }}
                  >
                    {preset}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <Field data-invalid={missing ? true : undefined}>
            <FieldLabel htmlFor={fieldId}>Reason the shop will read</FieldLabel>
            <Textarea
              id={fieldId}
              rows={4}
              maxLength={REVIEW_REASON_MAX}
              value={reason}
              aria-invalid={missing ? true : undefined}
              onChange={(event) => {
                setReason(event.target.value);
                setMissing(false);
              }}
              placeholder="Say what is wrong and what to change."
            />
            {missing ? (
              <FieldError>Write the reason the shop will read.</FieldError>
            ) : (
              <FieldDescription>
                {left <= 200
                  ? `${left} characters left.`
                  : "Plain words: what to fix, and where."}
              </FieldDescription>
            )}
          </Field>
          {error ? (
            <p className="text-body text-destructive m-0" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Sending back" : "Send back"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
