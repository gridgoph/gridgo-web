"use client";

import { useState } from "react";
import Link from "next/link";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, updateSettings } from "@/lib/api/client";
import type { PlatformSettings } from "@/lib/api/types";
import { parseHoldDays, SAMPLE_HOLD_DAYS } from "@/lib/sample-first";

type Props = {
  settings: PlatformSettings;
  canEdit: boolean;
  onSaved: (next: PlatformSettings) => void;
  onConflict: () => Promise<void> | void;
  disabled?: boolean;
  /** Read-only: where someone who may change it does so. */
  editHref?: string;
};

const medium = { fontFamily: "var(--font-medium)" } as const;

const daysWord = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;

/**
 * Sample batch hold (gridgo-api#222, SAMPLE_FIRST_API.md): how long the batch
 * price is held after a sample reaches the client. Its own save through the
 * settings version handshake, with an audit line naming both values. Super
 * Admin only; Operations reads it on the Sample batches page.
 */
export function SampleBatchHoldSettings({
  settings,
  canEdit,
  onSaved,
  onConflict,
  disabled,
  editHref,
}: Props) {
  const stored = settings.sampleBatchHoldDays;
  // Untouched, the field follows refreshed settings; typed text stays a draft.
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const text = draft ?? (stored === undefined ? "" : String(stored));
  const days = parseHoldDays(text);
  const invalid = days === null;
  const dirty = stored !== undefined && days !== stored;
  const locked = busy || Boolean(disabled);

  async function save() {
    if (!canEdit || locked || !dirty || days === null || stored === undefined) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const saved = await updateSettings({
        expectedVersion: settings.version,
        sampleBatchHoldDays: days,
        reason: `Sample batch hold: ${daysWord(stored)} to ${daysWord(days)}`,
      });
      onSaved(saved);
      setDraft(null);
      setOk(
        `Saved. Samples ordered from now on hold their batch price for ${daysWord(saved.sampleBatchHoldDays ?? days)}. Holds already running keep their dates.`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === "settings_version_conflict") {
        setError(
          "Someone else saved settings a moment ago. Their value is now shown as in force. Check your change against it, then save again.",
        );
        await onConflict();
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Only Super Admin can change the sample batch hold.");
      } else if (err instanceof ApiError && err.code === "invalid_sample_batch_hold_days") {
        setError(
          `The hold is whole days, ${SAMPLE_HOLD_DAYS.min} to ${SAMPLE_HOLD_DAYS.max}.`,
        );
      } else {
        setError(opsErrorMessage(err, "Could not save the sample batch hold. Try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gg-card p-3" aria-labelledby="sample-hold-heading">
      <h2 id="sample-hold-heading" className="text-h3 text-text-primary m-0">
        Sample batch hold
      </h2>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
        After a client approves a sample, they can order the full batch at the shop&rsquo;s
        price from when they ordered the sample, for this many days after it is delivered.
      </p>

      {stored === undefined ? (
        <p
          className="text-body text-text-secondary m-0 mt-3 max-w-prose"
          data-testid="sample-hold-unavailable"
        >
          The API behind this portal does not hold this setting yet. It appears here once it
          is updated.
        </p>
      ) : (
        <>
          <FieldGroup className="mt-4">
            <Field data-invalid={invalid || undefined}>
              <FieldLabel htmlFor="sample-hold-days">Hold the batch price for</FieldLabel>
              <div className="relative max-w-40">
                <Input
                  id="sample-hold-days"
                  inputMode="numeric"
                  className="pr-14"
                  value={text}
                  disabled={!canEdit || locked}
                  aria-invalid={invalid || undefined}
                  aria-describedby="sample-hold-help"
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setError(null);
                    setOk(null);
                  }}
                />
                <span
                  aria-hidden
                  className="text-body text-text-muted pointer-events-none absolute inset-y-0 right-3 flex items-center"
                >
                  days
                </span>
              </div>
              <FieldDescription id="sample-hold-help">
                Whole days, {SAMPLE_HOLD_DAYS.min} to {SAMPLE_HOLD_DAYS.max}. GRIDGO
                starts at {SAMPLE_HOLD_DAYS.default}.
              </FieldDescription>
            </Field>
            <p className="text-body text-text-secondary m-0" data-testid="sample-hold-in-force">
              In force right now:{" "}
              <span className="text-text-primary tabular-nums" style={medium}>
                {daysWord(stored)}
              </span>
              {dirty && days !== null ? (
                <>
                  {" "}
                  &middot; after saving:{" "}
                  <span className="text-text-primary tabular-nums" style={medium}>
                    {daysWord(days)}
                  </span>
                </>
              ) : null}
            </p>
          </FieldGroup>
          <p className="text-caption text-text-muted m-0 mt-3 max-w-prose">
            Applies to samples ordered from now on. Holds already running keep their
            dates.
          </p>
          {canEdit ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={locked || !dirty || invalid}
                onClick={() => void save()}
              >
                {busy ? "Saving…" : "Save sample batch hold"}
              </Button>
              <Button
                variant="ghost"
                disabled={locked || draft === null}
                onClick={() => {
                  setDraft(null);
                  setError(null);
                  setOk(null);
                }}
              >
                Discard
              </Button>
            </div>
          ) : editHref ? (
            <p className="text-caption text-text-muted m-0 mt-3">
              <Link href={editHref} className="text-text-primary underline underline-offset-2">
                Change it in Operational settings
              </Link>
            </p>
          ) : (
            <p className="text-caption text-text-muted m-0 mt-3">Only Super Admin changes this.</p>
          )}
        </>
      )}
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
    </section>
  );
}
