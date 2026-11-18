"use client";

import { useRef, useState } from "react";

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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/StatusChip";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getCashReconciliation } from "@/lib/api/cash";
import { ApiError, updateSettings } from "@/lib/api/client";
import type {
  CashSettings as CashSettingsValue,
  PlatformSettings,
} from "@/lib/api/types";
import {
  CASH_SETTINGS_DEFAULTS,
  cashSettingsChanges,
  cashSettingsDraftError,
  parseCashDraft,
  type CashDraft,
} from "@/lib/cash-settings";
import { formatPhp, minorToPesosInput } from "@/lib/format";

type Props = {
  settings: PlatformSettings;
  canEdit: boolean;
  onSaved: (next: PlatformSettings) => void;
  onConflict: () => Promise<void> | void;
  disabled?: boolean;
};

const toDraft = (cash: CashSettingsValue, countdown: number): CashDraft => ({
  enabled: cash.enabled,
  limitPesos: minorToPesosInput(cash.limitMinor),
  waitMinutes: String(Math.round(cash.noShowWaitSeconds / 60)),
  countdownSeconds: String(countdown),
});

/**
 * Cash on delivery's switch and limits (CASH_ON_DELIVERY_API.md), Super
 * Admin only. Its own save with a reason, like every money setting. Turning
 * cash on restates who it reaches and the ledger's reconciliation first.
 */
export function CashSettings({
  settings,
  canEdit,
  onSaved,
  onConflict,
  disabled,
}: Props) {
  const stored = settings.cash;
  const countdown = settings.riderOfferTimeoutSeconds ?? 30;
  const base = toDraft(stored ?? CASH_SETTINGS_DEFAULTS, countdown);
  const [draft, setDraft] = useState<CashDraft | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  // Set synchronously: a second click in the same turn saves nothing.
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [recon, setRecon] = useState<"checking" | "ok" | "problems" | "unknown">(
    "checking",
  );

  const current = draft ?? base;
  const parsed = parseCashDraft(current);
  const problem = cashSettingsDraftError(current);
  const changes =
    stored && parsed ? cashSettingsChanges(stored, countdown, parsed) : null;
  const dirty = Boolean(
    changes && (Object.keys(changes.cash).length || changes.countdown !== undefined),
  );
  const locked = busy || Boolean(disabled);
  const switching = changes?.cash.enabled !== undefined;

  function edit(next: Partial<CashDraft>) {
    setDraft({ ...current, ...next });
    setError(null);
    setOk(null);
  }

  async function startSave() {
    if (!canEdit || locked || !dirty || problem || !reason.trim()) return;
    if (switching && changes?.cash.enabled) {
      setRecon("checking");
      setConfirming(true);
      try {
        const result = await getCashReconciliation();
        setRecon(result.ok ? "ok" : "problems");
      } catch {
        setRecon("unknown");
      }
      return;
    }
    if (switching) {
      setRecon("ok");
      setConfirming(true);
      return;
    }
    await save();
  }

  async function save() {
    if (!changes || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const saved = await updateSettings({
        expectedVersion: settings.version,
        reason: reason.trim(),
        ...(Object.keys(changes.cash).length ? { cash: changes.cash } : {}),
        ...(changes.countdown !== undefined
          ? { riderOfferTimeoutSeconds: changes.countdown }
          : {}),
      });
      onSaved(saved);
      setDraft(null);
      setReason("");
      setConfirming(false);
      setOk(
        changes.cash.enabled === true
          ? "Cash on delivery is on for new checkouts."
          : changes.cash.enabled === false
            ? "Cash on delivery is off for new checkouts and top-ups."
            : "Cash settings saved.",
      );
    } catch (err) {
      setConfirming(false);
      if (err instanceof ApiError && err.code === "settings_version_conflict") {
        setError(
          "Someone else saved settings a moment ago. Check the current values and your changes before saving again.",
        );
        await onConflict();
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Only Super Admin can change cash on delivery.");
      } else if (err instanceof ApiError && err.code === "invalid_cash_settings") {
        setError("The API refused these values. Check the limit and the no-show wait.");
      } else {
        setError(opsErrorMessage(err, "Could not save cash settings. Try again."));
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const inForce = stored ?? CASH_SETTINGS_DEFAULTS;

  return (
    <section className="gg-card p-3" aria-labelledby="cash-settings-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="cash-settings-heading" className="text-h3 text-text-primary m-0">
          Cash on delivery
        </h2>
        {stored ? (
          stored.enabled ? (
            <StatusChip tone="success" icon="circle-check" label="On" />
          ) : (
            <StatusChip tone="neutral" icon="ban" label="Off" />
          )
        ) : null}
      </div>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
        When on, individual clients can pay cash to the rider for a delivered order whose
        printing and service fee is under the limit. The rider pays the shop at pickup and
        needs GRIDGO&rsquo;s share in their wallet before a cash offer reaches them.
      </p>
      <p className="text-caption text-text-secondary m-0 mt-2 max-w-prose">
        Turning cash off stops new cash checkouts and new top-ups. Wallets stay readable,
        waiting top-ups can still be decided and cash orders already placed can finish.
      </p>

      {!stored ? (
        <p className="text-body text-text-secondary m-0 mt-3">
          Cash settings are not available yet. They appear here once the service is
          updated.
        </p>
      ) : (
        <>
          <FieldGroup className="mt-3">
            <Field orientation="horizontal" data-disabled={locked || undefined}>
              {canEdit ? (
                <Switch
                  id="cash-enabled"
                  aria-describedby="cash-enabled-help"
                  checked={current.enabled}
                  disabled={locked}
                  onCheckedChange={(value) => edit({ enabled: value })}
                />
              ) : null}
              <FieldLabel htmlFor="cash-enabled" className="min-h-11">
                Accept cash on delivery
              </FieldLabel>
              <span className="text-caption text-text-secondary">
                {current.enabled ? "On" : "Off"}
              </span>
            </Field>
            <FieldDescription id="cash-enabled-help">
              In force right now: {inForce.enabled ? "On" : "Off"}.
            </FieldDescription>

            <Field data-invalid={problem?.field === "limit" || undefined}>
              <FieldLabel htmlFor="cash-limit">Order limit (₱)</FieldLabel>
              <Input
                id="cash-limit"
                inputMode="decimal"
                className="max-w-48 tabular-nums"
                value={current.limitPesos}
                disabled={!canEdit || locked}
                aria-invalid={problem?.field === "limit" || undefined}
                onChange={(event) => edit({ limitPesos: event.target.value })}
              />
              <FieldDescription>
                {problem?.field === "limit"
                  ? problem.message
                  : `Cash is offered only when the cart's printing and service fee is below this, before delivery and vouchers. In force: ${formatPhp(inForce.limitMinor)}.`}
              </FieldDescription>
            </Field>

            <Field data-invalid={problem?.field === "wait" || undefined}>
              <FieldLabel htmlFor="cash-wait">No-show wait (minutes)</FieldLabel>
              <Input
                id="cash-wait"
                inputMode="numeric"
                className="max-w-32 tabular-nums"
                value={current.waitMinutes}
                disabled={!canEdit || locked}
                aria-invalid={problem?.field === "wait" || undefined}
                onChange={(event) => edit({ waitMinutes: event.target.value })}
              />
              <FieldDescription>
                {problem?.field === "wait"
                  ? problem.message
                  : `How long a rider waits at the door before reporting a no-show, 1 to 120 minutes. New orders only. In force: ${Math.round(inForce.noShowWaitSeconds / 60)} minutes.`}
              </FieldDescription>
            </Field>

            <Field data-invalid={problem?.field === "countdown" || undefined}>
              <FieldLabel htmlFor="cash-countdown">Offer countdown (seconds)</FieldLabel>
              <Input
                id="cash-countdown"
                inputMode="numeric"
                className="max-w-32 tabular-nums"
                value={current.countdownSeconds}
                disabled={!canEdit || locked}
                aria-invalid={problem?.field === "countdown" || undefined}
                onChange={(event) => edit({ countdownSeconds: event.target.value })}
              />
              <FieldDescription>
                {problem?.field === "countdown"
                  ? problem.message
                  : `How long a rider has to read any delivery offer, cash or online, before it moves on: 10 to 120 seconds. In force: ${countdown} seconds.`}
              </FieldDescription>
            </Field>

            {canEdit ? (
              <Field>
                <FieldLabel htmlFor="cash-reason">Reason for the change</FieldLabel>
                <Textarea
                  id="cash-reason"
                  rows={2}
                  maxLength={500}
                  value={reason}
                  disabled={locked}
                  placeholder="e.g. Rider and client apps released; ledger reconciles"
                  onChange={(event) => {
                    setReason(event.target.value);
                    setError(null);
                  }}
                />
                <FieldDescription>
                  Kept with the change in the audit log.
                </FieldDescription>
              </Field>
            ) : null}
          </FieldGroup>

          {canEdit ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={locked || !dirty || Boolean(problem) || !reason.trim()}
                onClick={() => void startSave()}
              >
                {busy ? "Saving…" : "Save cash settings"}
              </Button>
              <Button
                variant="ghost"
                disabled={locked || !dirty}
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
            <p className="text-caption text-text-secondary m-0 mt-3">
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

      <AlertDialog
        open={confirming}
        onOpenChange={(next) => !next && !busy && setConfirming(false)}
      >
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {changes?.cash.enabled
                ? "Turn on cash on delivery?"
                : "Turn off cash on delivery?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {changes?.cash.enabled
                ? `Individual clients can choose cash at checkout for delivered orders under ${parsed ? formatPhp(parsed.limitMinor) : ""}. Riders need wallet funds to receive cash offers. Turn it on only after the client, rider and dashboard releases are out.`
                : "New cash checkouts and new top-ups stop. Cash orders already placed carry on, and waiting top-ups can still be decided."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {changes?.cash.enabled ? (
            <p className="text-body m-0" role="status" aria-live="polite">
              {recon === "checking" ? (
                <span className="text-text-secondary">Checking the cash ledger…</span>
              ) : recon === "ok" ? (
                <StatusChip
                  tone="success"
                  icon="circle-check"
                  label="The cash ledger reconciles"
                />
              ) : recon === "problems" ? (
                <StatusChip
                  tone="error"
                  icon="circle-x"
                  label="The cash ledger has problems: check Cash on delivery first"
                />
              ) : (
                <StatusChip
                  tone="warning"
                  icon="circle-help"
                  label="Could not check the cash ledger"
                />
              )}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary" disabled={busy}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant={changes?.cash.enabled ? "primary" : "destructive"}
              disabled={busy || recon === "checking"}
              onClick={() => void save()}
            >
              {busy
                ? "Saving…"
                : changes?.cash.enabled
                  ? "Turn on cash"
                  : "Turn off cash"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
