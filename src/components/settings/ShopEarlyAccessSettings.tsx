"use client";

import { useState } from "react";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { StatusChip } from "@/components/ui/StatusChip";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, updateSettings } from "@/lib/api/client";
import type { PlatformSettings } from "@/lib/api/types";

type Props = {
  settings: PlatformSettings;
  canEdit: boolean;
  onSaved: (next: PlatformSettings) => void;
  onConflict: () => Promise<void> | void;
  disabled?: boolean;
};

/** Reasons are stored whole in the audit log; keep them readable. */
const REASON_MAX = 500;
const REASON_REQUIRED = "Say why you are changing this. The audit log keeps the reason.";

/** The audit reason: what changed, then the Super Admin's own words. */
export function shopEarlyAccessReason(open: boolean, why: string): string {
  return `Shop app early access ${open ? "opened" : "closed"}. ${why.trim()}`;
}

/**
 * Shop app early access (`shopEarlyAccessEnabled`, contract
 * `gridgo-api/docs/EARLY_ACCESS_API.md`, gridgoph/gridgo-web#329). While closed
 * the API refuses shop sign-ups and grants and the website shop form reads
 * "opens soon"; customer early access is never affected. Off by default.
 *
 * Super Admin only: mounted from `OperationalSettings` (the `/admin/settings`
 * screen) alone. Flipping the switch writes nothing; the confirmation restates
 * what changes on the website, takes the audited reason, and saves on its own
 * through the `expectedVersion` handshake. A stale version reloads underneath.
 */
export function ShopEarlyAccessSettings({
  settings,
  canEdit,
  onSaved,
  onConflict,
  disabled,
}: Props) {
  const stored = settings.shopEarlyAccessEnabled;
  // The state the confirmation would save; null while no change is asked for.
  const [target, setTarget] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const locked = busy || Boolean(disabled);
  const reasonText = reason.trim();

  function ask(next: boolean) {
    if (!canEdit || locked || stored === undefined || next === stored) return;
    setTarget(next);
    setError(null);
    setDialogError(null);
    setOk(null);
  }

  async function save() {
    if (target === null || busy) return;
    if (!reasonText) {
      setDialogError(REASON_REQUIRED);
      return;
    }
    setBusy(true);
    setDialogError(null);
    try {
      const saved = await updateSettings({
        expectedVersion: settings.version,
        shopEarlyAccessEnabled: target,
        reason: shopEarlyAccessReason(target, reasonText),
      });
      onSaved(saved);
      setTarget(null);
      setReason("");
      setOk(
        saved.shopEarlyAccessEnabled
          ? "Shop app early access is open. Print shops can now sign up on the website."
          : "Shop app early access is closed. The website shop form shows “opens soon” again.",
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === "settings_version_conflict") {
        // Someone saved first: close, reload what is in force, keep the reason.
        setTarget(null);
        setError(
          "Someone else saved settings a moment ago. Check whether shop app early access is open now, then change it again if you still need to.",
        );
        await onConflict();
      } else if (err instanceof ApiError && err.code === "settings_reason_required") {
        setDialogError(REASON_REQUIRED);
      } else if (err instanceof ApiError && err.status === 403) {
        setDialogError("Only Super Admin can change this.");
      } else {
        setDialogError(opsErrorMessage(err, "Could not save this setting. Try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  const word = stored ? "open" : "closed";

  return (
    <section className="gg-card p-3" aria-labelledby="shop-early-access-heading">
      <h2 id="shop-early-access-heading" className="text-h3 text-text-primary m-0">
        Shop app early access
      </h2>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
        While open, print shops can sign up on the website to test the shop app, and
        granting them sends the shop app invite. Customer early access is not affected.
      </p>

      {stored === undefined ? (
        <p className="text-body text-text-secondary m-0 mt-3">
          This setting is not available yet. It appears here once the service is updated.
        </p>
      ) : canEdit ? (
        <Field orientation="horizontal" className="mt-3" data-disabled={locked || undefined}>
          <Switch
            id="shop-early-access"
            aria-describedby="shop-early-access-help"
            checked={stored}
            disabled={locked}
            onCheckedChange={(value) => ask(Boolean(value))}
          />
          <div className="flex flex-col">
            <FieldLabel htmlFor="shop-early-access" className="min-h-11">
              Shop app early access: {word}
            </FieldLabel>
            <FieldDescription id="shop-early-access-help">
              {stored
                ? "The website shop form is open."
                : "The website shop form shows “opens soon”."}{" "}
              Open it only once the shop app release is confirmed.
            </FieldDescription>
          </div>
        </Field>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusChip
            tone={stored ? "info" : "neutral"}
            icon={stored ? "circle-check" : "circle-dashed"}
            label={`Shop app early access: ${word}`}
          />
          <span className="text-caption text-text-muted">Only Super Admin changes this.</span>
        </div>
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

      <AlertDialog
        open={target !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setTarget(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {target ? "Open shop app early access?" : "Close shop app early access?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {target
                ? "The shop form on the website opens as soon as you save: print shops can sign up to test the shop app, and granting them sends the shop app invite. Open it only after the new service is live everywhere."
                : "The website shop form goes back to “opens soon” and new shop sign-ups and grants stop. Shops already signed up stay on the list."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field data-invalid={dialogError === REASON_REQUIRED || undefined}>
            <FieldLabel htmlFor="shop-early-access-reason">Why you are changing it</FieldLabel>
            <Textarea
              id="shop-early-access-reason"
              value={reason}
              maxLength={REASON_MAX}
              rows={2}
              disabled={busy}
              aria-invalid={dialogError === REASON_REQUIRED || undefined}
              placeholder={
                target
                  ? "For example: the shop app release is confirmed"
                  : "For example: pausing shop sign-ups"
              }
              onChange={(event) => {
                setReason(event.target.value);
                setDialogError(null);
              }}
            />
            <FieldDescription>Saved in the audit log with who changed it.</FieldDescription>
          </Field>
          {dialogError ? (
            <p className="text-body text-error m-0" role="alert">
              {dialogError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary" disabled={busy}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant={target ? "primary" : "destructive"}
              disabled={busy}
              onClick={() => void save()}
            >
              {busy
                ? "Saving…"
                : target
                  ? "Open shop early access"
                  : "Close shop early access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
