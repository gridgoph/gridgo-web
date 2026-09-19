"use client";

import { useId, useState } from "react";

import { adminErrorMessage } from "@/app/admin/_lib/errors";
import {
  confirmationMatches,
  describeDeleteRefusal,
  type DangerEntryKind,
  type DeleteRefusal,
} from "@/app/admin/catalogue/_lib/danger";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Props = {
  kind: DangerEntryKind;
  name: string;
  code: string;
  /** Performs the DELETE. Throws the ApiError on refusal; the zone explains it. */
  onDelete: () => Promise<void>;
  /** Sets `active: false`. Only offered after a refusal that says it can still help. */
  onRetire: () => Promise<void>;
  disabled?: boolean;
};

/**
 * The one destructive control on a chart editor, kept at the end of the form
 * and away from Save. Delete is permanent and needs the entry's code typed
 * back; the platform refuses anything a shop, an order, or the seed still
 * stands on, and this zone then says who and offers to hide the entry instead.
 */
export function DangerZone({ kind, name, code, onDelete, onRetire, disabled }: Props) {
  const headingId = useId();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<DeleteRefusal | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [retired, setRetired] = useState(false);

  const verb = `Delete ${kind}`;
  const ready = confirmationMatches(typed, code);

  function close() {
    setOpen(false);
    setTyped("");
  }

  async function confirmDelete() {
    if (!ready || busy) return;
    setBusy(true);
    setFailure(null);
    setRefusal(null);
    try {
      await onDelete();
      close();
    } catch (err) {
      close();
      const explained = describeDeleteRefusal(err, kind);
      if (explained) setRefusal(explained);
      else setFailure(adminErrorMessage(err, `Could not delete this ${kind}.`));
    } finally {
      setBusy(false);
    }
  }

  async function retire() {
    setBusy(true);
    setFailure(null);
    try {
      await onRetire();
      setRetired(true);
    } catch (err) {
      setFailure(adminErrorMessage(err, `Could not hide this ${kind}.`));
    } finally {
      setBusy(false);
    }
  }

  const offerRetire = refusal?.canRetire && !retired;

  return (
    <section
      aria-labelledby={headingId}
      className="border-destructive/40 flex flex-col gap-3 rounded-card border p-4"
    >
      <p className="text-overline text-destructive m-0 uppercase">Danger zone</p>
      <h2 id={headingId} className="text-h3 text-text-primary m-0">
        {verb}
      </h2>
      <p className="text-body text-text-secondary m-0">
        {kind === "category"
          ? "Only an empty category can leave: no print job under it, no shop accredited here, nothing filed against it. Deleting is permanent; hiding is not."
          : "Only a print job nothing stands on can leave: no shop listing, no order, no GRIDGO starter. Deleting is permanent; hiding is not."}
      </p>

      {refusal ? (
        <div
          role="alert"
          className="border-outline bg-surface-variant flex flex-col gap-2 rounded-field border p-3"
        >
          <p className="text-body text-text-primary m-0 font-medium">{refusal.title}</p>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
            {refusal.lines.map((line) => (
              <li key={line} className="text-caption text-text-secondary">
                {line}
              </li>
            ))}
          </ul>
          {retired ? (
            <p className="text-caption text-success m-0" role="status">
              Hidden from new listings. Shops keep what they already filed.
            </p>
          ) : offerRetire ? (
            <div>
              <Button
                variant="secondary"
                disabled={busy || disabled}
                onClick={() => void retire()}
              >
                Hide from new listings
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {failure ? (
        <p className="text-caption text-error m-0" role="alert">
          {failure}
        </p>
      ) : null}

      <div>
        <Button
          variant="danger"
          disabled={busy || disabled}
          onClick={() => setOpen(true)}
        >
          {verb}…
        </Button>
      </div>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          if (next) setOpen(true);
          else close();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{name}” for good?</AlertDialogTitle>
            <AlertDialogDescription>
              It leaves the chart and the audit log keeps the record. Nothing a shop or an
              order already stands on is touched — if anything does, the platform refuses
              and says who. Type the code to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor={inputId}>
              Type <span className="font-mono">{code}</span> to confirm
            </FieldLabel>
            <Input
              id={inputId}
              value={typed}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && ready) void confirmDelete();
              }}
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              disabled={!ready || busy}
              onClick={() => void confirmDelete()}
            >
              {busy ? "Deleting…" : verb}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
