"use client";

/**
 * GRIDGO's operating hours read back where Operations works (OPERATING_HOURS_API.md).
 *
 * Operations cannot change the hours (they are Super Admin's, on Operational
 * settings), but every file check and dispatch waits on them, so the queue
 * says whether GRIDGO is open, until when, the week, the review time and the
 * next closure.
 */

import { StatusChip } from "@/components/ui/StatusChip";
import type { OperatingHours } from "@/lib/api/types";
import {
  addOpeningMs,
  closureLabel,
  durationWords,
  isOpenAt,
  manilaDayKey,
  operatingStatusLine,
  weekSummary,
} from "@/lib/operating-hours";

export function OperatingHoursStrip({ hours, now }: { hours: OperatingHours; now: number }) {
  const open = isOpenAt(hours.schedule, now);
  const opensAt = addOpeningMs(hours.schedule, now, 0);
  const status = operatingStatusLine(
    hours,
    { isOpenNow: open, scheduledReviewAt: new Date(opensAt ?? now).toISOString() },
    now,
  );
  const today = manilaDayKey(now);
  const nextClosure = [...(hours.schedule.closures ?? [])]
    .filter((closure) => closure.endDay >= today)
    .sort((a, b) => a.startDay.localeCompare(b.startDay))[0];

  return (
    <section
      className="flex flex-col gap-1 rounded-card border border-outline bg-surface p-3"
      aria-label="Operating hours"
      data-testid="operating-hours-strip"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusChip
          tone={open ? "success" : "neutral"}
          icon={open ? "circle-check" : "clock"}
          label={status}
        />
        <span className="text-body text-text-secondary">
          {weekSummary(hours.schedule.week).join("; ")}. Reviews take{" "}
          {durationWords(hours.artworkReviewMinutes)}.
        </span>
      </div>
      <p className="text-caption text-text-muted m-0">
        {open
          ? "Waits count open hours only."
          : "Files that arrive now wait for the next opening; their clients are told when."}
        {nextClosure
          ? nextClosure.startDay <= today
            ? ` Closed today for a closure (${closureLabel(nextClosure)}).`
            : ` Next closure: ${closureLabel(nextClosure)}.`
          : ""}{" "}
        Super Admin sets these hours.
      </p>
    </section>
  );
}
