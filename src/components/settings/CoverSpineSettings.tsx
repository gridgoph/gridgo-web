"use client";

import { useState } from "react";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ApiError, updateSettings } from "@/lib/api/client";
import type { PlatformSettings } from "@/lib/api/types";

type Props = {
  settings: PlatformSettings;
  canEdit: boolean;
  onSaved: (next: PlatformSettings) => void;
  onConflict: () => Promise<void> | void;
  disabled?: boolean;
};

/**
 * Whether checkout refuses a hardbound or binding line without its cover and
 * spine (gridgo-client#247; contract gridgo-api docs/HARDBOUND_COVER_API.md,
 * "The `coverSpineRequired` switch"). Off by default, because released client
 * builds cannot send the form; while off the order is placed and the line is
 * agreed as "not given". It saves on its own, through the same
 * `expectedVersion` handshake with an audited reason, and is never carried in
 * the page's "Save settings". Super Admin only; anyone else reads it.
 */
export function CoverSpineSettings({
  settings,
  canEdit,
  onSaved,
  onConflict,
  disabled,
}: Props) {
  const stored = settings.coverSpineRequired;
  // Untouched fields follow refreshed settings; an explicit choice stays a draft.
  const [draft, setDraft] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const enabled = draft ?? stored ?? false;
  const dirty = stored !== undefined && enabled !== stored;
  const locked = busy || Boolean(disabled);

  async function save() {
    if (!canEdit || locked || !dirty) return;
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      const saved = await updateSettings({
        expectedVersion: settings.version,
        coverSpineRequired: enabled,
        reason: `Cover and spine required at checkout: ${stored ? "on" : "off"} to ${enabled ? "on" : "off"}`,
      });
      onSaved(saved);
      setDraft(null);
      setOk(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "settings_version_conflict") {
        setError(
          "Someone else saved settings a moment ago. Check the current setting and your choice before saving again.",
        );
        await onConflict();
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Only Super Admin can change this setting.");
      } else {
        setError(opsErrorMessage(err, "Could not save the cover and spine setting. Try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gg-card p-3" aria-labelledby="cover-spine-heading">
      <h2 id="cover-spine-heading" className="text-h3 text-text-primary m-0">
        Hardbound cover and spine
      </h2>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
        When on, a client ordering a hardbound or binding product must choose the cover
        and fill in the spine before checkout. When off, the order is placed without them
        and the shop asks the client, as before.
      </p>
      <p className="text-caption text-text-muted m-0 mt-2 max-w-prose">
        Turn this on only once most clients have the customer app version with the spine
        form; older versions cannot send it. Orders already placed keep what they were
        placed with.
      </p>

      {stored === undefined ? (
        <p className="text-body text-text-secondary m-0 mt-3">
          The cover and spine setting is not available yet. It appears here once the
          service is updated.
        </p>
      ) : (
        <>
          <FieldGroup className="mt-3">
            <Field orientation="horizontal" data-disabled={locked || undefined}>
              {canEdit ? (
                <Switch
                  id="cover-spine-required"
                  aria-label="Require cover and spine"
                  aria-describedby="cover-spine-help"
                  checked={enabled}
                  disabled={locked}
                  onCheckedChange={(value) => {
                    setDraft(value);
                    setError(null);
                    setOk(false);
                  }}
                />
              ) : null}
              <FieldLabel htmlFor="cover-spine-required" className="min-h-11">
                Require cover and spine
              </FieldLabel>
              <span className="text-caption text-text-secondary">
                {enabled ? "On" : "Off"}
              </span>
            </Field>
            <FieldDescription id="cover-spine-help">
              {canEdit ? "Changes take effect when you save below. " : null}
              In force right now: {stored ? "On" : "Off"}.
            </FieldDescription>
          </FieldGroup>
          {canEdit ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={locked || !dirty}
                onClick={() => void save()}
              >
                {busy ? "Saving…" : "Save cover and spine"}
              </Button>
              <Button
                variant="ghost"
                disabled={locked || !dirty}
                onClick={() => {
                  setDraft(null);
                  setError(null);
                  setOk(false);
                }}
              >
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
          Cover and spine setting saved.
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
