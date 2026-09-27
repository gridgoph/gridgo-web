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
import { Textarea } from "@/components/ui/textarea";
type Props = {
  /** The open escalation being answered; null keeps the dialog closed. */
  escalationId: string | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSend: (instruction: string) => void;
};

/**
 * Operations' answer to a rider blocked at the counter.
 *
 * Resolving never lets the package move: the rider repeats all six checks and
 * a fresh count, and the shop still signs, before custody changes. Shared by
 * the escalations queue and the order workspace so the promise is worded once.
 */
export function ResolveEscalationDialog({
  escalationId,
  busy,
  error,
  onCancel,
  onSend,
}: Props) {
  const [instruction, setInstruction] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setInstruction("");
    setMissing(false);
  }, [escalationId]);

  function send() {
    const text = instruction.trim();
    if (!text) {
      setMissing(true);
      return;
    }
    onSend(text);
  }

  const message = missing
    ? "Write the instruction. The rider is waiting at the shop and this is what they act on."
    : error;

  return (
    <AlertDialog
      open={Boolean(escalationId)}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Tell the rider what to do</AlertDialogTitle>
          <AlertDialogDescription>
            The rider is at the shop and cannot take the package until you answer. What
            you write reaches them. They then repeat all six checks and count every line
            again, and the shop signs, before anything moves.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Field data-invalid={missing || undefined}>
            <FieldLabel htmlFor="escalation-instruction">Instruction</FieldLabel>
            <Textarea
              id="escalation-instruction"
              rows={4}
              value={instruction}
              aria-invalid={missing || undefined}
              onChange={(event) => {
                setInstruction(event.target.value);
                if (missing) setMissing(false);
              }}
              placeholder="e.g. The shop is printing the 12 missing cards. Wait, then count again."
            />
            <FieldDescription>
              Say what happens to the order and what the rider does next.
            </FieldDescription>
          </Field>
        </FieldGroup>
        {message ? (
          <p className="text-body text-error m-0" role="alert">
            {message}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction variant="primary" disabled={busy} onClick={send}>
            {busy ? "Sending…" : "Send instruction"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
