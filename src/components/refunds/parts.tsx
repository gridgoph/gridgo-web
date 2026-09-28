"use client";

/**
 * Small pieces the refund case, its dialogs and the payout desk share: the
 * client's receiving plate, the settlement written out as arithmetic, and the
 * wallet-screenshot picker.
 */

import { useEffect, useState } from "react";

import { PAYOUT_PROVIDER_LABELS, PayoutQrPlate } from "@/components/orders/PayoutDestination";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import type { RefundAmounts, RefundDestination } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import { refundComponentLines, settlementLedger } from "@/lib/refunds";
import { cn } from "@/lib/utils";

export function refundProviderLabel(provider: string): string {
  return PAYOUT_PROVIDER_LABELS[provider] ?? provider;
}

/**
 * The client's own receiving account, drawn like a shop's plate: on white in
 * both themes, because a wallet camera reads dark on light. The revision is
 * shown because a payment reserves one revision, and a replaced QR must be
 * verified again before anyone pays.
 */
export function RefundDestinationView({
  destination,
  compact = false,
}: {
  destination: RefundDestination;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex gap-3", compact ? "flex-row items-start" : "flex-col")}>
      <div className={compact ? "w-28 shrink-0" : "w-full max-w-[280px]"}>
        <PayoutQrPlate
          fileId={destination.qrFileId}
          alt={`The client's receiving QR, revision ${destination.revision}`}
          scanHint={`Hold your phone up to the screen. The wallet should name ${destination.accountName}.`}
        />
      </div>
      <dl className="m-0 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] content-start gap-x-3 gap-y-1">
        <dt className="text-caption text-text-muted">Account name</dt>
        <dd
          className="m-0 text-body text-text-primary break-words"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          {destination.accountName}
        </dd>
        <dt className="text-caption text-text-muted">Receives through</dt>
        <dd className="m-0 text-body text-text-primary">
          {refundProviderLabel(destination.provider)}
        </dd>
        <dt className="text-caption text-text-muted">QR revision</dt>
        <dd className="m-0 text-body text-text-secondary tabular-nums">
          {destination.revision}
        </dd>
        <dt className="text-caption text-text-muted">Ownership</dt>
        <dd className="m-0 text-body text-text-secondary">
          {destination.ownershipConfirmed
            ? "The client says this account is theirs"
            : "Not confirmed by the client"}
        </dd>
      </dl>
    </div>
  );
}

/**
 * The settlement as a statement anyone can check: money in, what is already
 * spoken for, and what goes back. The lines are the server's figures; the
 * layout only puts them in the order a person adds them up.
 */
export function SettlementLedger({
  amounts,
  caption,
}: {
  amounts: RefundAmounts;
  caption?: string;
}) {
  const lines = settlementLedger(amounts);
  const components = refundComponentLines(amounts);
  return (
    <div className="rounded-card border border-outline bg-surface">
      <dl className="m-0 flex flex-col px-4 py-3">
        {lines.map((line) => (
          <div
            key={line.label}
            className={cn(
              "grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-baseline gap-x-2 py-1",
              line.sign === "total" && "mt-2 border-t-2 border-text-primary pt-2.5",
            )}
          >
            <span className="text-body text-text-muted tabular-nums" aria-hidden>
              {line.sign === "minus" ? "−" : line.sign === "total" ? "=" : ""}
            </span>
            <dt className="min-w-0">
              <span
                className={`text-body ${
                  line.sign === "total" ? "text-text-primary" : "text-text-secondary"
                }`}
                style={
                  line.sign === "total" ? { fontFamily: "var(--font-medium)" } : undefined
                }
              >
                {line.label}
              </span>
              {line.note ? (
                <span className="text-caption text-text-muted block">{line.note}</span>
              ) : null}
            </dt>
            <dd
              className={`m-0 text-right tabular-nums text-text-primary ${
                line.sign === "total" ? "text-h3" : "text-body"
              }`}
              style={line.sign === "total" ? { fontFamily: "var(--font-bold)" } : undefined}
            >
              <span className="sr-only">{line.sign === "minus" ? "less " : ""}</span>
              {formatPhp(line.minor)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-outline-subtle px-4 py-2.5">
        <p className="text-caption text-text-muted m-0 mb-1">
          {caption ?? "What the refund is made of"}
        </p>
        <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0">
          {components.map((part) => (
            <li key={part.label} className="text-caption text-text-secondary">
              {part.label}{" "}
              <span className="text-text-primary tabular-nums">{formatPhp(part.minor)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const SCREENSHOT_MAX_BYTES = 15 * 1024 * 1024;

/**
 * A wallet screenshot, previewed before any upload so the person can see they
 * picked the confirmation screen and not the QR again.
 */
export function ScreenshotField({
  id,
  label,
  description,
  file,
  onFile,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  file: File | null;
  onFile: (file: File | null) => void;
  disabled?: boolean;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(next: File | undefined) {
    setProblem(null);
    if (!next) return;
    if (!/^image\/(jpeg|png|webp)$/.test(next.type)) {
      setProblem("Use a JPEG, PNG or WebP screenshot from the wallet app.");
      return;
    }
    if (next.size > SCREENSHOT_MAX_BYTES) {
      setProblem("That screenshot is over 15 MB. A plain phone screenshot is enough.");
      return;
    }
    onFile(next);
  }

  return (
    <Field data-invalid={problem ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        aria-invalid={problem ? true : undefined}
        className="text-caption text-text-secondary file:mr-3 file:min-h-11 file:rounded-field file:border file:border-outline file:bg-surface file:px-3 file:py-1.5 file:text-caption file:text-text-primary"
        onChange={(event) => {
          const next = event.target.files?.[0];
          event.target.value = "";
          pick(next);
        }}
      />
      {preview && file ? (
        <div className="flex items-start gap-3">
          <div className="w-28 shrink-0 overflow-hidden rounded-card border border-outline bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={`${label}: ${file.name}`} className="block h-auto w-full" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-body text-text-primary m-0 truncate">{file.name}</p>
            <button
              type="button"
              className="text-caption text-text-secondary mt-1 min-h-11 underline-offset-2 hover:underline"
              disabled={disabled}
              onClick={() => onFile(null)}
            >
              Remove this screenshot
            </button>
          </div>
        </div>
      ) : null}
      <FieldDescription>
        {problem ? <span className="text-error">{problem}</span> : description}
      </FieldDescription>
    </Field>
  );
}
