"use client";

import { useState } from "react";

import { DispatchNotice } from "@/components/shop-hours/DispatchNotice";
import type { ConfirmRequest } from "@/components/shop-hours/useConfirm";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ShopHours, WeeklyWindow } from "@/lib/api/types";
import {
  EXTENSION_LEAD_MINUTES,
  extensionPastGridgoHours,
  extensionState,
  timeLabel,
} from "@/lib/shop-hours";

type Props = {
  hours: ShopHours;
  now: number;
  saving: boolean;
  /** GRIDGO's own review and delivery hours, when `GET /settings` sent them. */
  operatingWeek: WeeklyWindow[] | null;
  ask: (request: ConfirmRequest) => Promise<boolean>;
  /** Sets (a minute) or ends (null) today's extension; resolves to a refusal, or null once saved. */
  onSave: (closesMinute: number | null) => Promise<string | null>;
};

/**
 * Staying open later, today only.
 *
 * The API's rules are said before the shop picks, not after it is refused: a
 * day the shop already opens, later than its usual close, before midnight and
 * at least 30 minutes from now. Only those times are offered.
 */
export function ExtendTodayCard({ hours, now, saving, operatingWeek, ask, onSave }: Props) {
  const state = extensionState(hours, now);
  const [picked, setPicked] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = state.kind === "available" ? state.current : null;
  const choices = state.kind === "available" ? state.choices : [];
  const fallback =
    current && choices.includes(current.closesMinute) ? current.closesMinute : (choices[0] ?? null);
  const until = picked != null && choices.includes(picked) ? picked : fallback;
  const pastGridgo = until != null ? extensionPastGridgoHours(until, operatingWeek, now) : null;

  async function extend() {
    if (until == null) return;
    const refused = await onSave(until);
    setError(refused);
    if (!refused) setPicked(null);
  }

  async function end() {
    if (!current) return;
    const confirmed = await ask({
      title: `End today's extension to ${timeLabel(current.closesMinute)}?`,
      body:
        state.kind === "available"
          ? `Your shop closes at its usual ${timeLabel(state.normalClose)} today. Jobs you already accepted keep their dates.`
          : "Your shop goes back to its usual hours today.",
      confirmLabel: "End extension",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (!confirmed) return;
    setError(await onSave(null));
  }

  return (
    <section
      className="rounded-card border border-outline bg-surface flex flex-col gap-4 p-4"
      aria-labelledby="extend-today-heading"
    >
      <div className="flex flex-col gap-1">
        <h2 id="extend-today-heading" className="text-h3 text-text-primary m-0">
          Stay open later today
        </h2>
        <p className="text-body text-text-secondary m-0 max-w-prose">
          {state.kind === "available"
            ? `You usually close at ${timeLabel(state.normalClose)}. Extend today only; tomorrow goes back to your weekly hours.`
            : "Extend a day you open, for today only."}
        </p>
      </div>

      {state.kind === "unavailable" ? (
        <p className="rounded-field bg-surface-variant text-body text-text-secondary m-0 p-3">
          {state.reason}
        </p>
      ) : null}

      {current ? (
        <div className="rounded-field bg-surface-variant flex flex-col gap-1 p-3">
          <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-bold)" }}>
            Open until {timeLabel(current.closesMinute)} today
          </p>
          <p className="text-caption text-text-muted m-0">
            New jobs are timed with these extra hours. Jobs you already accepted keep their dates.
          </p>
        </div>
      ) : null}

      {current && hours.dispatchWaits ? <DispatchNotice /> : null}

      {state.kind === "available" && choices.length ? (
        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="extend-until">{current ? "Change to" : "Stay open until"}</FieldLabel>
            <Select
              value={until != null ? String(until) : null}
              onValueChange={(value) => {
                if (value == null) return;
                setPicked(Number(value));
                setError(null);
              }}
              disabled={saving}
            >
              <SelectTrigger id="extend-until" className="min-h-11 w-full sm:w-56">
                <SelectValue>
                  {(value) => (value == null ? "Pick a time" : timeLabel(Number(value)))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {choices.map((minute) => (
                  <SelectItem key={minute} value={String(minute)}>
                    {timeLabel(minute)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-caption text-text-muted m-0">
              Today only. At least {EXTENSION_LEAD_MINUTES} minutes from now, and before midnight.
            </p>
          </Field>
          {until != null && pastGridgo && !(current && hours.dispatchWaits) ? (
            <DispatchNotice />
          ) : null}
          {until != null && until !== current?.closesMinute ? (
            <div>
              <Button variant="secondary" disabled={saving} onClick={() => void extend()}>
                {saving ? "Saving…" : `Extend today's hours until ${timeLabel(until)}`}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {state.kind === "available" && !choices.length && current ? (
        <p className="text-caption text-text-muted m-0">
          It is too late to move it again today: a new time has to be at least{" "}
          {EXTENSION_LEAD_MINUTES} minutes away.
        </p>
      ) : null}

      {current ? (
        <div>
          <Button variant="secondary" disabled={saving} onClick={() => void end()}>
            End today&rsquo;s extension
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
