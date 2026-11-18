"use client";

/**
 * Pieces every cash confirmation shares. The money plate is the one loud
 * element: before any cash decision the person reads who, how much and which
 * reference, set like the slip at a cash counter.
 */

import { useState } from "react";
import { ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getFileDownloadUrl, isApiError } from "@/lib/api/client";
import { CASH_REASON_MAX } from "@/lib/cash";
import { fileIsGone } from "@/lib/file-retention";
import { formatPhp } from "@/lib/format";

const medium = { fontFamily: "var(--font-medium)" } as const;
const bold = { fontFamily: "var(--font-bold)" } as const;

export type PlateLine = { label: string; value: React.ReactNode };

/**
 * Who, how much, and the lines that identify the money. The amount is the
 * largest thing in the dialog on purpose.
 */
export function MoneyPlate({
  caption,
  amountMinor,
  lines,
}: {
  caption: string;
  amountMinor: number;
  lines: PlateLine[];
}) {
  return (
    <div
      className="rounded-card border border-outline bg-surface-variant px-4 py-3"
      data-testid="money-plate"
    >
      <p className="text-caption text-text-secondary m-0">{caption}</p>
      <p
        className="m-0 text-text-primary tabular-nums leading-tight"
        style={{ ...bold, fontSize: "2rem" }}
      >
        {formatPhp(amountMinor)}
      </p>
      <dl className="m-0 mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
        {lines.map((line) => (
          <div key={line.label} className="contents">
            <dt className="text-caption text-text-secondary">{line.label}</dt>
            <dd className="m-0 text-body text-text-primary break-words" style={medium}>
              {line.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** A stored picture opened on demand (a fresh signed link each time). */
export function EvidenceButton({
  fileId,
  label,
  title,
}: {
  fileId: string | null | undefined;
  label: string;
  title: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (!fileId) {
    return <span className="text-caption text-text-secondary">No picture on file</span>;
  }

  async function open() {
    if (!fileId) return;
    setBusy(true);
    setProblem(null);
    try {
      setUrl(await getFileDownloadUrl(fileId));
    } catch (err) {
      setProblem(
        fileIsGone(err)
          ? "This picture has been deleted."
          : isApiError(err) && err.kind === "forbidden"
            ? "You cannot open this picture."
            : "The picture could not be opened. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void open()}>
        <ImageIcon aria-hidden data-icon="inline-start" />
        {busy ? "Opening…" : label}
      </Button>
      {problem ? (
        <span className="text-caption text-error" role="alert">
          {problem}
        </span>
      ) : null}
      <Dialog open={url !== null} onOpenChange={(next) => !next && setUrl(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            The stored picture, full size.
          </DialogDescription>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived link
            <img
              src={url}
              alt={title}
              className="max-h-[70vh] w-full rounded-card border border-outline bg-white object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </span>
  );
}

/** A decision reason: the API keeps up to 120 characters, upper-cased. */
export function ReasonField({
  id,
  label,
  value,
  onChange,
  disabled,
  description,
  placeholder,
  max = CASH_REASON_MAX,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  description?: string;
  placeholder?: string;
  max?: number;
}) {
  const long = max > CASH_REASON_MAX;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {long ? (
        <Textarea
          id={id}
          rows={3}
          maxLength={max}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          maxLength={max}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <FieldDescription>
        {description ? `${description} ` : ""}
        <span className="tabular-nums">
          {value.length}/{max.toLocaleString("en-PH")}
        </span>
      </FieldDescription>
    </Field>
  );
}

export function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p className="text-body text-error m-0" role="alert">
      {error}
    </p>
  ) : null;
}

/** A labelled id the person types because no screen lists it (see the PR note). */
export function FileIdField({
  id,
  label,
  value,
  onChange,
  disabled,
  description,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  description: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldDescription>{description}</FieldDescription>
    </Field>
  );
}
