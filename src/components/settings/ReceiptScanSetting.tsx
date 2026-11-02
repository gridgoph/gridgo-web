"use client";

/**
 * Finance switch: "Require receipt scan before calling a rider"
 * (`settings.shopReceiptScanRequired`, contract
 * `gridgo-api/docs/SHOP_RECEIPT_SCAN_API.md`). Off by default.
 *
 * Super Admin turns it on or off on Finance, with a reason the audit log keeps,
 * through the same `expectedVersion` handshake as every settings card: a stale
 * version reloads underneath and keeps the choice and reason typed here.
 * Operations reads the same card without the control. Reads its own settings,
 * so it can sit on any Finance surface.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/StatusChip";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, getSettings, updateSettings } from "@/lib/api/client";
import type { PlatformSettings } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import {
  RECEIPT_SCAN_SWITCH_HELP,
  receiptScanSwitch,
  receiptScanSwitchReason,
} from "@/lib/receipt-scan";

/** Reasons are stored whole in the audit log; keep them readable. */
const REASON_MAX = 500;

const TITLE = "Require receipt scan before calling a rider";

export function ReceiptScanSetting({ canEdit }: { canEdit: boolean }) {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Untouched, the switch follows refreshed settings; a choice stays a draft.
  const [draft, setDraft] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const load = useCallback(async () => {
    try {
      const next = await getSettings();
      settingsRef.current = next;
      setSettings(next);
      setLoadError(null);
    } catch (err) {
      // A failed re-read keeps the values last read; only a first read fails the card.
      if (!settingsRef.current) {
        setLoadError(opsErrorMessage(err, "Could not load the Finance settings. Try again."));
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useLiveReload("settings", load);

  if (loadError && !settings) {
    return (
      <ErrorState
        body={loadError}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  const stored = settings ? receiptScanSwitch(settings) : null;
  const on = draft ?? stored ?? false;
  const dirty = stored !== null && on !== stored;
  const reasonText = reason.trim();

  async function save() {
    if (!canEdit || !settings || busy || !dirty) return;
    if (!reasonText) {
      setError("Say why you are changing this. The audit log keeps the reason.");
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const saved = await updateSettings({
        expectedVersion: settings.version,
        shopReceiptScanRequired: on,
        reason: receiptScanSwitchReason(on, reasonText),
      });
      settingsRef.current = saved;
      setSettings(saved);
      setDraft(null);
      setReason("");
      setOk(
        receiptScanSwitch(saved)
          ? "Saved. Shops now send their receipt scan before calling a rider."
          : "Saved. Receipt scans are optional again.",
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === "settings_version_conflict") {
        // Someone saved first. Their value loads underneath; the choice and
        // reason typed here stay so they can be checked and saved again.
        setError(
          "Someone else saved settings a moment ago. Check the setting now in force against your choice, then save again.",
        );
        await load();
      } else if (err instanceof ApiError && err.code === "settings_reason_required") {
        setError("Say why you are changing this. The audit log keeps the reason.");
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Only Super Admin can change this.");
      } else {
        setError(opsErrorMessage(err, "Could not save this setting. Try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gg-card p-3" aria-labelledby="receipt-scan-setting-heading">
      <h2 id="receipt-scan-setting-heading" className="text-h3 text-text-primary m-0">
        {TITLE}
      </h2>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
        {RECEIPT_SCAN_SWITCH_HELP}
      </p>
      <p className="text-caption text-text-muted m-0 mt-2 max-w-prose">
        Orders already ready for a rider keep their pickup. While it is off, scans stay
        optional.
      </p>

      {!settings ? (
        <Skeleton className="mt-3 h-11 w-48 rounded-field" aria-hidden />
      ) : stored === null ? (
        <p className="text-body text-text-secondary m-0 mt-3">
          This setting is not available yet. It appears here once the service is updated.
        </p>
      ) : canEdit ? (
        <FieldGroup className="mt-3">
          <Field orientation="horizontal" data-disabled={busy || undefined}>
            <Switch
              id="receipt-scan-required"
              aria-describedby="receipt-scan-required-help"
              checked={on}
              disabled={busy}
              onCheckedChange={(value) => {
                setDraft(value);
                setError(null);
                setOk(null);
              }}
            />
            <FieldLabel htmlFor="receipt-scan-required" className="min-h-11">
              {TITLE}
            </FieldLabel>
            <span className="text-caption text-text-secondary">{on ? "On" : "Off"}</span>
          </Field>
          <FieldDescription id="receipt-scan-required-help">
            Changes take effect when you save. In force right now: {stored ? "On" : "Off"}.
          </FieldDescription>
          {dirty ? (
            <Field data-invalid={error && !reasonText ? true : undefined}>
              <FieldLabel htmlFor="receipt-scan-reason">Why you are changing it</FieldLabel>
              <Textarea
                id="receipt-scan-reason"
                value={reason}
                maxLength={REASON_MAX}
                rows={2}
                disabled={busy}
                aria-invalid={error && !reasonText ? true : undefined}
                placeholder="For example: the shop app now has the upload step"
                onChange={(event) => setReason(event.target.value)}
              />
              <FieldDescription>Saved in the audit log with who changed it.</FieldDescription>
            </Field>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={busy || !dirty}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy || (!dirty && !reason)}
              onClick={() => {
                setDraft(null);
                setReason("");
                setError(null);
                setOk(null);
              }}
            >
              Discard
            </Button>
          </div>
        </FieldGroup>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="receipt-scan-read-only">
          <StatusChip
            tone={stored ? "info" : "neutral"}
            icon={stored ? "circle-check" : "circle-dashed"}
            label={stored ? "On" : "Off"}
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
    </section>
  );
}
