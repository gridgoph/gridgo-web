import type { WeeklyWindow } from "@/lib/api/types";
import { WEEKDAYS } from "@/lib/hub-pickup";
import { timeLabel } from "@/lib/shop-hours";
import { cn } from "@/lib/utils";

const DAY = 1440;
const percent = (minute: number) => `${(Math.min(Math.max(minute, 0), DAY) / DAY) * 100}%`;

/**
 * The week, Monday first: each day's hours as words and as a thin bar on the
 * same midnight-to-midnight scale as today's ruler, so a short or late day
 * stands out. Today is marked in words, never by colour alone.
 */
export function WeekStrip({
  week,
  todayWeekday,
}: {
  week: readonly WeeklyWindow[];
  todayWeekday: number;
}) {
  const byDay = new Map(week.map((row) => [row.weekday, row]));
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Weekly hours">
      {WEEKDAYS.map(({ day, short, long }) => {
        const row = byDay.get(day);
        const isToday = day === todayWeekday;
        return (
          <li
            key={day}
            className={cn(
              "grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-field px-2 py-1.5 md:grid-cols-[3.25rem_11rem_minmax(0,1fr)]",
              isToday && "bg-surface-variant",
            )}
          >
            <span className="flex flex-col">
              <span
                className="text-body text-text-primary"
                style={{ fontFamily: "var(--font-medium)" }}
              >
                <span aria-hidden>{short}</span>
                <span className="sr-only">{long}</span>
              </span>
              {isToday ? <span className="text-caption text-text-muted">Today</span> : null}
            </span>
            <span
              className={cn(
                "text-body tabular-nums",
                row ? "text-text-primary" : "text-text-muted",
              )}
            >
              {row ? `${timeLabel(row.opensMinute)} to ${timeLabel(row.closesMinute)}` : "Closed"}
            </span>
            <span
              className="relative col-span-2 h-2 overflow-hidden rounded-pill bg-surface-variant md:col-span-1"
              aria-hidden
            >
              {row ? (
                <span
                  className="absolute top-0 bottom-0 rounded-pill"
                  style={{
                    left: percent(row.opensMinute),
                    width: percent(row.closesMinute - row.opensMinute),
                    background: "var(--season-track-busy)",
                    boxShadow: "inset 0 0 0 1px var(--color-info)",
                  }}
                />
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Seven letters, Monday first, the open days filled: a whole week at a glance
 * in a table cell. The open days are also said in the accessible name.
 */
export function WeekLetters({
  week,
  todayWeekday,
  label,
}: {
  week: readonly WeeklyWindow[];
  todayWeekday: number;
  label: string;
}) {
  const open = new Set(week.map((row) => row.weekday));
  return (
    <span role="img" aria-label={label} className="inline-flex gap-0.5">
      {WEEKDAYS.map(({ day, short }) => (
        <span
          key={day}
          aria-hidden
          className={cn(
            "inline-flex size-5 items-center justify-center rounded-[5px] text-[11px] leading-none",
            open.has(day)
              ? "text-text-primary"
              : "text-text-muted border border-dashed border-outline",
            day === todayWeekday && "underline decoration-2 underline-offset-[3px]",
          )}
          style={
            open.has(day)
              ? {
                  background: "var(--season-track-busy)",
                  boxShadow: "inset 0 0 0 1px var(--color-info)",
                  fontFamily: "var(--font-medium)",
                }
              : undefined
          }
        >
          {short.charAt(0)}
        </span>
      ))}
    </span>
  );
}
