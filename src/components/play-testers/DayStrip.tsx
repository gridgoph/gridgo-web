import { Check, X } from "lucide-react";

import type { TesterDay, TesterDayState } from "@/lib/api/play-testers";
import { manilaToday } from "@/lib/audit";
import { DAY_STATE_LABEL, longDay, shortDay } from "@/lib/play-testers";
import { cn } from "@/lib/utils";

const BOX: Record<TesterDayState, string> = {
  checked_in: "bg-success text-white",
  missed: "bg-error text-white",
  today: "border-2 border-dashed border-text-primary",
  before_start: "bg-surface-variant",
};

/** One day's square. Glyph + shape carry the state in greyscale, not colour alone. */
export function DayBox({ state, className }: { state: TesterDayState; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-[4px]",
        BOX[state],
        className,
      )}
    >
      {state === "checked_in" ? <Check size={12} strokeWidth={3} /> : null}
      {state === "missed" ? <X size={12} strokeWidth={3} /> : null}
    </span>
  );
}

function summary(days: TesterDay[]): string {
  const count = (state: TesterDayState) => days.filter((d) => d.state === state).length;
  const parts = [`${count("checked_in")} checked in`, `${count("missed")} missed`];
  const today = days.find((d) => d.state === "today");
  if (today) parts.push("today not yet");
  return `Last ${days.length} days: ${parts.join(", ")}`;
}

/**
 * A tester's 14 GRIDGO check-in days, oldest first. Red is a missed daily
 * open on our streak, never a reset of Google's clock.
 */
export function DayStrip({ days }: { days: TesterDay[] }) {
  const first = days[0];
  const last = days[days.length - 1];
  return (
    <div className="flex w-max flex-col gap-1">
      <ol className="m-0 flex list-none gap-[2px] p-0" aria-label={summary(days)}>
        {days.map((day) => (
          <li
            key={day.date}
            title={`${longDay(day.date)}: ${DAY_STATE_LABEL[day.state]}`}
            aria-label={`${longDay(day.date)}: ${DAY_STATE_LABEL[day.state]}`}
          >
            <DayBox state={day.state} />
          </li>
        ))}
      </ol>
      {first && last ? (
        <div className="text-caption text-text-muted flex justify-between tabular-nums" aria-hidden>
          <span>{shortDay(first.date)}</span>
          <span>{last.state === "today" || last.date === manilaToday() ? "Today" : shortDay(last.date)}</span>
        </div>
      ) : null}
    </div>
  );
}

/** The key under the stats: four squares, four words. */
export function DayLegend() {
  const states: TesterDayState[] = ["checked_in", "missed", "today", "before_start"];
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0" aria-label="Day key">
      {states.map((state) => (
        <li key={state} className="text-caption text-text-secondary flex items-center gap-1.5">
          <DayBox state={state} />
          {DAY_STATE_LABEL[state]}
        </li>
      ))}
    </ul>
  );
}
