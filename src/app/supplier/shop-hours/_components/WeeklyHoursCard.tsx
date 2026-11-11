"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ShopHours } from "@/lib/api/types";
import { WEEKDAYS } from "@/lib/hub-pickup";
import {
  changedOwnDay,
  draftDayHours,
  manilaClock,
  timeChoices,
  timeLabel,
  validateWeekDraft,
  weekDraftChanged,
  weekDraftOf,
  withOwnHours,
  type DayHours,
  type WeekDraft,
  type WeekProblem,
} from "@/lib/shop-hours";
import { cn } from "@/lib/utils";

type Props = {
  hours: ShopHours;
  now: number;
  saving: boolean;
  /** Saves the week; resolves to a refusal, or null once saved. */
  onSave: (draft: WeekDraft) => Promise<string | null>;
};

/**
 * The days the shop opens, its usual hours, and any day with its own.
 *
 * GRIDGO counts production days on the usual hours, so they are one pair of
 * times for every open day; a half-day Saturday is that day's "Different
 * hours" switch, saved as an override for that weekday only. The week below
 * the usual times is the whole week at a glance: usual days muted, a day with
 * its own hours in ink.
 */
export function WeeklyHoursCard({ hours, now, saving, onSave }: Props) {
  const saved = weekDraftOf(hours.week, hours.overrides);
  // Null follows what the API holds, so a newer answer replaces an untouched
  // week while an edit in progress is kept.
  const [edited, setEdited] = useState<WeekDraft | null>(null);
  const draft = edited ?? saved.draft;
  const [error, setError] = useState<WeekProblem | null>(null);
  const [done, setDone] = useState(false);
  const changed = weekDraftChanged(hours, draft);
  const today = manilaClock(now).weekday;

  function edit(patch: Partial<WeekDraft>) {
    setEdited({ ...draft, ...patch });
    setError(null);
    setDone(false);
  }

  async function save() {
    const problem = validateWeekDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    const refused = await onSave(draft);
    if (refused) setError({ weekday: changedOwnDay(hours, draft), message: refused });
    else {
      setEdited(null);
      setDone(true);
    }
  }

  return (
    <section
      className="rounded-card border border-outline bg-surface flex flex-col gap-4 p-4"
      aria-labelledby="weekly-hours-heading"
    >
      <div className="flex flex-col gap-1">
        <h2 id="weekly-hours-heading" className="text-h3 text-text-primary m-0">
          Weekly hours
        </h2>
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Pick the days you open.
        </p>
      </div>

      <Field>
        <FieldLabel id="open-days-label">Open days</FieldLabel>
        <ToggleGroup
          multiple
          aria-labelledby="open-days-label"
          className="flex w-full flex-wrap"
          value={draft.days.map(String)}
          disabled={saving}
          onValueChange={(values) => edit({ days: values.map(Number).sort((a, b) => a - b) })}
        >
          {WEEKDAYS.map(({ day, short, long }) => {
            const open = draft.days.includes(day);
            return (
              <ToggleGroupItem
                key={day}
                value={String(day)}
                aria-label={day === today ? `${long}, today` : long}
                variant="outline"
                className={cn(
                  "min-h-11 min-w-14 flex-1 flex-col gap-0",
                  open
                    ? "border-[var(--color-info)] bg-[var(--season-track-busy)] aria-pressed:bg-[var(--season-track-busy)] hover:bg-[var(--season-track-peak)]"
                    : "border-dashed text-text-muted",
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {open ? <Check aria-hidden className="size-3.5" /> : null}
                  {short}
                </span>
                {day === today ? (
                  <span className="text-caption text-text-muted" aria-hidden>
                    Today
                  </span>
                ) : null}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TimeField
          id="week-opens"
          label="Opens"
          value={draft.opensMinute}
          disabled={saving}
          onChange={(opensMinute) => edit({ opensMinute })}
        />
        <TimeField
          id="week-closes"
          label="Closes"
          value={draft.closesMinute}
          disabled={saving}
          onChange={(closesMinute) => edit({ closesMinute })}
        />
      </div>

      {error && error.weekday == null ? <FieldError message={error.message} /> : null}

      {draft.days.length ? (
        <div className="flex flex-col" role="group" aria-labelledby="different-hours-label">
          <p id="different-hours-label" className="text-overline text-text-muted m-0 pb-1">
            Different hours
          </p>
          {WEEKDAYS.filter(({ day }) => draft.days.includes(day)).map(({ day, short, long }) => {
            const own = draft.own?.[day] != null;
            const dayHours = draftDayHours(draft, day);
            return (
              <DayRow
                key={day}
                weekday={day}
                short={short}
                long={long}
                isToday={day === today}
                hours={dayHours}
                different={own}
                disabled={saving}
                error={error && error.weekday === day ? error.message : null}
                onToggle={(next) => {
                  setEdited(withOwnHours(draft, day, next ? dayHours : null));
                  setError(null);
                  setDone(false);
                }}
                onChange={(next) => {
                  setEdited(withOwnHours(draft, day, next));
                  setError(null);
                  setDone(false);
                }}
              />
            );
          })}
        </div>
      ) : (
        <p className="text-body text-text-secondary m-0">No open days picked yet.</p>
      )}

      {saved.uneven ? (
        <p className="rounded-field bg-surface-variant text-caption text-text-secondary m-0 p-3">
          Some days are saved with two opening times. Saving here gives each day one.
        </p>
      ) : null}
      {done && !changed ? (
        <p className="text-caption text-success m-0" role="status">
          Weekly hours saved. New jobs are timed on them; jobs you already accepted keep their dates.
        </p>
      ) : null}

      {changed ? (
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save weekly hours"}
          </Button>
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => {
              setEdited(null);
              setError(null);
            }}
          >
            Undo changes
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <p className="text-body text-error m-0" role="alert">
      {message}
    </p>
  );
}

/**
 * One open day: its hours at a glance and its "Different hours" switch. On,
 * the day's own opening and closing fields open under it, with any problem
 * with that day said right there.
 */
function DayRow({
  weekday,
  short,
  long,
  isToday,
  hours,
  different,
  disabled,
  error,
  onToggle,
  onChange,
}: {
  weekday: number;
  short: string;
  long: string;
  isToday: boolean;
  hours: DayHours;
  different: boolean;
  disabled: boolean;
  error: string | null;
  onToggle: (different: boolean) => void;
  onChange: (hours: DayHours) => void;
}) {
  const id = `day-${weekday}`;
  return (
    <div className="flex flex-col gap-3 border-t border-outline-subtle py-3">
      <div className="flex min-h-11 items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="text-body text-text-primary w-12 shrink-0 font-bold">
            {short}
            {isToday ? <span className="text-caption text-text-muted block font-medium">Today</span> : null}
          </span>
          <span
            className={cn(
              "text-body min-w-0 truncate",
              different ? "text-text-primary font-medium" : "text-text-muted",
            )}
          >
            {timeLabel(hours.opensMinute)}–{timeLabel(hours.closesMinute)}
          </span>
        </div>
        <span className="flex min-h-11 min-w-11 shrink-0 items-center justify-center">
          <Switch
            id={`${id}-different`}
            aria-label={`${long}, different hours`}
            checked={different}
            disabled={disabled}
            onCheckedChange={(checked) => onToggle(Boolean(checked))}
          />
        </span>
      </div>
      {different ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TimeField
            id={`${id}-opens`}
            label={`${long} opens`}
            value={hours.opensMinute}
            disabled={disabled}
            onChange={(opensMinute) => onChange({ ...hours, opensMinute })}
          />
          <TimeField
            id={`${id}-closes`}
            label={`${long} closes`}
            value={hours.closesMinute}
            disabled={disabled}
            onChange={(closesMinute) => onChange({ ...hours, closesMinute })}
          />
        </div>
      ) : null}
      {error ? <FieldError message={error} /> : null}
    </div>
  );
}

function TimeField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  disabled: boolean;
  onChange: (minute: number) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={String(value)}
        disabled={disabled}
        onValueChange={(next) => next != null && onChange(Number(next))}
      >
        <SelectTrigger id={id} className="min-h-11 w-full">
          <SelectValue>{(next) => timeLabel(Number(next))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {timeChoices(value).map((minute) => (
            <SelectItem key={minute} value={String(minute)}>
              {timeLabel(minute)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
