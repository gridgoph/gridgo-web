"use client";

import { useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { EXPRESS_DECLINE_REASONS, NO_PENALTY } from "@/lib/express-shop";

const OTHER = "other";

/**
 * Can't do it: a one-tap reason, then the job goes to the next shop. The same
 * reasons as the phone app; GRIDGO takes the words as free text.
 */
export function ExpressDeclineDialog({
  open,
  busy,
  error,
  onCancel,
  onDecline,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onDecline: (reason: string) => void;
}) {
  const [choice, setChoice] = useState<string>("");
  const [other, setOther] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChoice("");
    setOther("");
    setMissing(false);
  }, [open]);

  const reason = choice === OTHER ? other.trim() : choice;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Can&rsquo;t do this one?</AlertDialogTitle>
          <AlertDialogDescription>{NO_PENALTY}</AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Field data-invalid={missing && !reason ? true : undefined}>
            <FieldLabel id="express-decline-label">What&rsquo;s stopping you?</FieldLabel>
            <RadioGroup
              aria-labelledby="express-decline-label"
              value={choice}
              onValueChange={(value) => {
                setChoice(String(value));
                setMissing(false);
              }}
              disabled={busy}
              className="gap-0"
            >
              {[...EXPRESS_DECLINE_REASONS, "Other"].map((label) => {
                const value = label === "Other" ? OTHER : label;
                return (
                  <label
                    key={value}
                    className="flex min-h-11 cursor-pointer items-center gap-3 py-1"
                  >
                    <RadioGroupItem value={value} />
                    <span className="text-body text-text-primary">{label}</span>
                  </label>
                );
              })}
            </RadioGroup>
          </Field>
          {choice === OTHER ? (
            <Field data-invalid={missing && !reason ? true : undefined}>
              <FieldLabel htmlFor="express-decline-other">In a few words</FieldLabel>
              <Textarea
                id="express-decline-other"
                value={other}
                maxLength={300}
                disabled={busy}
                aria-invalid={missing && !reason ? true : undefined}
                onChange={(event) => setOther(event.target.value)}
              />
            </Field>
          ) : null}
          {missing && !reason ? (
            <p className="text-body text-error m-0" role="alert">
              Pick a reason first.
            </p>
          ) : null}
          {error ? (
            <p className="text-body text-error m-0" role="alert">
              {error}
            </p>
          ) : null}
        </FieldGroup>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (!reason) {
                setMissing(true);
                return;
              }
              onDecline(reason);
            }}
          >
            {busy ? "Sending…" : "Send to another shop"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
