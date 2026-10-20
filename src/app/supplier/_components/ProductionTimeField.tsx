"use client";

import { useRef, type KeyboardEvent } from "react";
import { Minus, Plus } from "lucide-react";

import { SegmentedControl } from "@/app/supplier/_components/SegmentedControl";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_DAY_MINUTES,
  sameTime,
  stepTime,
  timeLabel,
  timeLadder,
  timeParts,
  unitStart,
  type ProductionTime,
  type ProductionUnit,
} from "@/lib/production-time";

/** Shown under the heading wherever a shop sets production time. */
export const PRODUCTION_TIME_HINT =
  "Hours for work you finish the same day, working days for anything longer. Both count only your shop's open hours.";

const UNITS = [
  { value: "hours", label: "Hours" },
  { value: "days", label: "Working days" },
] as const;

type StepperProps = {
  time: ProductionTime;
  onChange: (time: ProductionTime) => void;
  dayMinutes?: number;
  /** Names the control: "Latest production time". */
  label: string;
  /** Id of a visible label, so the figure is announced under it. */
  labelledBy?: string;
  disabled?: boolean;
};

/**
 * One production time, stepped. The steps run half hour by half hour to the
 * end of a working day and carry on in working days, so "shorter" from one
 * working day is 9½ hours rather than a wall. The figure is a spinbutton:
 * arrow keys step it, Home and End jump to the ends.
 */
export function ProductionTimeStepper({
  time,
  onChange,
  dayMinutes = DEFAULT_DAY_MINUTES,
  label,
  labelledBy,
  disabled,
}: StepperProps) {
  const ladder = timeLadder(dayMinutes, time);
  const index = Math.max(
    0,
    ladder.findIndex((step) => sameTime(step, time)),
  );
  const atStart = index === 0;
  const atEnd = index === ladder.length - 1;
  const parts = timeParts(time);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const moves: Record<string, () => ProductionTime> = {
      ArrowUp: () => stepTime(time, 1, dayMinutes),
      ArrowRight: () => stepTime(time, 1, dayMinutes),
      ArrowDown: () => stepTime(time, -1, dayMinutes),
      ArrowLeft: () => stepTime(time, -1, dayMinutes),
      Home: () => ladder[0],
      End: () => ladder[ladder.length - 1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    onChange(move());
  }

  return (
    <div
      className="border-border bg-card inline-flex h-12 max-w-full items-stretch self-start rounded-[var(--radius-field)] border"
      data-disabled={disabled || undefined}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-full rounded-r-none"
        aria-label={`Shorter ${label.toLowerCase()}`}
        disabled={disabled || atStart}
        onClick={() => onChange(stepTime(time, -1, dayMinutes))}
      >
        <Minus aria-hidden />
      </Button>
      <div
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        aria-valuemin={0}
        aria-valuemax={ladder.length - 1}
        aria-valuenow={index}
        aria-valuetext={timeLabel(time)}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        className="border-border flex min-w-36 flex-1 items-baseline justify-center gap-1.5 border-x px-3 py-2.5"
      >
        <span
          className="text-h3 text-text-primary tabular-nums"
          style={{ fontFamily: "var(--font-bold)" }}
        >
          {parts.value}
        </span>
        <span className="text-body text-text-secondary">{parts.unit}</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-full rounded-l-none"
        aria-label={`Longer ${label.toLowerCase()}`}
        disabled={disabled || atEnd}
        onClick={() => onChange(stepTime(time, 1, dayMinutes))}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  );
}

/**
 * A single production time with its unit: a category line's usual time.
 * Switching the unit lands where the shop last was in it, so a look at the
 * other unit costs nothing.
 */
export function ProductionTimePicker({
  time,
  onChange,
  dayMinutes,
  label,
  unitLabel,
  disabled,
}: StepperProps & {
  /** Names the Hours / Working days switch, distinct from any other on screen. */
  unitLabel: string;
}) {
  const last = useRef<Partial<Record<ProductionUnit, ProductionTime>>>({});
  function switchTo(unit: ProductionUnit) {
    if (unit === time.unit) return;
    last.current[time.unit] = time;
    onChange(last.current[unit] ?? unitStart(unit));
  }
  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl
        aria-label={unitLabel}
        options={UNITS}
        value={time.unit}
        onChange={switchTo}
        disabled={disabled}
      />
      <ProductionTimeStepper
        time={time}
        onChange={onChange}
        dayMinutes={dayMinutes}
        label={label}
        disabled={disabled}
      />
    </div>
  );
}
