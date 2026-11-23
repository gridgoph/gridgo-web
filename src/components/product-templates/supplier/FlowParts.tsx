"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSupplierDesktop } from "@/lib/useSupplierDesktop";

/* eslint-disable @next/next/no-img-element -- stock photos are public redirects, not Next images */

export const TEMPLATE_STEPS = ["What you make", "Prices", "Ready time"] as const;

/** "Step 2 of 3": three bars, the current one in the rail's yellow, done ones in ink. */
export function StepTrack({ step }: { step: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={3}
        aria-valuenow={step + 1}
        aria-label={`Step ${step + 1} of 3, ${TEMPLATE_STEPS[step]}`}
        className="flex gap-1.5"
      >
        {TEMPLATE_STEPS.map((name, index) => (
          <span
            key={name}
            className={cn(
              "h-1.5 flex-1 rounded-pill",
              index === step
                ? "bg-[var(--color-action-yellow)]"
                : index < step
                  ? "bg-foreground"
                  : "bg-outline",
            )}
          />
        ))}
      </div>
      <p className="text-caption text-text-muted m-0">
        Step {step + 1} of 3: {TEMPLATE_STEPS[step]}
      </p>
    </div>
  );
}

/** A stock or own photo in a small square, or a quiet empty square. */
export function ProductThumb({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "bg-surface-variant flex shrink-0 items-center justify-center overflow-hidden rounded-field",
        className ?? "size-14",
      )}
    >
      {src ? (
        <img src={src} alt={alt} className="size-full object-cover" />
      ) : (
        <span className="text-caption text-text-muted">Photo</span>
      )}
    </span>
  );
}

/**
 * "Clients see": the product as a client meets it, filling in as the shop
 * works (photo and name once ticked, the lowest price once typed, the ready
 * time once picked). Unanswered lines say what will go there, so the card
 * never jumps in height.
 */
export function ClientSees({
  name,
  photoUrl,
  photoAlt,
  priceLine,
  readyLine,
  realPhoto = false,
  compact = false,
}: {
  name: string | null;
  photoUrl: string | null;
  photoAlt?: string;
  priceLine: string | null;
  readyLine: string | null;
  realPhoto?: boolean;
  compact?: boolean;
}) {
  return (
    <section
      aria-label="Clients see"
      data-testid="client-sees"
      className={cn(
        "flex flex-col gap-2",
        compact ? "" : "rounded-card border border-outline bg-surface p-3",
      )}
    >
      {compact ? null : <p className="text-caption text-text-muted m-0">Clients see</p>}
      <div className="flex items-center gap-3">
        <ProductThumb
          src={photoUrl}
          alt={photoAlt ?? name ?? "Product photo"}
          className={compact ? "size-11" : "size-16"}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {compact ? <span className="text-caption text-text-muted">Clients see</span> : null}
          <span
            className="text-body text-text-primary truncate"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {name ?? "Tick a product"}
          </span>
          <span
            className={cn(
              "text-caption truncate",
              priceLine ? "text-text-secondary" : "text-text-muted",
            )}
          >
            {priceLine ?? "Price shows here"}
            {compact && readyLine ? `, ${readyLine.toLowerCase()}` : ""}
          </span>
          {compact ? null : (
            <span
              className={cn(
                "text-caption truncate",
                readyLine ? "text-text-secondary" : "text-text-muted",
              )}
            >
              {readyLine ?? "Ready time shows here"}
            </span>
          )}
        </div>
      </div>
      {photoUrl && !compact ? (
        <p className="text-caption text-text-muted m-0">
          {realPhoto ? "Real photo" : "GRIDGO photo. Add your own after saving."}
        </p>
      ) : null}
    </section>
  );
}

/** The step's one yellow action, with its Bisaya line under the English. */
export function FlowAction({
  label,
  hint,
  onClick,
  disabled = false,
  busy = false,
  busyLabel,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
}) {
  return (
    <Button
      variant="primary"
      fullWidth
      className="h-auto min-h-12 flex-col gap-0 py-1.5"
      disabled={disabled || busy}
      onClick={onClick}
      aria-label={busy ? busyLabel : label}
    >
      <span>{busy ? (busyLabel ?? label) : label}</span>
      {hint && !busy ? (
        <span aria-hidden className="text-caption opacity-80">
          {hint}
        </span>
      ) : null}
    </Button>
  );
}

/** The sentence that says what to fix while the action cannot run. */
export function FootNote({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="text-caption text-text-primary m-0" role="status" data-testid="flow-foot-note">
      {text}
    </p>
  );
}

/**
 * Page frame for the three steps and the product page: content on the left;
 * from 1280px "Clients see" and the action sit in a sticky side card, below it
 * they ride a sticky bar at the foot so the action stays under the thumb.
 */
export function FlowLayout({
  header,
  children,
  clientSees,
  footNote,
  action,
}: {
  header: ReactNode;
  children: ReactNode;
  clientSees: (compact: boolean) => ReactNode;
  footNote?: string | null;
  action: ReactNode;
}) {
  const desktop = useSupplierDesktop();
  if (desktop) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_21rem] items-start gap-6" data-layout="desktop">
        <div className="flex min-w-0 flex-col gap-4">
          {header}
          {children}
        </div>
        <aside className="sticky top-[4.25rem] flex flex-col gap-3">
          {clientSees(false)}
          <FootNote text={footNote ?? null} />
          {action}
        </aside>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4" data-layout="phone">
      {header}
      {children}
      <div className="border-outline bg-background sticky bottom-0 z-10 -mx-3 flex flex-col gap-2 border-t px-3 pt-2 pb-3 md:-mx-4 md:px-4">
        {clientSees(true)}
        <FootNote text={footNote ?? null} />
        {action}
      </div>
    </div>
  );
}

/** Title and line under it, for every flow page. */
export function FlowHeading({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {children}
      <h1 className="text-h2 text-text-primary m-0">{title}</h1>
      {subtitle ? <p className="text-body text-text-secondary m-0 max-w-2xl">{subtitle}</p> : null}
    </div>
  );
}
