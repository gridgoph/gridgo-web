"use client";

import { useState } from "react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, updateSettings } from "@/lib/api/client";
import type { PlatformSettings } from "@/lib/api/types";
import {
  formatThreshold,
  parseTrackingSeconds,
  REFRESH_SECONDS,
  RIDER_APP_PING_SECONDS,
  STALE_SECONDS,
} from "@/lib/rider-tracking";

type Props = {
  settings: PlatformSettings;
  canEdit: boolean;
  onSaved: (next: PlatformSettings) => void;
  onConflict: () => Promise<void> | void;
  disabled?: boolean;
};

const FIELD_COPY = {
  riderLocationRefreshIntervalSeconds: "map refresh",
  riderLocationStaleAfterSeconds: "stale after",
} as const;

/**
 * Rider tracking (gridgo-api#229): how often the client's map and this
 * portal's rider views re-read a rider's position, and how old the last fix
 * may get before the rider is flagged stale. Its own save, through the
 * settings version handshake, with an audit line naming both values.
 */
export function RiderTrackingSettings({
  settings,
  canEdit,
  onSaved,
  onConflict,
  disabled,
}: Props) {
  const storedRefresh = settings.riderLocationRefreshIntervalSeconds;
  const storedStale = settings.riderLocationStaleAfterSeconds;
  // Untouched fields follow refreshed settings; typed text stays a draft.
  const [refreshDraft, setRefreshDraft] = useState<string | null>(null);
  const [staleDraft, setStaleDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const refreshText = refreshDraft ?? String(storedRefresh ?? "");
  const staleText = staleDraft ?? String(storedStale ?? "");
  const refresh = parseTrackingSeconds(refreshText, REFRESH_SECONDS);
  const stale = parseTrackingSeconds(staleText, STALE_SECONDS);
  const dirty =
    storedRefresh !== undefined &&
    storedStale !== undefined &&
    (refreshText !== String(storedRefresh) || staleText !== String(storedStale));
  const locked = busy || Boolean(disabled);

  function discard() {
    setRefreshDraft(null);
    setStaleDraft(null);
    setError(null);
    setOk(null);
  }

  async function save() {
    if (!canEdit || locked || !dirty || refresh === null || stale === null) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const changes: string[] = [];
      if (refresh !== storedRefresh) changes.push(`map refresh ${storedRefresh} s to ${refresh} s`);
      if (stale !== storedStale) changes.push(`stale after ${storedStale} s to ${stale} s`);
      const saved = await updateSettings({
        expectedVersion: settings.version,
        riderLocationRefreshIntervalSeconds: refresh,
        riderLocationStaleAfterSeconds: stale,
        reason: `Rider tracking: ${changes.join("; ")}`,
      });
      onSaved(saved);
      setRefreshDraft(null);
      setStaleDraft(null);
      setOk(
        `Saved. Maps refresh every ${saved.riderLocationRefreshIntervalSeconds ?? refresh} seconds and a rider is flagged after ${formatThreshold(saved.riderLocationStaleAfterSeconds ?? stale)} without a location, starting with trips already under way.`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === "settings_version_conflict") {
        setError(
          "Someone else saved settings a moment ago. Their values are now shown as in force. Check your changes against them, then save again.",
        );
        await onConflict();
      } else if (err instanceof ApiError && err.code === "invalid_rider_tracking_setting") {
        const field = err.detail("field");
        const which =
          typeof field === "string" && field in FIELD_COPY
            ? FIELD_COPY[field as keyof typeof FIELD_COPY]
            : "tracking";
        setError(`The API refused the ${which} value. Use a whole number inside the range shown.`);
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Only Super Admin can change rider tracking.");
      } else {
        setError(opsErrorMessage(err, "Could not save rider tracking. Try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gg-card p-3" aria-labelledby="rider-tracking-heading">
      <h2 id="rider-tracking-heading" className="text-h3 text-text-primary m-0">
        Rider tracking
      </h2>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
        Clients see their rider on a map from pick-up until delivery. When the rider&rsquo;s
        phone stops sending its location, the client is told it is temporarily
        unavailable and Operations sees the rider flagged, so someone can call.
      </p>

      {storedRefresh === undefined || storedStale === undefined ? (
        <p
          className="text-body text-text-secondary m-0 mt-3 max-w-prose"
          data-testid="rider-tracking-unavailable"
        >
          The API behind this portal does not hold these settings yet. They appear here
          once it is updated.
        </p>
      ) : (
        <>
          <FieldGroup className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field data-invalid={refresh === null || undefined}>
              <FieldLabel htmlFor="rider-tracking-refresh">Map refresh (seconds)</FieldLabel>
              <Input
                id="rider-tracking-refresh"
                inputMode="numeric"
                className="max-w-40"
                value={refreshText}
                disabled={!canEdit || locked}
                aria-invalid={refresh === null || undefined}
                aria-describedby="rider-tracking-refresh-help"
                onChange={(event) => {
                  setRefreshDraft(event.target.value);
                  setOk(null);
                }}
              />
              <FieldDescription id="rider-tracking-refresh-help">
                {refresh === null
                  ? `A whole number from ${REFRESH_SECONDS.min} to ${REFRESH_SECONDS.max}.`
                  : `How often the client's map and these screens read the rider's position again. ${REFRESH_SECONDS.min} to ${REFRESH_SECONDS.max}; in force: ${storedRefresh}.`}
              </FieldDescription>
            </Field>
            <Field data-invalid={stale === null || undefined}>
              <FieldLabel htmlFor="rider-tracking-stale">Stale after (seconds)</FieldLabel>
              <Input
                id="rider-tracking-stale"
                inputMode="numeric"
                className="max-w-40"
                value={staleText}
                disabled={!canEdit || locked}
                aria-invalid={stale === null || undefined}
                aria-describedby="rider-tracking-stale-help"
                onChange={(event) => {
                  setStaleDraft(event.target.value);
                  setOk(null);
                }}
              />
              <FieldDescription id="rider-tracking-stale-help">
                {stale === null
                  ? `A whole number from ${STALE_SECONDS.min} to ${STALE_SECONDS.max}.`
                  : `No location for this long and the rider is flagged. ${STALE_SECONDS.min} to ${STALE_SECONDS.max}; in force: ${storedStale}${storedStale % 60 === 0 ? ` (${formatThreshold(storedStale)})` : ""}.`}
              </FieldDescription>
            </Field>
          </FieldGroup>
          <p className="text-caption text-text-muted m-0 mt-3 max-w-prose">
            A faster refresh does not make a phone send more often: the rider app sends a
            location about every {RIDER_APP_PING_SECONDS} seconds. Keep &ldquo;stale
            after&rdquo; well above that, so a single missed update does not flag a rider.
            Changes apply to trips already under way.
          </p>
          {canEdit ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={locked || !dirty || refresh === null || stale === null}
                onClick={() => void save()}
              >
                {busy ? "Saving…" : "Save rider tracking"}
              </Button>
              <Button variant="ghost" disabled={locked || !dirty} onClick={discard}>
                Discard
              </Button>
            </div>
          ) : (
            <p className="text-caption text-text-muted m-0 mt-3">
              Only Super Admin changes these.
            </p>
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
