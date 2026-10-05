"use client";

/**
 * Hub pick-up on Operational settings (gridgo-client#158, gridgo-api#148).
 *
 * When GRIDGO's counter is open for collection and the flat fee a pick-up
 * order pays. Every role reads it; only Super Admin writes it — the API
 * answers anyone else `403` — so Operations gets the same card without
 * inputs. It saves on its own, through the same `expectedVersion` handshake,
 * because "Save settings" also carries fields Operations may write.
 *
 * The fee ships at ₱0 and the hours ship unset. Unset is said in words
 * ("not set yet"), never drawn as an open week.
 */

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/StatusChip";
import { ApiError, updateSettings } from "@/lib/api/client";
import type { HubPickup, PlatformSettings } from "@/lib/api/types";
import {
  HUB_CLOSURE_MAX,
  MANILA_OFFSET_MINUTES,
  STARTER_WINDOW,
  WEEKDAYS,
  hubChangeReason,
  hubDraft,
  hubFeeLabel,
  parseHubDraft,
  readHubFee,
  scheduleLines,
  type HubDraft,
  type WindowDraft,
} from "@/lib/hub-pickup";
import { cn } from "@/lib/utils";

const medium = { fontFamily: "var(--font-medium)" } as const;

type Props = {
  settings: PlatformSettings;
  /** Super Admin. Operations sees the same hours and fee without controls. */
  canEdit: boolean;
  onSaved: (next: PlatformSettings) => void;
  /** Someone saved first: reload the page's settings underneath. */
  onConflict: () => Promise<void> | void;
  disabled?: boolean;
};

export function HubPickupSettings({
  settings,
  canEdit,
  onSaved,
  onConflict,
  disabled,
}: Props) {
  const stored = settings.hubPickup;
  const [draft, setDraft] = useState<HubDraft | null>(stored ? hubDraft(stored) : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // A newer value from elsewhere replaces the fields unless they were edited here.
  const previous = useRef(stored);
  useEffect(() => {
    const before = previous.current;
    previous.current = stored;
    if (!stored) return;
    setDraft((current) =>
      !current || !before || JSON.stringify(current) === JSON.stringify(hubDraft(before))
        ? hubDraft(stored)
        : current,
    );
  }, [stored]);

  if (!stored || !draft) {
    return (
      <HubSection>
        <p
          className="text-body text-text-secondary m-0 mt-3 max-w-prose"
          data-testid="hub-unavailable"
        >
          The API behind this portal does not offer hub pick-up settings yet. They appear
          here once it is updated.
        </p>
      </HubSection>
    );
  }

  const parsed = parseHubDraft(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(hubDraft(stored));
  const locked = busy || Boolean(disabled);
  const typedFee = readHubFee(draft.fee);
  const newCharge = stored.feeMinor === 0 && typedFee !== null && typedFee > 0;
  const zone = zoneLabel(stored.schedule?.utcOffsetMinutes ?? draft.utcOffsetMinutes);

  async function save() {
    if (!stored || !("value" in parsed)) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const next = parsed.value;
      const saved = await updateSettings({
        expectedVersion: settings.version,
        hubPickup: next,
        reason: hubChangeReason(stored, next),
      });
      onSaved(saved);
      if (saved.hubPickup) setDraft(hubDraft(saved.hubPickup));
      setOk(
        "Saved. New pick-up orders use these hours and this fee. Orders already placed keep the ones they were checked out with.",
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === "settings_version_conflict") {
        setError(
          "Someone else saved settings a moment ago. Their values are now shown as in force; check yours against them and save again.",
        );
        await onConflict();
      } else if (err instanceof ApiError && err.code === "invalid_hub_pickup_schedule") {
        setError(
          "The API refused these hours. Each day's hours must not overlap, closing must be after opening, and closures need a first and last day.",
        );
      } else if (err instanceof ApiError && err.code === "invalid_hub_pickup") {
        setError("The API refused the fee. Enter a whole peso amount of 0 or more.");
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Only Super Admin can change hub pick-up.");
      } else {
        setError(opsErrorMessage(err, "Could not save hub pick-up. Try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  function update(change: (current: HubDraft) => HubDraft) {
    setOk(null);
    setDraft((current) => (current ? change(current) : current));
  }

  function setWindow(day: number, index: number, patch: Partial<WindowDraft>) {
    update((current) => ({
      ...current,
      days: {
        ...current.days,
        [day]: current.days[day].map((window, at) =>
          at === index ? { ...window, ...patch } : window,
        ),
      },
    }));
  }

  const problemField = "problem" in parsed ? parsed.field : null;

  return (
    <HubSection>
      {stored.point?.label ? (
        <p className="text-body text-text-secondary m-0 mt-1">
          Collection counter:{" "}
          <span className="text-text-primary" style={medium}>
            {stored.point.label}
          </span>
        </p>
      ) : null}

      {/* The fee */}
      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-start md:gap-6">
        {canEdit ? (
          <Field
            className="md:max-w-xs"
            data-invalid={problemField === "fee" || undefined}
          >
            <FieldLabel htmlFor="hub-fee">Pick-up fee (₱)</FieldLabel>
            <Input
              id="hub-fee"
              inputMode="decimal"
              className="max-w-40"
              value={draft.fee}
              disabled={locked}
              aria-invalid={problemField === "fee" || undefined}
              onChange={(event) =>
                update((current) => ({ ...current, fee: event.target.value }))
              }
            />
            <FieldDescription>
              Charged once per pick-up order, on top of printing. ₱0 means pick-up is
              free.
            </FieldDescription>
          </Field>
        ) : null}
        <div className="flex flex-col gap-1" data-testid="hub-fee-in-force">
          <span className="text-caption text-text-muted">Fee in force</span>
          <span className="text-body text-text-primary tabular-nums" style={medium}>
            {hubFeeLabel(stored.feeMinor)}
          </span>
        </div>
      </div>
      {canEdit && newCharge ? (
        <p
          className="text-body text-warning m-0 mt-2 max-w-prose"
          role="status"
          data-testid="hub-new-charge"
        >
          Pick-up is free today. Saving this starts charging clients who choose Pick-up
          from their next checkout.
        </p>
      ) : null}

      {/* The hours */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body text-text-primary m-0" style={medium}>
          Opening hours
        </h3>
        <StatusChip
          tone={stored.schedule ? "success" : "neutral"}
          icon={stored.schedule ? "circle-check" : "circle-dashed"}
          label={stored.schedule ? "Set" : "Not set yet"}
        />
      </div>

      {!canEdit ? (
        <ReadOnlyHours hub={stored} zone={zone} />
      ) : !draft.configured ? (
        <div className="mt-2 flex flex-col gap-3 rounded-card border border-dashed border-outline p-3">
          <p
            className="text-body text-text-secondary m-0 max-w-prose"
            data-testid="hub-hours-unset"
          >
            The hub&rsquo;s hours are not set, so clients choosing Pick-up are not shown
            any collection hours yet.
          </p>
          <div>
            <Button
              variant="secondary"
              disabled={locked}
              onClick={() => update((current) => ({ ...current, configured: true }))}
            >
              Set opening hours
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-caption text-text-muted m-0 mt-1">
            Times are {zone}. A day with no hours is closed.
          </p>
          <ul
            className="m-0 mt-2 flex list-none flex-col p-0"
            aria-label="Opening hours by day"
          >
            {WEEKDAYS.map(({ day, long }) => {
              const windows = draft.days[day] ?? [];
              return (
                <li
                  key={day}
                  className="flex flex-col gap-2 border-b border-outline-subtle py-2 last:border-b-0 sm:flex-row sm:items-start"
                  data-testid={`hub-day-${day}`}
                >
                  <span
                    className="text-body text-text-primary min-h-11 flex items-center sm:w-28 sm:shrink-0"
                    style={medium}
                  >
                    {long}
                  </span>
                  <div className="flex min-w-0 flex-col gap-2">
                    {windows.length === 0 ? (
                      <span className="text-body text-text-muted min-h-11 flex items-center">
                        Closed
                      </span>
                    ) : (
                      windows.map((window, index) => {
                        const invalid = problemField === `day-${day}-${index}`;
                        return (
                          <div key={index} className="flex flex-wrap items-center gap-2">
                            <Input
                              type="time"
                              className={cn("w-32", invalid && "border-error")}
                              aria-label={`${long} opens`}
                              aria-invalid={invalid || undefined}
                              value={window.opens}
                              disabled={locked}
                              onChange={(event) =>
                                setWindow(day, index, { opens: event.target.value })
                              }
                            />
                            <span className="text-body text-text-muted">to</span>
                            <Input
                              type="time"
                              className={cn("w-32", invalid && "border-error")}
                              aria-label={`${long} closes`}
                              aria-invalid={invalid || undefined}
                              value={window.closes}
                              disabled={locked}
                              onChange={(event) =>
                                setWindow(day, index, { closes: event.target.value })
                              }
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={locked}
                              aria-label={`Remove ${long} hours ${window.opens} to ${window.closes}`}
                              onClick={() =>
                                update((current) => ({
                                  ...current,
                                  days: {
                                    ...current.days,
                                    [day]: current.days[day].filter(
                                      (_, at) => at !== index,
                                    ),
                                  },
                                }))
                              }
                            >
                              <X aria-hidden />
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    className="self-start"
                    disabled={locked}
                    aria-label={`Add hours on ${long}`}
                    onClick={() =>
                      update((current) => {
                        const list = current.days[day];
                        const last = list[list.length - 1];
                        // A second window starts where the first ends, so it is
                        // a split shift to adjust rather than an overlap to fix.
                        const next = last
                          ? { opens: last.closes, closes: last.closes }
                          : STARTER_WINDOW;
                        return {
                          ...current,
                          days: { ...current.days, [day]: [...list, next] },
                        };
                      })
                    }
                  >
                    <Plus aria-hidden />
                    {windows.length ? "More hours" : "Open this day"}
                  </Button>
                </li>
              );
            })}
          </ul>

          <h3 className="text-body text-text-primary m-0 mt-4" style={medium}>
            Closures
          </h3>
          <p className="text-caption text-text-muted m-0 mt-1">
            Holidays or days the counter is shut. Both days are included.
          </p>
          {draft.closures.length ? (
            <ul
              className="m-0 mt-2 flex list-none flex-col gap-2 p-0"
              aria-label="Closures"
            >
              {draft.closures.map((closure, index) => {
                const invalid = problemField === `closure-${index}`;
                return (
                  <li key={index} className="flex flex-wrap items-center gap-2">
                    <Input
                      type="date"
                      className={cn("w-44", invalid && "border-error")}
                      aria-label={`Closure ${index + 1} first day`}
                      aria-invalid={invalid || undefined}
                      value={closure.startDay}
                      disabled={locked}
                      onChange={(event) =>
                        update((current) => ({
                          ...current,
                          closures: current.closures.map((row, at) =>
                            at === index
                              ? {
                                  startDay: event.target.value,
                                  // A one-day closure is the common case.
                                  endDay: row.endDay || event.target.value,
                                }
                              : row,
                          ),
                        }))
                      }
                    />
                    <span className="text-body text-text-muted">to</span>
                    <Input
                      type="date"
                      className={cn("w-44", invalid && "border-error")}
                      aria-label={`Closure ${index + 1} last day`}
                      aria-invalid={invalid || undefined}
                      value={closure.endDay}
                      disabled={locked}
                      onChange={(event) =>
                        update((current) => ({
                          ...current,
                          closures: current.closures.map((row, at) =>
                            at === index ? { ...row, endDay: event.target.value } : row,
                          ),
                        }))
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={locked}
                      aria-label={`Remove closure ${index + 1}`}
                      onClick={() =>
                        update((current) => ({
                          ...current,
                          closures: current.closures.filter((_, at) => at !== index),
                        }))
                      }
                    >
                      <X aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="mt-2">
            <Button
              variant="ghost"
              disabled={locked || draft.closures.length >= HUB_CLOSURE_MAX}
              onClick={() =>
                update((current) => ({
                  ...current,
                  closures: [...current.closures, { startDay: "", endDay: "" }],
                }))
              }
            >
              <Plus aria-hidden />
              Add a closure
            </Button>
          </div>
        </>
      )}

      {canEdit && "problem" in parsed && dirty ? (
        <p
          className="text-body text-error m-0 mt-3"
          role="alert"
          data-testid="hub-problem"
        >
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
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={locked || !dirty || "problem" in parsed}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save hub pick-up"}
          </Button>
          <Button
            variant="ghost"
            disabled={locked || !dirty}
            onClick={() => {
              setDraft(hubDraft(stored));
              setError(null);
              setOk(null);
            }}
          >
            Discard
          </Button>
          {draft.configured ? (
            <Button
              variant="ghost"
              disabled={locked}
              onClick={() => update((current) => ({ ...current, configured: false }))}
            >
              Clear hours
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-caption text-text-muted m-0 mt-3">
          Only Super Admin changes these.
        </p>
      )}
    </HubSection>
  );
}

function ReadOnlyHours({ hub, zone }: { hub: HubPickup; zone: string }) {
  const lines = scheduleLines(hub.schedule);
  if (!hub.schedule) {
    return (
      <p className="text-body text-text-secondary m-0 mt-2" data-testid="hub-hours-unset">
        Not set yet. Clients choosing Pick-up are not shown any collection hours.
      </p>
    );
  }
  const closures = hub.schedule.closures ?? [];
  return (
    <div className="mt-2 flex flex-col gap-1" data-testid="hub-hours">
      {lines.map((line) => (
        <p key={line} className="text-body text-text-primary m-0">
          {line}
        </p>
      ))}
      <p className="text-caption text-text-muted m-0">
        Times are {zone}. Days not listed are closed.
      </p>
      {closures.length ? (
        <p className="text-body text-text-secondary m-0 mt-1">
          Closed{" "}
          {closures
            .map((closure) =>
              closure.startDay === closure.endDay
                ? dayLabel(closure.startDay)
                : `${dayLabel(closure.startDay)} to ${dayLabel(closure.endDay)}`,
            )
            .join("; ")}
          .
        </p>
      ) : null}
    </div>
  );
}

/** A closure day is a Manila calendar day, whatever the reader's clock says. */
const MANILA_DAY = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeZone: "Asia/Manila",
});

function dayLabel(day: string): string {
  const at = new Date(`${day}T00:00:00+08:00`);
  return Number.isNaN(at.getTime()) ? day : MANILA_DAY.format(at);
}

function zoneLabel(offsetMinutes: number): string {
  if (offsetMinutes === MANILA_OFFSET_MINUTES) return "Philippine time";
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const minutes = abs % 60;
  return `UTC${sign}${Math.floor(abs / 60)}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}`;
}

function HubSection({ children }: { children: React.ReactNode }) {
  return (
    <section className="gg-card p-3" aria-labelledby="hub-pickup-heading">
      <h2 id="hub-pickup-heading" className="text-h3 text-text-primary m-0">
        Hub pick-up
      </h2>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
        Clients who choose Pick-up collect their order at GRIDGO&rsquo;s counter. Set when
        it is open and what a pick-up costs. Orders already placed keep the hours and fee
        they were checked out with.
      </p>
      {children}
    </section>
  );
}
