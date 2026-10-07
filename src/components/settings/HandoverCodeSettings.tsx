"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

export function HandoverCodeSettings({
  settings,
  canEdit,
  onSaved,
  onConflict,
  disabled,
}: Props) {
  const stored = settings.handoverOtpEnabled;
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
        handoverOtpEnabled: enabled,
        reason: `Handover codes: ${stored ? "on" : "off"} to ${enabled ? "on" : "off"}`,
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
        setError("Only Super Admin can change handover codes.");
      } else {
        setError(opsErrorMessage(err, "Could not save handover codes. Try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gg-card p-3" aria-labelledby="handover-codes-heading">
      <h2 id="handover-codes-heading" className="text-h3 text-text-primary m-0">
        Handover codes
      </h2>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
        When on, every order gets a handover code when it is ready. Pick-ups also get a QR
        code when they reach the hub; deliveries need the matching code. Before turning
        this on, make sure riders have a recent rider app with the handover code screen.
      </p>
      <p className="text-caption text-text-muted m-0 mt-2 max-w-prose">
        Orders already ready keep their current handover process. Turning this off does
        not remove codes already issued.
      </p>

      {!settings.hubPickup?.schedule ? (
        <Alert className="mt-3">
          <TriangleAlert aria-hidden />
          <AlertTitle>Hub hours are not set</AlertTitle>
          <AlertDescription>
            Set opening hours in Hub pick-up above before accepting pick-ups at the hub.
          </AlertDescription>
        </Alert>
      ) : null}

      {stored === undefined ? (
        <p className="text-body text-text-secondary m-0 mt-3">
          Handover code settings are not available yet. They appear here once the service
          is updated.
        </p>
      ) : (
        <>
          <FieldGroup className="mt-3">
            <Field orientation="horizontal" data-disabled={locked || undefined}>
              {canEdit ? (
                <Switch
                  id="handover-codes-enabled"
                  aria-label="Handover codes"
                  aria-describedby="handover-codes-help"
                  checked={enabled}
                  disabled={locked}
                  onCheckedChange={(value) => {
                    setDraft(value);
                    setError(null);
                    setOk(false);
                  }}
                />
              ) : null}
              <FieldLabel htmlFor="handover-codes-enabled" className="min-h-11">
                Handover codes
              </FieldLabel>
              <span className="text-caption text-text-secondary">
                {enabled ? "On" : "Off"}
              </span>
            </Field>
            <FieldDescription id="handover-codes-help">
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
                {busy ? "Saving…" : "Save handover codes"}
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
          Handover codes saved.
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
