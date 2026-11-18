"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

import { ErrorLine } from "@/components/cash/parts";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { listCashEvidence, type CashEvidenceFile } from "@/lib/api/cash";
import { formatDateTime } from "@/lib/format";
import { opsErrorMessage } from "@/app/ops/_lib/errors";

/** Read the list again this long before its preview links expire. */
const REFRESH_EARLY_MS = 30_000;
const REFRESH_FLOOR_MS = 5_000;

const UNAVAILABLE_COPY: Record<NonNullable<CashEvidenceFile["error"]>, string> = {
  storage_object_missing:
    "The picture is missing from storage. Ask the rider to upload it again.",
  storage_object_mismatch:
    "The stored picture does not match its record. Ask the rider to upload it again.",
  minio_unavailable: "File storage is unavailable right now. Check again in a moment.",
};

/** The rider's unused photos of one kind that a cash action can take. */
export function riderCandidates(
  files: CashEvidenceFile[],
  purpose: CashEvidenceFile["purpose"],
): CashEvidenceFile[] {
  return files.filter((file) => file.purpose === purpose && !file.used);
}

/**
 * Pick the rider's own photo for a cash action, with previews, instead of
 * typing a file ID (gridgo-api#401). The API decides which files qualify: the
 * related rider's unused uploads of this purpose, made after they took the
 * order. Preview links are signed for a few minutes, so the list is read again
 * before they expire and never stored.
 */
export function EvidencePicker({
  id,
  orderId,
  purpose,
  rider,
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  id: string;
  orderId: string;
  purpose: "cash_shop_return" | "cash_incident_photo";
  /** The rider's name, for the copy. */
  rider: string;
  label: string;
  description: string;
  value: string | null;
  onChange: (fileId: string | null) => void;
  disabled?: boolean;
}) {
  const [files, setFiles] = useState<CashEvidenceFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const generation = useRef(0);
  const selected = useRef(value);
  selected.current = value;
  const change = useRef(onChange);
  change.current = onChange;

  const load = useCallback(async () => {
    const mine = ++generation.current;
    setChecking(true);
    setError(null);
    try {
      const next = riderCandidates(await listCashEvidence(orderId), purpose);
      if (mine !== generation.current) return;
      setFiles(next);
      // A choice that is gone (used elsewhere, deleted, unreadable) is cleared.
      const still = next.find((file) => file.fileId === selected.current);
      if (selected.current && (!still || still.unavailable)) change.current(null);
    } catch (err) {
      if (mine === generation.current) {
        setError(opsErrorMessage(err, "Could not read the rider's photos. Try again."));
      }
    } finally {
      if (mine === generation.current) setChecking(false);
    }
  }, [orderId, purpose]);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  // Signed previews expire: read the list again shortly before the first does.
  useEffect(() => {
    const expiries = (files ?? [])
      .map((file) => (file.expiresAt ? Date.parse(file.expiresAt) : NaN))
      .filter(Number.isFinite);
    if (!expiries.length) return;
    const wait = Math.max(
      Math.min(...expiries) - Date.now() - REFRESH_EARLY_MS,
      REFRESH_FLOOR_MS,
    );
    const timer = window.setTimeout(() => void load(), wait);
    return () => window.clearTimeout(timer);
  }, [files, load]);

  const labelId = `${id}-label`;
  const checkAgain = (
    <Button variant="outline" disabled={checking || disabled} onClick={() => void load()}>
      <RefreshCw aria-hidden data-icon="inline-start" />
      {checking ? "Checking…" : "Check again"}
    </Button>
  );

  return (
    <Field>
      <FieldLabel id={labelId}>{label}</FieldLabel>
      <FieldDescription>{description}</FieldDescription>
      {files === null && !error ? (
        <p className="text-body text-text-secondary m-0" role="status">
          Looking for {rider}&rsquo;s photos…
        </p>
      ) : null}
      {error ? (
        <div className="flex flex-col items-start gap-2">
          <ErrorLine error={error} />
          {checkAgain}
        </div>
      ) : null}
      {files && !error ? (
        files.length ? (
          <>
            <RadioGroup
              aria-labelledby={labelId}
              value={value ?? ""}
              onValueChange={(next) => onChange((next as string) || null)}
              disabled={disabled}
              className="flex flex-col gap-2"
            >
              {files.map((file) => {
                const when = formatDateTime(file.uploadedAt);
                return (
                  <label
                    key={file.fileId}
                    data-testid="evidence-option"
                    className="flex min-h-11 items-center gap-3 rounded-xl border border-outline p-2 has-[[data-checked]]:border-foreground"
                  >
                    <RadioGroupItem
                      value={file.fileId}
                      disabled={file.unavailable}
                      aria-label={`${rider}'s photo uploaded ${when}`}
                    />
                    {file.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived link
                      <img
                        src={file.previewUrl}
                        alt={`${rider}'s photo uploaded ${when}`}
                        className="size-20 shrink-0 rounded-lg border border-outline bg-white object-cover"
                      />
                    ) : (
                      <span className="flex size-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-outline p-1 text-center text-caption text-text-secondary">
                        No preview
                      </span>
                    )}
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="text-body text-text-primary">Uploaded {when}</span>
                      {file.unavailable ? (
                        <span className="text-caption text-error">
                          {UNAVAILABLE_COPY[file.error ?? "minio_unavailable"]}
                        </span>
                      ) : file.previewUrl ? (
                        <a
                          href={file.previewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-11 items-center gap-1 text-caption text-text-primary underline underline-offset-4"
                        >
                          Open full size
                          <ExternalLink aria-hidden size={14} />
                        </a>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </RadioGroup>
            <p className="text-caption text-text-secondary m-0">
              A photo {rider} took for another of their orders can also show here. Pick
              the one that shows this order.
            </p>
            {checkAgain}
          </>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <p className="text-body text-text-primary m-0">
              No photo from {rider} yet. Ask them to upload it in the rider app, then
              check again.
            </p>
            {checkAgain}
          </div>
        )
      ) : null}
    </Field>
  );
}
