"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ShopHours } from "@/lib/api/types";
import { WEEKDAYS } from "@/lib/hub-pickup";
import {
  dayLengthLabel,
  manilaClock,
  openDaysLabel,
  timeChoices,
  timeLabel,
  validateWeekDraft,
  weekDraftChanged,
  weekDraftOf,
  type WeekDraft,
} from "@/lib/shop-hours";

type Props = {
  hours: ShopHours;
  now: number;
  saving: boolean;
  /** Saves the week; resolves to a refusal, or null once saved. */
  onSave: (draft: WeekDraft) => Promise<string | null>;
};

/**
 * The days the shop opens and one opening and closing time for all of them.
 *
 * GRIDGO counts production days on these hours and, for now, needs every open
 * day to be the same length, so there is one pair of times, not one per day.
 */
export function WeeklyHoursCard({ hours, now, saving, onSave }: Props) {
  const saved = weekDraftOf(hours.week);
  // Null follows what the API holds, so a newer answer replaces an untouched
  // week while an edit in progress is kept.
  const [edited, setEdited] = useState<WeekDraft | null>(null);
  const draft = edited ?? saved.draft;
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const changed = weekDraftChanged(hours.week, draft);
  const today = manilaClock(now).weekday;
  const valid = draft.closesMinute > draft.opensMinute;

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
    if (refused) setError(refused);
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
          Pick the days you open. Every open day keeps the same hours.
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
          {WEEKDAYS.map(({ day, short, long }) => (
            <ToggleGroupItem
              key={day}
              value={String(day)}
              aria-label={day === today ? `${long}, today` : long}
              variant="outline"
              className="min-h-11 min-w-14 flex-1 flex-col gap-0 data-[pressed]:border-foreground"
            >
              <span>{short}</span>
              {day === today ? (
                <span className="text-caption text-text-muted" aria-hidden>
                  Today
                </span>
              ) : null}
            </ToggleGroupItem>
          ))}
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

      <p className="text-body text-text-primary m-0" aria-live="polite">
        {draft.days.length && valid
          ? `${openDaysLabel(draft.days)}, ${timeLabel(draft.opensMinute)} to ${timeLabel(draft.closesMinute)}: ${dayLengthLabel(draft.closesMinute - draft.opensMinute)} a day.`
          : draft.days.length
            ? "Pick a closing time later than the opening time."
            : "No open days picked yet."}
      </p>

      {saved.uneven ? (
        <p className="rounded-field bg-surface-variant text-caption text-text-secondary m-0 p-3">
          Your saved hours differ from day to day. Saving here gives every open day the hours above.
        </p>
      ) : null}

      <p className="text-caption text-text-muted m-0">
        A shorter day, such as a half-day Saturday, is not available yet.
      </p>

      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
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
