"use client";

/**
 * Super Admin deleting one order file before its retention period ends
 * (contract "DELETE /files/:fileId" in gridgo-api/docs/STORAGE_API.md).
 *
 * Three things before the button works: the person sees exactly which file
 * goes (picture, name, type, size, upload date, the orders that use it),
 * writes why (kept in the audit log with their name), and ticks that it cannot
 * be undone. The API still decides: an open issue, claim, refund, dispute or
 * pickup escalation refuses it (`409 file_retention_hold`) and the dialog says
 * so in place.
 */

import { useEffect, useId, useState } from "react";
import { FileText, Trash2 } from "lucide-react";

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
import { useFileDeletionAccess } from "@/components/files/FileDeletionAccess";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { deleteFileEarly, getFile } from "@/lib/api/client";
import type { StoredFile } from "@/lib/api/types";
import { fileLooksLikeImage, formatFileBytes } from "@/lib/evidence";
import {
  EARLY_DELETE_REASON_MAX,
  earlyDeleteErrorMessage,
  earlyDeleteReasonError,
  fileOrderReferences,
  filePurposeLabel,
} from "@/lib/file-retention";
import { formatDateTime } from "@/lib/format";

export function EarlyDeleteFileDialog({
  open,
  file,
  label,
  previewUrl,
  onCancel,
  onDeleted,
}: {
  open: boolean;
  file: StoredFile;
  /** What the page calls this file ("Artwork 2", "Payment screenshot"). */
  label: string;
  previewUrl: string | null;
  onCancel: () => void;
  /** The API's answer: `deleted`, or `delete_pending` when a case opened meanwhile. */
  onDeleted: (file: StoredFile) => void;
}) {
  const reasonId = useId();
  const ackId = useId();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setTouched(false);
    setUnderstood(false);
    setError(null);
  }, [open]);

  const reasonError = earlyDeleteReasonError(reason);
  const showReasonError = touched && reasonError;
  const ready = !reasonError && understood && !busy;
  const orders = fileOrderReferences(file);
  const isImage = fileLooksLikeImage(file);

  async function confirm() {
    setTouched(true);
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteFileEarly(file.fileId, reason.trim());
      onDeleted(result);
    } catch (err) {
      setError(earlyDeleteErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this file permanently?</AlertDialogTitle>
          <AlertDialogDescription>
            The file is removed from GRIDGO storage for everyone, now, before its retention
            period ends. It cannot be recovered.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <section
          aria-label="The file that will be deleted"
          className="border-error/50 flex min-w-0 gap-3 rounded-field border border-dashed p-3"
        >
          <div className="bg-surface-variant flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md">
            {isImage && previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="size-full object-cover" />
            ) : (
              <FileText size={24} strokeWidth={1.75} aria-hidden className="text-text-muted" />
            )}
          </div>
          <dl className="m-0 grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
            <dt className="text-caption text-text-muted">File</dt>
            <dd className="text-body text-text-primary m-0 break-words">
              {file.originalFilename || label}
            </dd>
            <dt className="text-caption text-text-muted">Type</dt>
            <dd className="text-body text-text-secondary m-0">
              {label === filePurposeLabel(file.purpose)
                ? label
                : `${label}, ${filePurposeLabel(file.purpose).toLowerCase()}`}
            </dd>
            <dt className="text-caption text-text-muted">Size</dt>
            <dd className="text-body text-text-secondary m-0 tabular-nums">
              {formatFileBytes(file.size)}
            </dd>
            <dt className="text-caption text-text-muted">Uploaded</dt>
            <dd className="text-body text-text-secondary m-0">
              {formatDateTime(file.readyAt || file.createdAt)}
            </dd>
            {orders.length ? (
              <>
                <dt className="text-caption text-text-muted">Used by</dt>
                <dd className="text-body text-text-secondary m-0 break-all">
                  {orders.length === 1 ? `Order ${orders[0]}` : `${orders.length} orders: ${orders.join(", ")}`}
                </dd>
              </>
            ) : null}
          </dl>
        </section>

        <p className="text-caption text-text-secondary m-0">
          The order keeps its record and says this file was deleted, by whom and why. Links
          already opened may keep working for a few minutes.
        </p>

        <FieldGroup>
          <Field data-invalid={showReasonError ? true : undefined}>
            <FieldLabel htmlFor={reasonId}>Why it is being deleted</FieldLabel>
            <Textarea
              id={reasonId}
              rows={3}
              maxLength={EARLY_DELETE_REASON_MAX}
              value={reason}
              disabled={busy}
              aria-invalid={showReasonError ? true : undefined}
              placeholder="e.g. The client sent the wrong file and asked for this copy to be removed."
              onChange={(event) => setReason(event.target.value)}
              onBlur={() => setTouched(true)}
            />
            {showReasonError ? (
              <FieldError>{reasonError}</FieldError>
            ) : (
              <FieldDescription>Kept in the audit log with your name.</FieldDescription>
            )}
          </Field>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5" htmlFor={ackId}>
            <Checkbox
              id={ackId}
              className="mt-1"
              checked={understood}
              disabled={busy}
              onCheckedChange={(value) => setUnderstood(value === true)}
            />
            <span className="text-body text-text-primary">
              I understand this cannot be undone and the file cannot be recovered.
            </span>
          </label>
        </FieldGroup>

        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            Keep the file
          </AlertDialogCancel>
          <AlertDialogAction variant="danger" disabled={!ready} onClick={() => void confirm()}>
            {busy ? "Deleting…" : "Delete permanently"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The quiet "Delete early…" control under an order file, for Super Admin
 * only: it renders nothing unless this tree grants `deleteEarly`. Plates that
 * already hold the file's metadata pass `file`; a gallery tile passes only
 * `fileId` and the metadata is read on the click.
 */
export function EarlyDeleteFileButton({
  fileId,
  file: known,
  label,
  previewUrl,
  onDeleted,
  tone = "surface",
}: {
  fileId: string;
  file?: StoredFile | null;
  label: string;
  previewUrl: string | null;
  onDeleted: (file: StoredFile) => void;
  /** `dark` sits on the black photo frame of a gallery tile. */
  tone?: "surface" | "dark";
}) {
  const { deleteEarly, noteDeleted } = useFileDeletionAccess();
  const [file, setFile] = useState<StoredFile | null>(known ?? null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (known) setFile(known);
  }, [known]);

  if (!deleteEarly) return null;

  async function start() {
    setError(null);
    if (file) {
      setOpen(true);
      return;
    }
    setLoading(true);
    try {
      setFile(await getFile(fileId));
      setOpen(true);
    } catch (err) {
      setError(earlyDeleteErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={
          tone === "dark"
            ? "text-white hover:bg-white/10 hover:text-white"
            : "text-error hover:text-error"
        }
        disabled={loading}
        onClick={() => void start()}
        aria-label={`Delete ${label} early`}
      >
        <Trash2 size={16} strokeWidth={1.75} aria-hidden />
        {loading ? "Opening…" : "Delete early…"}
      </Button>
      {error ? (
        <p className="text-caption text-error m-0" role="alert">
          {error}
        </p>
      ) : null}
      {file ? (
        <EarlyDeleteFileDialog
          open={open}
          file={file}
          label={label}
          previewUrl={previewUrl}
          onCancel={() => setOpen(false)}
          onDeleted={(result) => {
            setOpen(false);
            onDeleted(result);
            noteDeleted();
          }}
        />
      ) : null}
    </>
  );
}
