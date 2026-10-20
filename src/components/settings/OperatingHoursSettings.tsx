"use client";

/**
 * Operating hours on Operational settings (gridgo-api#203, report 46481879;
 * contract `gridgo-api/docs/OPERATING_HOURS_API.md`).
 *
 * GRIDGO's working week: artwork is reviewed and riders are dispatched only
 * inside it, and new orders' acceptance, reminder and lateness clocks count
 * only its open time. Super Admin edits the week, closures, the review time,
 * the same-day promise margin (`gridgo-api/docs/SCHEDULING_API.md`) and the
 * stored Priority dispatch cutoff; everyone else reads them.
 *
 * It saves on its own, always the complete object, through the settings
 * `expectedVersion` handshake, with an audited reason naming what moved. The
 * preview beside the editor follows the unsaved draft, so the person saving
 * sees what a client ordering at a given moment would be told first.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Plus, X } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/StatusChip";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, updateSettings } from "@/lib/api/client";
import type { OperatingHours, PlatformSettings } from "@/lib/api/types";
import { WEEKDAYS, clockLabel, timeToMinutes } from "@/lib/hub-pickup";
import {
  CLOSURE_DAYS_MAX,
  CLOSURE_RANGES_MAX,
  REVIEW_MINUTES_MAX,
  REVIEW_MINUTES_MIN,
  SAME_DAY_MARGIN_MINUTES_DEFAULT,
  closureDayCount,
  closureLabel,
  closureLength,
  durationWords,
  isClosureDay,
  manilaDayKey,
  manilaInstant,
  manilaTime,
  manilaWhen,
  marginMinutes,
  operatingDraft,
  operatingHoursChanges,
  operatingHoursReason,
  operatingStatusLine,
  parseOperatingDraft,
  reviewTimingAt,
  weekdayOf,
  type DayDraft,
  type OperatingDraft,
} from "@/lib/operating-hours";
import { cn } from "@/lib/utils";

const medium = { fontFamily: "var(--font-medium)" } as const;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Open hours on the week chart: the info colour, as the season tracks draw it. */
const OPEN_FILL = "var(--season-track-busy)";
const OPEN_EDGE = "var(--color-info)";
/** Hour marks on the chart's shared axis. */
const AXIS = [
  { minute: 360, label: "6 AM" },
  { minute: 720, label: "Noon" },
  { minute: 1080, label: "6 PM" },
];

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

type Props = {
  settings: PlatformSettings;
  /** Super Admin. Anyone else reads the same week without controls. */
  canEdit: boolean;
  onSaved: (next: PlatformSettings) => void;
  /** Someone saved first: reload the page's settings underneath. */
  onConflict: () => Promise<void> | void;
  disabled?: boolean;
};

export function OperatingHoursSettings({
  settings,
  canEdit,
  onSaved,
  onConflict,
  disabled,
}: Props) {
  const stored = settings.operatingHours;
  const now = useNow(30_000);
  const [draft, setDraft] = useState<OperatingDraft | null>(
    stored ? operatingDraft(stored) : null,
  );
  const [note, setNote] = useState("");
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
      !current ||
      !before ||
      JSON.stringify(current) === JSON.stringify(operatingDraft(before))
        ? operatingDraft(stored)
        : current,
    );
  }, [stored]);

  if (!stored || !draft) {
    return (
      <HoursSection>
        <p
          className="text-body text-text-secondary m-0 mt-3 max-w-prose"
          data-testid="operating-hours-unavailable"
        >
          The API behind this portal does not offer operating hours yet. They appear here
          once it is updated.
        </p>
      </HoursSection>
    );
  }

  const parsed = parseOperatingDraft(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(operatingDraft(stored));
  const locked = busy || Boolean(disabled) || !canEdit;
  const problemField = canEdit && dirty && "problem" in parsed ? parsed.field : null;
  // The preview follows a readable draft; mid-edit it keeps showing what is saved.
  const previewHours = canEdit && "value" in parsed ? parsed.value : stored;
  const changes = "value" in parsed ? operatingHoursChanges(stored, parsed.value) : [];

  async function save() {
    if (!stored || !("value" in parsed)) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const saved = await updateSettings({
        expectedVersion: settings.version,
        operatingHours: parsed.value,
        reason: operatingHoursReason(stored, parsed.value, note),
      });
      onSaved(saved);
      if (saved.operatingHours) setDraft(operatingDraft(saved.operatingHours));
      setNote("");
      setOk(
        "Saved and recorded in Audit Logs. New orders use these hours. Orders already placed keep the ready-by they were promised; a file still waiting that this pushes later is tagged Review delayed.",
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === "settings_version_conflict") {
        setError(
          "Someone else saved settings a moment ago. Their values are now shown as in force; check yours against them and save again.",
        );
        await onConflict();
      } else if (err instanceof ApiError && err.code === "invalid_operating_hours") {
        setError(
          "The API refused these hours. Each open day needs one stretch of hours that closes after it opens, closures need real dates and can cover at most 90 days, review time is 1 to 540 minutes, and the same-day promise margin is at most 10 hours.",
        );
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Only Super Admin can change operating hours.");
      } else {
        setError(opsErrorMessage(err, "Could not save operating hours. Try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  function update(change: (current: OperatingDraft) => OperatingDraft) {
    setOk(null);
    setDraft((current) => (current ? change(current) : current));
  }

  function setDay(day: number, patch: Partial<DayDraft>) {
    update((current) => ({
      ...current,
      days: { ...current.days, [day]: { ...current.days[day], ...patch } },
    }));
  }

  const monday = draft.days[1];
  const openDays = WEEKDAYS.filter(({ day }) => draft.days[day]?.open);
  const canCopyMonday =
    canEdit &&
    monday?.open &&
    openDays.some(
      ({ day }) =>
        draft.days[day].opens !== monday.opens ||
        draft.days[day].closes !== monday.closes,
    );
  const closedDays = closureDayCount(draft.closures);
  const today = manilaDayKey(now);
  const nowTiming = reviewTimingAt(stored, now);
  const openNow = nowTiming?.isOpenNow ?? false;
  const statusLine = nowTiming
    ? operatingStatusLine(
        stored,
        {
          isOpenNow: openNow,
          scheduledReviewAt: new Date(nowTiming.scheduledReviewAt).toISOString(),
        },
        now,
      )
    : "Closed";
  const reviewMinutes = Number(draft.review);
  const margin = draft.margin;
  const typedMargin = margin ? marginMinutes(margin) : null;

  return (
    <HoursSection
      status={
        <span data-testid="operating-status">
          <StatusChip
            tone={openNow ? "success" : "neutral"}
            icon={openNow ? "circle-check" : "clock"}
            label={statusLine}
          />
        </span>
      }
    >
      <div className="mt-3">
        {/* The week */}
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-body text-text-primary m-0" style={medium}>
              Week
            </h3>
            <span className="text-caption text-text-muted">
              Philippine time. One stretch of hours per open day.
            </span>
          </div>
          <WeekChart
            draft={draft}
            canEdit={canEdit}
            locked={locked}
            problemField={problemField}
            now={now}
            closures={draft.closures}
            onDay={setDay}
          />
          {canCopyMonday ? (
            <Button
              variant="ghost"
              className="mt-1"
              disabled={locked}
              onClick={() =>
                update((current) => {
                  const days = { ...current.days };
                  for (const { day } of WEEKDAYS) {
                    if (days[day].open)
                      days[day] = {
                        ...days[day],
                        opens: monday.opens,
                        closes: monday.closes,
                      };
                  }
                  return { ...current, days };
                })
              }
            >
              <Copy aria-hidden />
              Use Monday&rsquo;s hours on every open day
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Review time */}
          <div className="flex flex-col gap-1">
            {canEdit ? (
              <Field data-invalid={problemField === "review" || undefined}>
                <FieldLabel htmlFor="operating-review">Artwork review time</FieldLabel>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="operating-review"
                    inputMode="numeric"
                    className="w-28 tabular-nums"
                    value={draft.review}
                    disabled={locked}
                    aria-invalid={problemField === "review" || undefined}
                    aria-describedby="operating-review-help"
                    onChange={(event) =>
                      update((current) => ({ ...current, review: event.target.value }))
                    }
                  />
                  <span className="text-body text-text-secondary">
                    minutes
                    {Number.isInteger(reviewMinutes) && reviewMinutes >= 60
                      ? ` (${durationWords(reviewMinutes)})`
                      : ""}
                  </span>
                </div>
                <FieldDescription id="operating-review-help">
                  Open time only, {REVIEW_MINUTES_MIN} to {REVIEW_MINUTES_MAX}. A review
                  that runs past closing finishes when GRIDGO next opens. Clients see it
                  in their ready-by estimate.
                </FieldDescription>
              </Field>
            ) : (
              <ReadOnlyLine
                label="Artwork review time"
                value={durationWords(stored.artworkReviewMinutes)}
                note="Open time only."
              />
            )}
          </div>

          {/* Same-day promise margin: absent until the API offers it. */}
          {margin && typeof stored.sameDayPromiseAllowanceMinutes === "number" ? (
            <div className="flex flex-col gap-1">
              {canEdit ? (
                <Field data-invalid={problemField === "margin" || undefined}>
                  <FieldLabel htmlFor="operating-margin-hours">
                    Same-day promise margin
                  </FieldLabel>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      id="operating-margin-hours"
                      inputMode="numeric"
                      className="w-20 tabular-nums"
                      value={margin.hours}
                      disabled={locked}
                      aria-label="Same-day promise margin, hours"
                      aria-invalid={problemField === "margin" || undefined}
                      aria-describedby="operating-margin-help"
                      onChange={(event) =>
                        update((current) => ({
                          ...current,
                          margin: { hours: event.target.value, minutes: margin.minutes },
                        }))
                      }
                    />
                    <span className="text-body text-text-secondary">hours</span>
                    <Input
                      inputMode="numeric"
                      className="w-20 tabular-nums"
                      value={margin.minutes}
                      disabled={locked}
                      aria-label="Same-day promise margin, minutes"
                      aria-invalid={problemField === "margin" || undefined}
                      aria-describedby="operating-margin-help"
                      onChange={(event) =>
                        update((current) => ({
                          ...current,
                          margin: { hours: margin.hours, minutes: event.target.value },
                        }))
                      }
                    />
                    <span className="text-body text-text-secondary">minutes</span>
                    {typedMargin !== SAME_DAY_MARGIN_MINUTES_DEFAULT ? (
                      <Button
                        variant="ghost"
                        disabled={locked}
                        onClick={() =>
                          update((current) => ({
                            ...current,
                            margin: {
                              hours: String(SAME_DAY_MARGIN_MINUTES_DEFAULT / 60),
                              minutes: "0",
                            },
                          }))
                        }
                      >
                        Use the default ({durationWords(SAME_DAY_MARGIN_MINUTES_DEFAULT)})
                      </Button>
                    ) : null}
                  </div>
                  <FieldDescription id="operating-margin-help">
                    Time GRIDGO adds after a same-day job is finished before the
                    client&rsquo;s promised time. Open time only, up to 10 hours; default{" "}
                    {durationWords(SAME_DAY_MARGIN_MINUTES_DEFAULT)}. A shorter margin lets
                    clients pick today for more same-day listings. Jobs that take a day or
                    more keep their usual margin.
                  </FieldDescription>
                </Field>
              ) : (
                <ReadOnlyLine
                  label="Same-day promise margin"
                  value={durationWords(stored.sameDayPromiseAllowanceMinutes)}
                  note="of open time after a same-day job is finished, before the client's promised time."
                />
              )}
            </div>
          ) : null}

          {/* Closures */}
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-body text-text-primary m-0" style={medium}>
                Closures
              </h3>
              <span
                className={cn(
                  "text-caption tabular-nums",
                  closedDays > CLOSURE_DAYS_MAX ? "text-error" : "text-text-muted",
                )}
                data-testid="operating-closure-count"
              >
                {closedDays} of {CLOSURE_DAYS_MAX} closed days used
              </span>
            </div>
            <p className="text-caption text-text-muted m-0 mt-1 max-w-prose">
              Holidays and other days GRIDGO is shut. Both dates are included. Files that
              arrive before a closure wait until the next open day and are marked Review
              delayed.
            </p>
            <ClosureList
              closures={draft.closures}
              canEdit={canEdit}
              locked={locked}
              problemField={problemField}
              today={today}
              onChange={(closures) => update((current) => ({ ...current, closures }))}
            />
          </div>

          {/* Priority dispatch cutoff */}
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-body text-text-primary m-0" style={medium}>
                Priority Delivery dispatch cutoff
              </h3>
              <StatusChip tone="neutral" icon="circle-dashed" label="Not offered yet" />
            </div>
            {canEdit ? (
              <Field data-invalid={problemField === "cutoff" || undefined}>
                <FieldLabel htmlFor="operating-cutoff" className="sr-only">
                  Priority Delivery dispatch cutoff
                </FieldLabel>
                <div>
                  <Input
                    id="operating-cutoff"
                    type="time"
                    className="w-[8.75rem]"
                    value={draft.cutoff}
                    disabled={locked}
                    aria-invalid={problemField === "cutoff" || undefined}
                    onChange={(event) =>
                      update((current) => ({ ...current, cutoff: event.target.value }))
                    }
                  />
                </div>
                <FieldDescription>
                  Kept for when Priority Delivery launches. Nothing uses it today, and no
                  client is offered Priority Delivery.
                </FieldDescription>
              </Field>
            ) : (
              <p className="text-body text-text-secondary m-0">
                {clockLabel(stored.priorityDispatchCutoffMinute)}. Kept for when Priority
                Delivery launches; nothing uses it today.
              </p>
            )}
          </div>
        </div>

        <ClientPreview hours={previewHours} now={now} draftShown={canEdit && dirty} />
      </div>

      {canEdit && "problem" in parsed && dirty ? (
        <p
          className="text-body text-error m-0 mt-4"
          role="alert"
          data-testid="operating-problem"
        >
          {parsed.problem}
        </p>
      ) : null}

      {canEdit && dirty && changes.length ? (
        <div className="mt-4" data-testid="operating-changes">
          <p className="text-body text-text-primary m-0" style={medium}>
            Saving changes
          </p>
          <ul className="text-body text-text-secondary m-0 mt-1 flex flex-col gap-0.5 pl-5">
            {changes.map((change) => (
              <li key={change}>{change.replace(/^\w/, (c) => c.toUpperCase())}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {canEdit ? (
        <Field className="mt-4 max-w-xl">
          <FieldLabel htmlFor="operating-note">Why (optional)</FieldLabel>
          <Input
            id="operating-note"
            value={note}
            maxLength={300}
            disabled={busy || Boolean(disabled)}
            placeholder="For example: Christmas closure"
            onChange={(event) => setNote(event.target.value)}
          />
          <FieldDescription>
            Saved in Audit Logs beside the list of what changed.
          </FieldDescription>
        </Field>
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
            disabled={busy || Boolean(disabled) || !dirty || "problem" in parsed}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save operating hours"}
          </Button>
          <Button
            variant="ghost"
            disabled={busy || !dirty}
            onClick={() => {
              setDraft(operatingDraft(stored));
              setNote("");
              setError(null);
              setOk(null);
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
    </HoursSection>
  );
}

// ---------------------------------------------------------------------------
// The week chart
// ---------------------------------------------------------------------------

/** The date (Manila day key) each weekday next falls on, today included. */
function nextDates(now: number): Record<number, string> {
  const dates: Record<number, string> = {};
  for (let offset = 0; offset < 7; offset += 1) {
    const key = manilaDayKey(now + offset * DAY_MS);
    dates[weekdayOf(key)] = key;
  }
  return dates;
}

function WeekChart({
  draft,
  canEdit,
  locked,
  problemField,
  now,
  closures,
  onDay,
}: {
  draft: OperatingDraft;
  canEdit: boolean;
  locked: boolean;
  problemField: string | null;
  now: number;
  closures: OperatingDraft["closures"];
  onDay: (day: number, patch: Partial<DayDraft>) => void;
}) {
  const today = manilaDayKey(now);
  const todayWeekday = weekdayOf(today);
  const nowMinute = Math.round((now - (manilaInstant(today, "00:00") ?? now)) / 60_000);
  const dates = nextDates(now);

  return (
    <div className="mt-2" data-testid="operating-week">
      {/* The shared axis, aligned over the tracks on wide screens. */}
      <div
        className="hidden md:grid md:grid-cols-[minmax(9rem,auto)_20rem_minmax(0,1fr)] md:gap-3"
        aria-hidden
      >
        <span />
        <span />
        <div className="relative h-5">
          {AXIS.map((mark) => (
            <span
              key={`${mark.minute}-${mark.label}`}
              className="text-caption text-text-muted absolute top-0 whitespace-nowrap"
              style={{
                left: `${(mark.minute / 1440) * 100}%`,
                transform:
                  mark.minute === 0
                    ? "none"
                    : mark.minute === 1440
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
              }}
            >
              {mark.label}
            </span>
          ))}
        </div>
      </div>
      <ul className="m-0 flex list-none flex-col p-0" aria-label="Operating hours by day">
        {WEEKDAYS.map(({ day, long }) => {
          const row = draft.days[day];
          const opens = timeToMinutes(row.opens);
          const closes = timeToMinutes(row.closes, true);
          const drawable =
            row.open && opens !== null && closes !== null && closes > opens;
          const invalid = problemField === `day-${day}`;
          const isToday = day === todayWeekday;
          const date = dates[day];
          const closedForDate = date && isClosureDay({ closures }, date);
          const switchId = `operating-day-${day}`;
          return (
            <li
              key={day}
              className="grid grid-cols-1 items-center gap-x-3 gap-y-1 border-b border-outline-subtle py-2 last:border-b-0 md:grid-cols-[minmax(9rem,auto)_20rem_minmax(0,1fr)]"
              data-testid={`operating-day-${day}`}
            >
              <div className="flex min-h-11 items-center gap-3">
                {canEdit ? (
                  <Switch
                    id={switchId}
                    checked={row.open}
                    disabled={locked}
                    aria-label={`Open on ${long}`}
                    onCheckedChange={(open) => onDay(day, { open: Boolean(open) })}
                  />
                ) : null}
                <span className="flex flex-col">
                  <label
                    htmlFor={canEdit ? switchId : undefined}
                    className="text-body text-text-primary"
                    style={medium}
                  >
                    {long}
                  </label>
                  {isToday ? (
                    <span className="text-caption text-text-muted">Today</span>
                  ) : null}
                </span>
              </div>

              <div className="flex min-h-11 flex-wrap items-center gap-2">
                {row.open && canEdit ? (
                  <>
                    <Input
                      type="time"
                      className={cn("w-[8.75rem]", invalid && "border-error")}
                      aria-label={`${long} opens`}
                      aria-invalid={invalid || undefined}
                      value={row.opens}
                      disabled={locked}
                      onChange={(event) => onDay(day, { opens: event.target.value })}
                    />
                    <span className="text-body text-text-muted">to</span>
                    <Input
                      type="time"
                      className={cn("w-[8.75rem]", invalid && "border-error")}
                      aria-label={`${long} closes`}
                      aria-invalid={invalid || undefined}
                      value={row.closes}
                      disabled={locked}
                      onChange={(event) => onDay(day, { closes: event.target.value })}
                    />
                  </>
                ) : row.open && drawable ? (
                  <span className="text-body text-text-primary tabular-nums">
                    {clockLabel(opens)} to {clockLabel(closes)}
                  </span>
                ) : (
                  <span className="text-body text-text-muted">Closed</span>
                )}
              </div>

              <div className="flex min-w-0 flex-col gap-1">
                <div
                  className="relative h-4 overflow-hidden rounded-pill bg-surface-variant"
                  aria-hidden
                >
                  {[360, 720, 1080].map((minute) => (
                    <span
                      key={minute}
                      className="absolute top-0 bottom-0 w-px bg-outline"
                      style={{ left: `${(minute / 1440) * 100}%` }}
                    />
                  ))}
                  {drawable ? (
                    // A closure this week leaves only the outline of the usual hours.
                    <span
                      className="absolute top-0 bottom-0 rounded-pill"
                      style={{
                        left: `${(opens / 1440) * 100}%`,
                        width: `${((closes - opens) / 1440) * 100}%`,
                        ...(closedForDate
                          ? { border: `1px dashed ${OPEN_EDGE}` }
                          : {
                              background: OPEN_FILL,
                              boxShadow: `inset 0 0 0 1px ${OPEN_EDGE}`,
                            }),
                      }}
                    />
                  ) : null}
                  {isToday ? (
                    <span
                      className="absolute -top-px -bottom-px w-0.5 bg-foreground"
                      style={{
                        left: `${(Math.min(Math.max(nowMinute, 0), 1439) / 1440) * 100}%`,
                      }}
                      data-testid="operating-now-mark"
                    />
                  ) : null}
                </div>
                {closedForDate && row.open ? (
                  <span className="text-caption text-text-secondary">
                    Closed {isToday ? "today" : `this ${long}`} for a closure
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Closures
// ---------------------------------------------------------------------------

function ClosureList({
  closures,
  canEdit,
  locked,
  problemField,
  today,
  onChange,
}: {
  closures: OperatingDraft["closures"];
  canEdit: boolean;
  locked: boolean;
  problemField: string | null;
  today: string;
  onChange: (closures: OperatingDraft["closures"]) => void;
}) {
  if (!canEdit) {
    return closures.length ? (
      <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0" aria-label="Closures">
        {closures.map((closure) => (
          <li
            key={`${closure.startDay}-${closure.endDay}`}
            className="text-body text-text-primary"
          >
            {closureLabel(closure)}
            {closure.endDay < today ? (
              <span className="text-text-muted"> (passed)</span>
            ) : null}
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-body text-text-secondary m-0 mt-2">No closures set.</p>
    );
  }
  return (
    <>
      {closures.length ? (
        <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0" aria-label="Closures">
          {closures.map((closure, index) => {
            const invalid = problemField === `closure-${index}`;
            const length = closureLength(closure);
            const passed = closure.endDay !== "" && closure.endDay < today;
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
                    onChange(
                      closures.map((row, at) =>
                        at === index
                          ? {
                              startDay: event.target.value,
                              // A one-day closure is the common case.
                              endDay:
                                !row.endDay || row.endDay < event.target.value
                                  ? event.target.value
                                  : row.endDay,
                            }
                          : row,
                      ),
                    )
                  }
                />
                <span className="text-body text-text-muted">to</span>
                <Input
                  type="date"
                  className={cn("w-44", invalid && "border-error")}
                  aria-label={`Closure ${index + 1} last day`}
                  aria-invalid={invalid || undefined}
                  value={closure.endDay}
                  min={closure.startDay || undefined}
                  disabled={locked}
                  onChange={(event) =>
                    onChange(
                      closures.map((row, at) =>
                        at === index ? { ...row, endDay: event.target.value } : row,
                      ),
                    )
                  }
                />
                {length !== null ? (
                  <span className="text-caption text-text-secondary tabular-nums">
                    {length === 1 ? "1 day" : `${length} days`}
                    {passed ? ", passed" : ""}
                  </span>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={locked}
                  aria-label={`Remove closure ${index + 1}`}
                  onClick={() => onChange(closures.filter((_, at) => at !== index))}
                >
                  <X aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-body text-text-secondary m-0 mt-2">No closures set.</p>
      )}
      <Button
        variant="ghost"
        className="mt-1"
        disabled={locked || closures.length >= CLOSURE_RANGES_MAX}
        onClick={() => onChange([...closures, { startDay: "", endDay: "" }])}
      >
        <Plus aria-hidden />
        Add a closure
      </Button>
    </>
  );
}

// ---------------------------------------------------------------------------
// What clients are told
// ---------------------------------------------------------------------------

type Sample = "now" | "evening" | "weekend" | "closure" | "custom";

/** The first instant at or after `from` that falls on a closed hour, for the "Tonight" sample. */
function sampleInstant(
  sample: Sample,
  hours: OperatingHours,
  now: number,
  custom: { day: string; time: string },
): number {
  const today = manilaDayKey(now);
  if (sample === "evening") {
    const at = manilaInstant(today, "20:00") ?? now;
    return at > now ? at : at + DAY_MS;
  }
  if (sample === "weekend") {
    // The next Saturday, half an hour before Saturday's closing (or 4:30 PM).
    for (let offset = 0; offset < 8; offset += 1) {
      const key = manilaDayKey(now + offset * DAY_MS);
      if (weekdayOf(key) !== 6) continue;
      const window = hours.schedule.week.find((row) => row.weekday === 6);
      const minute = window
        ? Math.max(window.opensMinute, window.closesMinute - 30)
        : 990;
      const at = (manilaInstant(key, "00:00") ?? now) + minute * 60_000;
      if (at > now) return at;
    }
  }
  if (sample === "closure") {
    const next = upcomingClosure(hours, now);
    if (next) {
      // The evening before the closure starts.
      const at = manilaInstant(next.startDay, "00:00");
      if (at !== null) return Math.max(now, at - 4 * 60 * 60 * 1000);
    }
  }
  if (sample === "custom") {
    return manilaInstant(custom.day, custom.time) ?? now;
  }
  return now;
}

function upcomingClosure(hours: OperatingHours, now: number) {
  const today = manilaDayKey(now);
  return [...(hours.schedule.closures ?? [])]
    .filter((closure) => closure.endDay >= today)
    .sort((a, b) => a.startDay.localeCompare(b.startDay))[0];
}

function ClientPreview({
  hours,
  now,
  draftShown,
}: {
  hours: OperatingHours;
  now: number;
  draftShown: boolean;
}) {
  const [sample, setSample] = useState<Sample>("now");
  const [custom, setCustom] = useState(() => ({
    day: manilaDayKey(Date.now()),
    time: "19:00",
  }));
  const hasClosure = Boolean(upcomingClosure(hours, now));
  const choice = sample === "closure" && !hasClosure ? "now" : sample;
  const at = useMemo(
    () => sampleInstant(choice, hours, now, custom),
    [choice, hours, now, custom],
  );
  const timing = reviewTimingAt(hours, at);

  return (
    <aside
      className="flex flex-col gap-3 rounded-card bg-surface-variant p-3 lg:sticky lg:top-3"
      aria-labelledby="operating-preview-heading"
      data-testid="operating-preview"
    >
      <div>
        <h3
          id="operating-preview-heading"
          className="text-body text-text-primary m-0"
          style={medium}
        >
          What a client is told
        </h3>
        <p className="text-caption text-text-muted m-0 mt-0.5">
          {draftShown
            ? "Follows your unsaved changes."
            : "Pick when the order is placed."}
        </p>
      </div>

      <ToggleGroup
        value={[choice]}
        onValueChange={(values) => {
          const next = values[0] as Sample | undefined;
          if (next) setSample(next);
        }}
        variant="outline"
        spacing={1}
        className="flex-wrap"
        aria-label="When the order is placed"
      >
        <ToggleGroupItem value="now">Now</ToggleGroupItem>
        <ToggleGroupItem value="evening">8 PM</ToggleGroupItem>
        <ToggleGroupItem value="weekend">Saturday</ToggleGroupItem>
        {hasClosure ? (
          <ToggleGroupItem value="closure">Before a closure</ToggleGroupItem>
        ) : null}
        <ToggleGroupItem value="custom">Pick a time</ToggleGroupItem>
      </ToggleGroup>

      {choice === "custom" ? (
        <div className="flex flex-wrap gap-2">
          <Input
            type="date"
            className="w-44 bg-card"
            aria-label="Order placed on"
            value={custom.day}
            onChange={(event) => setCustom((c) => ({ ...c, day: event.target.value }))}
          />
          <Input
            type="time"
            className="w-[8.75rem] bg-card"
            aria-label="Order placed at"
            value={custom.time}
            onChange={(event) => setCustom((c) => ({ ...c, time: event.target.value }))}
          />
        </div>
      ) : null}

      <p className="text-body text-text-secondary m-0">
        Order placed{" "}
        <span className="text-text-primary" style={medium}>
          {choice === "now" ? `now (${manilaWhen(at)})` : manilaWhen(at)}
        </span>
      </p>

      {!timing ? (
        <p className="text-body text-text-secondary m-0">
          GRIDGO does not open within a year on these hours.
        </p>
      ) : (
        <div
          className="flex flex-col gap-2 rounded-card border border-outline bg-card p-3"
          data-testid="operating-preview-result"
        >
          {timing.isOpenNow ? (
            <>
              <StatusChip tone="success" icon="circle-check" label="Open: no notice" />
              <p className="text-body text-text-primary m-0">
                Checkout shows no notice. Artwork review starts straight away and is done
                by {manilaTime(timing.reviewCompletesAt)}.
              </p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <StatusChip tone="info" icon="clock" label="Outside operating hours" />
                {timing.reviewDelayed ? (
                  <StatusChip
                    tone="warning"
                    icon="triangle-alert"
                    label="Review delayed"
                  />
                ) : null}
              </div>
              <p className="text-body text-text-primary m-0">
                Checkout says GRIDGO is closed. Their artwork is reviewed{" "}
                <span style={medium}>{manilaWhen(timing.scheduledReviewAt)}</span>, done
                by {manilaTime(timing.reviewCompletesAt)}.
              </p>
              <p className="text-body text-text-secondary m-0">
                Payment still goes through. Until the review, their order reads
                &ldquo;Waiting for review&rdquo;.
              </p>
              {timing.reviewDelayed ? (
                <p className="text-body text-text-secondary m-0">
                  A closure pushes this review past the usual next opening.
                </p>
              ) : null}
            </>
          )}
          <p className="text-caption text-text-muted m-0">
            Their ready-by estimate starts when this review is done, then adds the
            shop&rsquo;s production time
            {typeof hours.sameDayPromiseAllowanceMinutes === "number"
              ? `, the promise margin (${durationWords(hours.sameDayPromiseAllowanceMinutes)} for same-day work)`
              : ""}{" "}
            and delivery. Deadline dates that cannot be met are greyed out with the
            reason.
          </p>
        </div>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------

function ReadOnlyLine({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-body text-text-primary" style={medium}>
        {label}
      </span>
      <span className="text-body text-text-secondary">
        {value}
        {note ? ` ${note}` : ""}
      </span>
    </div>
  );
}

function HoursSection({
  children,
  status,
}: {
  children: React.ReactNode;
  status?: React.ReactNode;
}) {
  return (
    <section className="gg-card p-3" aria-labelledby="operating-hours-heading">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="operating-hours-heading" className="text-h3 text-text-primary m-0">
          Operating hours
        </h2>
        {status}
      </div>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
        When GRIDGO&rsquo;s team works. Artwork is reviewed and riders are dispatched only
        in these hours, and new orders&rsquo; shop clocks (the hour to accept, reminders,
        lateness) count open time only. The client&rsquo;s issue window and checkout hold
        still run around the clock.
      </p>
      {children}
    </section>
  );
}
