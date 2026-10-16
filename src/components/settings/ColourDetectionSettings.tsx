"use client";

/**
 * What counts as strong colour on a printed page, and the A3 monochrome limit
 * (issue report 0BE07331; contract gridgo-api docs/COLOUR_PRICING_API.md,
 * "Super Admin thresholds").
 *
 * Only Super Admin changes them (the API answers anyone else `403`). The card
 * saves on its own, the whole object at once, through the settings
 * `expectedVersion` handshake with an audited reason naming each figure that
 * moved. New figures apply to fresh cart readings only: an accepted order
 * keeps the reading and invoice it was sold on.
 *
 * Beside the figures, a row of sample inks shows which ones the draft would
 * count, on exactly the rule the estimate uses, so a change is checked
 * against black, greys, pale tints and orange before it is saved.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Minus } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, updateSettings } from "@/lib/api/client";
import type { PlatformSettings } from "@/lib/api/types";
import {
  SAMPLE_INKS,
  THRESHOLD_KEYS,
  THRESHOLD_LABELS,
  bpsPercent,
  countsAsStrong,
  readThresholdDraft,
  readThresholds,
  thresholdDraft,
  thresholdReason,
  type ColourThresholds,
  type ThresholdDraft,
} from "@/lib/colour-pricing";
import { cn } from "@/lib/utils";

const HEADING_ID = "colour-detection-heading";
const medium = { fontFamily: "var(--font-medium)" } as const;

const HINTS: Record<keyof ColourThresholds, string> = {
  minSaturationBps:
    "How far from grey a colour must be to count. Higher leaves more muted colours out.",
  minLightnessBps: "Colours darker than this read as black and do not count.",
  maxLightnessBps: "Colours lighter than this read as light colours and do not count.",
  a3MonochromeMaxBps:
    "An A3 page with strong colour on at most this share of the sheet is monochrome; above it, full colour.",
};

type Props = {
  settings: PlatformSettings;
  canEdit: boolean;
  onSaved?: (next: PlatformSettings) => void;
  onConflict?: () => Promise<void> | void;
  disabled?: boolean;
};

export function ColourDetectionSettings({ settings, canEdit, onSaved, onConflict, disabled }: Props) {
  const stored = readThresholds(settings.colourDetection);
  const [draft, setDraft] = useState<ThresholdDraft | null>(stored ? thresholdDraft(stored) : null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Newer figures from elsewhere replace the fields unless they were edited here.
  const previous = useRef(stored);
  const storedKey = JSON.stringify(stored);
  useEffect(() => {
    const before = previous.current;
    previous.current = stored;
    if (!stored) return;
    setDraft((current) =>
      !current || !before || JSON.stringify(current) === JSON.stringify(thresholdDraft(before))
        ? thresholdDraft(stored)
        : current,
    );
    // Keyed on the figures, not the object identity of each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedKey]);

  if (!stored || !draft) {
    return (
      <section className="gg-card p-3" aria-labelledby={HEADING_ID}>
        <Heading />
        <p className="text-body text-text-secondary m-0 mt-3 max-w-prose">
          The API behind this portal does not measure page colour yet. These figures appear
          once it is updated.
        </p>
      </section>
    );
  }

  const parsed = readThresholdDraft(draft);
  const preview = parsed.ok ? parsed.value : stored;
  const dirty = parsed.ok
    ? JSON.stringify(parsed.value) !== JSON.stringify(stored)
    : JSON.stringify(draft) !== JSON.stringify(thresholdDraft(stored));
  const locked = busy || Boolean(disabled);

  async function save() {
    if (!stored || !parsed.ok) return;
    setConfirming(false);
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const saved = await updateSettings({
        expectedVersion: settings.version,
        colourDetection: parsed.value,
        reason: thresholdReason(stored, parsed.value, note),
      });
      onSaved?.(saved);
      const next = readThresholds(saved.colourDetection);
      if (next) setDraft(thresholdDraft(next));
      setNote("");
      setOk(
        "Saved. New cart readings use these figures; orders already placed keep the reading they were sold on.",
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === "settings_version_conflict") {
        setError(
          "Someone else saved settings a moment ago. Their figures are now shown as in force; check yours against them and save again.",
        );
        await onConflict?.();
      } else if (err instanceof ApiError && err.code === "invalid_colour_settings") {
        setError(
          "The API refused these figures. Each is 0 to 100%, saturation above 0, and the near-black limit below the light-colour limit, which stays below 100%.",
        );
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Only Super Admin can change colour detection.");
      } else {
        setError(opsErrorMessage(err, "Could not save colour detection. Try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gg-card p-3" aria-labelledby={HEADING_ID} data-testid="colour-detection">
      <Heading />

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {THRESHOLD_KEYS.map((key) => {
          const invalid = !parsed.ok && parsed.key === key;
          const id = `colour-${key}`;
          return (
            <Field key={key} data-invalid={invalid ? true : undefined}>
              <FieldLabel htmlFor={id}>{THRESHOLD_LABELS[key]}</FieldLabel>
              {canEdit ? (
                <div className="relative max-w-36">
                  <Input
                    id={id}
                    inputMode="decimal"
                    autoComplete="off"
                    className="pr-8 tabular-nums"
                    value={draft[key]}
                    disabled={locked}
                    aria-invalid={invalid ? true : undefined}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, [key]: event.target.value } : current))
                    }
                  />
                  <span
                    aria-hidden
                    className="text-caption text-text-muted pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
                  >
                    %
                  </span>
                </div>
              ) : (
                <span id={id} className="text-body text-text-primary tabular-nums" style={medium}>
                  {bpsPercent(stored[key])}
                </span>
              )}
              <FieldDescription>
                {HINTS[key]}
                {stored[key] !== preview[key] ? ` In force now: ${bpsPercent(stored[key])}.` : ""}
              </FieldDescription>
            </Field>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <h3 className="text-body text-text-primary m-0" style={medium}>
          Which inks count as strong colour{dirty && parsed.ok ? " with your figures" : ""}
        </h3>
        <ul
          className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 lg:grid-cols-4"
          aria-label="Sample inks"
          data-testid="colour-sample-inks"
        >
          {SAMPLE_INKS.map((ink) => {
            const counts = countsAsStrong(ink.rgb, preview);
            return (
              <li
                key={ink.name}
                className={cn(
                  "flex items-center gap-2 rounded-field border p-2",
                  counts ? "border-outline" : "border-outline-subtle",
                )}
              >
                <span
                  aria-hidden
                  className="border-outline size-8 shrink-0 rounded-[6px] border"
                  // Sample print data, not a portal colour.
                  style={{ backgroundColor: `rgb(${ink.rgb.join(" ")})` }}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-body text-text-primary">{ink.name}</span>
                  <span className="text-caption text-text-secondary inline-flex items-center gap-1">
                    {counts ? (
                      <Check size={12} aria-hidden strokeWidth={3} />
                    ) : (
                      <Minus size={12} aria-hidden strokeWidth={3} />
                    )}
                    {counts ? "Counts" : "Not counted"}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-caption text-text-muted m-0 max-w-prose">
          A pixel counts when it is saturated enough and neither near-black nor light. The
          share is taken of the whole sheet, margins included. It is an estimate from the
          file, not an ink or toner measurement; the shop corrects a clearly wrong page
          with a change request.
        </p>
      </div>

      {!parsed.ok && dirty ? (
        <p className="text-body text-error m-0 mt-3" role="alert">
          {parsed.problem}
        </p>
      ) : null}
      {ok ? (
        <p className="text-body text-success m-0 mt-3" role="status">
          {ok}
        </p>
      ) : null}
      {error ? (
        <p className="text-body text-error m-0 mt-3" role="alert">
          {error}
        </p>
      ) : null}

      {canEdit ? (
        <>
          <Field className="mt-3 max-w-prose">
            <FieldLabel htmlFor="colour-detection-note">What prompted the change (optional)</FieldLabel>
            <Textarea
              id="colour-detection-note"
              rows={2}
              maxLength={1500}
              value={note}
              disabled={locked}
              placeholder="A3 limit raised after a month of real orders."
              onChange={(event) => setNote(event.target.value)}
            />
            <FieldDescription>
              The audit log records the old and new figures with this note.
            </FieldDescription>
          </Field>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={locked || !dirty || !parsed.ok}
              onClick={() => setConfirming(true)}
            >
              {busy ? "Saving…" : "Save colour detection"}
            </Button>
            <Button
              variant="ghost"
              disabled={locked || !dirty}
              onClick={() => {
                setDraft(thresholdDraft(stored));
                setNote("");
                setError(null);
                setOk(null);
              }}
            >
              Discard
            </Button>
          </div>
        </>
      ) : (
        <p className="text-caption text-text-muted m-0 mt-3">Only Super Admin changes these.</p>
      )}

      <AlertDialog open={confirming} onOpenChange={(open) => (!open ? setConfirming(false) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change how GRIDGO measures colour?</AlertDialogTitle>
            <AlertDialogDescription>
              Pages read from now on can land in a different tier and price. Orders already
              placed keep their reading and invoice. Clients with a cart open see the new
              reading when they refresh it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {parsed.ok ? (
            <p className="text-body text-text-primary m-0" data-testid="colour-detection-confirm">
              {thresholdReason(stored, parsed.value, "")}.
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep the figures in force</AlertDialogCancel>
            <AlertDialogAction onClick={() => void save()}>Save the new figures</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function Heading() {
  return (
    <>
      <h2 id={HEADING_ID} className="text-h3 text-text-primary m-0">
        Colour detection
      </h2>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
        Document and construction shops price each sheet by how much strong colour it
        carries. These figures decide what GRIDGO counts as strong: black, white, greys
        and light colours never count; saturated colours such as orange, red, green and
        bright blue do.
      </p>
    </>
  );
}
