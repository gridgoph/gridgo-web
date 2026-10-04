"use client";

import { useState } from "react";

import {
  SEASON_LIMITS,
  reachPhrase,
  seasonDay,
  seasonErrorMessage,
} from "@/app/admin/_lib/season-windows";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { StatusChip } from "@/components/ui/StatusChip";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { updateSeasonPushSettings } from "@/lib/api/client";
import type {
  SeasonPushDryRun,
  SeasonPushSettings,
  SeasonWindow,
} from "@/lib/api/types";

type Props = {
  settings: SeasonPushSettings | null;
  settingsError: string | null;
  dryRun: SeasonPushDryRun | null;
  dryRunError: string | null;
  checking: boolean;
  windows: SeasonWindow[];
  today: string;
  onRecount: () => void;
  onChanged: (next: SeasonPushSettings | null) => void;
};

/**
 * The one control on this page that reaches phones.
 *
 * Off by default. Turning it on lets the scheduler send one notice per season,
 * on the first day its banner shows, to every client who allowed
 * notifications — and a season whose banner is showing right now goes out
 * within a minute. So the switch never flips on a click: it opens a
 * confirmation that restates who is reached and what is due, and asks why
 * (the API audits the reason). Off needs a reason too, but no alarm.
 */
export function SeasonNoticeSwitch({
  settings,
  settingsError,
  dryRun,
  dryRunError,
  checking,
  windows,
  today,
  onRecount,
  onChanged,
}: Props) {
  const [confirming, setConfirming] = useState<null | "on" | "off">(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = settings?.enabled ?? false;
  const due = dryRun?.windows.filter((w) => w.due) ?? [];
  const next = windows
    .filter((w) => !w.noticeQueuedAt && w.banner.startDate > today)
    .sort((a, b) => (a.banner.startDate < b.banner.startDate ? -1 : 1))[0];
  const reach = dryRun ? reachPhrase(dryRun.eligibleClients, dryRun.eligibleDevices) : null;

  function open(target: "on" | "off") {
    setReason("");
    setError(null);
    setConfirming(target);
  }

  async function apply() {
    if (!settings || !confirming) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("Say why. It goes in the audit log.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await updateSeasonPushSettings({
        enabled: confirming === "on",
        expectedVersion: settings.version,
        reason: trimmed,
      });
      onChanged(saved);
      setConfirming(null);
    } catch (err) {
      setError(seasonErrorMessage(err, "The switch did not change. Try again."));
      // A stale version: re-read so the next attempt carries the current one.
      onChanged(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gg-card flex flex-col gap-3" aria-labelledby="season-notices">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-prose">
          <h2 id="season-notices" className="text-h3 text-text-primary m-0">
            Pre-season notices
          </h2>
          <p className="text-body text-text-secondary m-0 mt-1">
            One push notification per season, sent to every client who allowed
            notifications on the day its home banner starts. Saving a season
            never sends anything by itself.
          </p>
        </div>
        {settings ? (
          <div className="flex min-h-11 items-center gap-3">
            <StatusChip
              tone={enabled ? "warning" : "neutral"}
              icon={enabled ? "circle-dot" : "circle-dashed"}
              label={enabled ? "On" : "Off"}
            />
            <Switch
              checked={enabled}
              // Turning on waits for the count, so the confirmation never
              // understates who is reached. A failed count still lets it open,
              // and says the count is missing.
              disabled={!enabled && !dryRun && !dryRunError}
              onCheckedChange={(checked) => open(checked ? "on" : "off")}
              aria-label="Pre-season notices"
            />
          </div>
        ) : null}
      </div>

      {settingsError ? (
        <p className="text-body text-error m-0" role="alert">
          {settingsError}
        </p>
      ) : null}

      <div className="gg-panel flex flex-col gap-2 p-3">
        {dryRun && reach ? (
          <>
            <p className="text-body text-text-primary m-0">
              <span style={{ fontFamily: "var(--font-medium)" }}>{reach}</span>{" "}
              allow notifications today.
            </p>
            <p className="text-caption text-text-muted m-0">
              A count of registered phones, not a delivery promise. Nothing was
              sent to work this out.
            </p>
            {due.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {due.map((w) => (
                  <li key={w.id} className="text-body text-text-secondary">
                    {enabled ? "Sending now" : "Due now, held while off"}:{" "}
                    <span className="text-text-primary">{w.name}</span>, to{" "}
                    {reachPhrase(w.wouldNotifyClients, w.wouldNotifyDevices)}.
                  </li>
                ))}
              </ul>
            ) : next ? (
              <p className="text-body text-text-secondary m-0">
                Nothing is due today. Next: {next.name}, on{" "}
                {seasonDay(next.banner.startDate)}
                {enabled ? "." : ", if notices are on by then."}
              </p>
            ) : (
              <p className="text-body text-text-secondary m-0">
                Nothing is due, and no season ahead is waiting for its notice.
              </p>
            )}
          </>
        ) : dryRunError ? (
          <p className="text-body text-error m-0" role="alert">
            {dryRunError}
          </p>
        ) : (
          <p className="text-body text-text-muted m-0">Counting who would receive it…</p>
        )}
        <div>
          <Button variant="secondary" size="sm" disabled={checking} onClick={onRecount}>
            {checking ? "Counting…" : "Count again"}
          </Button>
        </div>
      </div>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen && !busy) setConfirming(null);
        }}
      >
        <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === "on" ? "Turn on pre-season notices?" : "Turn off pre-season notices?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === "on"
                ? `This will notify every client who allowed notifications${reach ? ` (${reach} today)` : ""}, once for each season, on the day its banner starts. A notification cannot be recalled once it reaches a phone.`
                : "No more season notices will be sent. Notices not yet delivered are held; ones already on phones stay there."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {confirming === "on" ? (
            !dryRun ? (
              <div
                className="flex flex-col items-start gap-2 rounded-card border border-warning p-3"
                role="status"
              >
                <StatusChip tone="warning" icon="triangle-alert" label="Count unavailable" />
                <p className="text-body text-text-primary m-0">
                  Who would receive it could not be counted. Any season whose banner
                  is showing today would be sent within a minute.
                </p>
              </div>
            ) : due.length > 0 ? (
              <div
                className="flex flex-col items-start gap-2 rounded-card border border-warning p-3"
                role="status"
              >
                <StatusChip tone="warning" icon="triangle-alert" label="Sends within a minute" />
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {due.map((w) => (
                    <li key={w.id} className="text-body text-text-primary">
                      {w.name}, to {reachPhrase(w.wouldNotifyClients, w.wouldNotifyDevices)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-body text-text-secondary m-0">
                {next
                  ? `Nothing is due today. The first notice would go out on ${seasonDay(next.banner.startDate)}, for ${next.name}.`
                  : "Nothing is due today, and no season ahead is waiting for its notice."}
              </p>
            )
          ) : null}

          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="season-switch-reason">Why</FieldLabel>
            <Textarea
              id="season-switch-reason"
              value={reason}
              rows={2}
              maxLength={SEASON_LIMITS.reason}
              aria-invalid={error ? true : undefined}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                confirming === "on"
                  ? "Graduation season notice approved for this year"
                  : "Pausing notices while the wording is reviewed"
              }
            />
            <FieldDescription>Goes in the audit log with your name.</FieldDescription>
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>

          <AlertDialogFooter>
            {/* Cancel takes focus, so a stray Return key changes nothing. */}
            <AlertDialogCancel variant="secondary" disabled={busy} autoFocus>
              {confirming === "on" ? "Keep notices off" : "Keep notices on"}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={confirming === "on" ? "primary" : "secondary"}
              disabled={busy || !reason.trim()}
              onClick={() => void apply()}
            >
              {busy
                ? "Saving…"
                : confirming === "on"
                  ? "Turn on notices"
                  : "Turn off notices"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
