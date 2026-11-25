"use client";

import { useId, useState, type ReactNode } from "react";

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
import { REASON_MAX, isStale, partnerErrorText } from "@/lib/organization-partners";

/**
 * Every partner and perk change goes through here: what will happen, then a
 * written reason for the audit log, then one press. A second press while it is
 * saving is dropped. A change someone else made first closes the dialog and
 * hands the error to the page, which shows the new version before a retry.
 */
export function ReasonDialog({
  open,
  title,
  description,
  children,
  confirmLabel,
  busyLabel = "Saving…",
  destructive = false,
  onConfirm,
  onClose,
  onStale,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  destructive?: boolean;
  /** Throws when the change was not saved. */
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
  onStale: (message: string) => void;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    if (!reason.trim()) {
      setError("Write why, for the audit log.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      setReason("");
    } catch (err) {
      if (isStale(err)) onStale(partnerErrorText(err, "save"));
      else setError(partnerErrorText(err, "save"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (next || busy) return;
        setError(null);
        onClose();
      }}
    >
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <Field data-invalid={error && !reason.trim() ? true : undefined}>
          <FieldLabel htmlFor={id}>Why</FieldLabel>
          <Textarea
            id={id}
            rows={3}
            maxLength={REASON_MAX}
            value={reason}
            disabled={busy}
            aria-describedby={`${id}-help`}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
          />
          <FieldDescription id={`${id}-help`}>
            Kept in the audit log with this change. The organization does not see it.
          </FieldDescription>
        </Field>
        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "primary"}
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void confirm();
            }}
          >
            {busy ? busyLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
