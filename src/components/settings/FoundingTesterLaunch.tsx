"use client";

import { useState } from "react";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, updateSettings } from "@/lib/api/client";
import type { PlatformSettings } from "@/lib/api/types";
import { launchDateText } from "@/lib/founding-testers";
import { formatManila, isoToManilaLocal, manilaLocalToIso } from "@/lib/vouchers";

type Props = {
  settings: PlatformSettings;
  canEdit: boolean;
  onSaved: (next: PlatformSettings) => void;
  onConflict: () => Promise<void> | void;
  disabled?: boolean;
};

/**
 * The Founding Tester launch date (gridgo-api#293; contract "Founding Tester
 * missions" in gridgo-api docs/VOUCHERS_API.md). Only client accounts created
 * before it can earn the label and its voucher; empty opens it to every
 * client account. Typed and shown in Manila time, sent as a UTC instant or
 * null. It saves on its own, through the same `expectedVersion` handshake with
 * an audited reason, and is never carried in the page's "Save settings".
 */
export function FoundingTesterLaunch({
  settings,
  canEdit,
  onSaved,
  onConflict,
  disabled,
}: Props) {
  const stored = settings.foundingTesterLaunchAt;
  // Untouched fields follow refreshed settings; an explicit edit stays a draft.
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const local = draft ?? (stored ? isoToManilaLocal(stored) : "");
  const next = local === "" ? null : manilaLocalToIso(local);
  const invalid = local !== "" && next === null;
  const dirty =
    stored !== undefined &&
    !invalid &&
    (next === null
      ? stored !== null
      : stored === null || Date.parse(stored) !== Date.parse(next));
  const locked = busy || Boolean(disabled);

  function edit(value: string) {
    setDraft(value);
    setError(null);
    setOk(null);
  }

  async function save() {
    if (!canEdit || locked || !dirty) return;
    setBusy(true);
    setError(null);
    setOk(null);
    const from = stored ? formatManila(stored) : "not set";
    const to = next ? formatManila(next) : "not set";
    try {
      const saved = await updateSettings({
        expectedVersion: settings.version,
        foundingTesterLaunchAt: next,
        reason: `Founding Tester launch date (Manila): ${from} to ${to}`,
      });
      onSaved(saved);
      setDraft(null);
      setOk(
        next
          ? "Launch date saved."
          : "Launch date cleared. Every client account can now earn the label.",
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === "settings_version_conflict") {
        setError(
          "Someone else saved settings a moment ago. Check the current date and yours before saving again.",
        );
        await onConflict();
      } else if (
        err instanceof ApiError &&
        err.code === "invalid_founding_tester_launch_at"
      ) {
        setError("That date could not be read. Pick a date and time again.");
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Only Super Admin can change this setting.");
      } else {
        setError(opsErrorMessage(err, "Could not save the launch date. Try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gg-card p-3" aria-labelledby="founding-tester-launch-heading">
      <h2 id="founding-tester-launch-heading" className="text-h3 text-text-primary m-0">
        Founding Tester launch date
      </h2>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
        Only client accounts created before this date can earn the Founding Tester label
        and its voucher. Leave it empty and every client account can.
      </p>
      <p className="text-caption text-text-muted m-0 mt-2 max-w-prose">
        Accounts that already earned the label keep it and their voucher when the date
        moves. Moving it only changes who can still earn one.
      </p>

      {stored === undefined ? (
        <p className="text-body text-text-secondary m-0 mt-3">
          The launch date is not available yet. It appears here once the service is
          updated.
        </p>
      ) : (
        <>
          <FieldGroup className="mt-3">
            <Field
              data-invalid={invalid || undefined}
              data-disabled={locked || undefined}
            >
              <FieldLabel htmlFor="founding-tester-launch">
                Launch date and time (Manila time)
              </FieldLabel>
              {canEdit ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="founding-tester-launch"
                    type="datetime-local"
                    value={local}
                    disabled={locked}
                    aria-invalid={invalid || undefined}
                    aria-describedby="founding-tester-launch-help"
                    className="max-w-xs"
                    onChange={(event) => edit(event.target.value)}
                  />
                  <Button
                    variant="ghost"
                    disabled={locked || local === ""}
                    onClick={() => edit("")}
                  >
                    Clear date
                  </Button>
                </div>
              ) : null}
              <FieldDescription id="founding-tester-launch-help">
                In force right now: {launchDateText(stored)}
              </FieldDescription>
              {invalid ? (
                <FieldError>Pick both a date and a time, or clear the date.</FieldError>
              ) : null}
            </Field>
          </FieldGroup>
          {canEdit && dirty ? (
            <p className="text-body text-text-primary m-0 mt-3 max-w-prose" role="note">
              {next
                ? `After saving, only accounts created before ${formatManila(next)} (Manila) can earn the label.`
                : "After saving, every client account can earn the label, whenever it was created."}
            </p>
          ) : null}
          {canEdit ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={locked || !dirty}
                onClick={() => void save()}
              >
                {busy ? "Saving…" : "Save launch date"}
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
          ) : (
            <p className="text-caption text-text-muted m-0 mt-3">
              Only Super Admin changes this.
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
