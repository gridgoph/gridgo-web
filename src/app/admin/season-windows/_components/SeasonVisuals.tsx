import { CalendarClock, X } from "lucide-react";

import {
  bannerHeadline,
  daysBetween,
  seasonRange,
  seasonTrackVar,
} from "@/app/admin/_lib/season-windows";
import type { SeasonDemandLevel } from "@/lib/api/types";

/** The level, said in words beside the shade it is painted in. */
export function SeasonLevelTag({ level }: { level: SeasonDemandLevel }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block h-2.5 w-[18px] shrink-0 rounded-pill"
        style={{ backgroundColor: seasonTrackVar(level) }}
      />
      <span
        className="text-caption text-text-secondary"
        style={{ fontFamily: "var(--font-medium)" }}
      >
        {level}
      </span>
    </span>
  );
}

// The runway is a schematic, not a scale drawing: the banner (15 days) and the
// quiet four weeks before the season keep their real proportion, and the
// season itself is clamped so a three-month season does not squeeze the
// banner into a sliver nor a one-day season vanish.
const BANNER_DAYS = 15;
const QUIET_DAYS = 27;
const SEASON_MIN = 12;
const SEASON_MAX = 48;

type RunwayProps = {
  bannerStart: string;
  bannerEnd: string;
  startDate: string;
  endDate: string;
  level: SeasonDemandLevel;
  today: string;
};

/**
 * Where a season stands on its own timeline: the home banner, the quiet
 * stretch after it, and the season — with today marked when it falls inside.
 * Decorative for assistive tech; the dates beside it carry the same facts.
 */
export function SeasonRunway({
  bannerStart,
  bannerEnd,
  startDate,
  endDate,
  level,
  today,
}: RunwayProps) {
  const seasonDays = daysBetween(startDate, endDate) + 1;
  const seasonWeight = Math.min(SEASON_MAX, Math.max(SEASON_MIN, seasonDays));
  const total = BANNER_DAYS + QUIET_DAYS + seasonWeight;

  let todayAt: number | null = null;
  if (today >= bannerStart && today <= endDate) {
    if (today <= bannerEnd) {
      todayAt = ((daysBetween(bannerStart, today) + 0.5) / BANNER_DAYS) * BANNER_DAYS;
    } else if (today < startDate) {
      todayAt = BANNER_DAYS + ((daysBetween(bannerEnd, today) - 0.5) / QUIET_DAYS) * QUIET_DAYS;
    } else {
      todayAt =
        BANNER_DAYS + QUIET_DAYS + ((daysBetween(startDate, today) + 0.5) / seasonDays) * seasonWeight;
    }
  }
  const pct = (n: number) => `${(n / total) * 100}%`;

  return (
    <div aria-hidden className="relative pt-5">
      <div className="relative flex h-3 items-center">
        <div
          className="h-2 rounded-pill bg-text-primary"
          style={{ width: pct(BANNER_DAYS) }}
        />
        <div className="mx-1 h-px flex-1 border-t border-dashed border-outline" />
        <div
          className="h-3 rounded-[4px] border border-info"
          style={{ width: pct(seasonWeight), backgroundColor: seasonTrackVar(level) }}
        />
      </div>
      <div className="mt-1.5 flex text-caption text-text-muted">
        <span style={{ width: pct(BANNER_DAYS) }} className="shrink-0 truncate">
          Banner
        </span>
        <span className="flex-1" />
        <span
          style={{ width: pct(seasonWeight) }}
          className="shrink-0 truncate text-right"
        >
          Season
        </span>
      </div>
      {todayAt !== null ? (
        <div
          className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
          style={{ left: pct(todayAt) }}
        >
          <span
            className="text-caption leading-4 text-text-primary"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            Today
          </span>
          <span className="h-4 w-0.5 rounded-pill bg-text-primary" />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The client app's home banner, drawn the way gridgo-client's `SeasonBanner`
 * draws it: a quiet card, the season's track behind the calendar mark, the
 * headline counted to the start, the level and dates, then the message.
 */
export function ClientBannerPreview({
  name,
  startDate,
  endDate,
  level,
  message,
  asOf,
}: {
  name: string;
  startDate: string;
  endDate: string;
  level: SeasonDemandLevel;
  message: string;
  /** The day the preview is read on (the banner's first day, or today). */
  asOf: string;
}) {
  return (
    <div className="flex gap-3 rounded-card border border-outline bg-surface py-4 pl-4 pr-1">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-pill"
        style={{ backgroundColor: seasonTrackVar(level) }}
      >
        <CalendarClock size={20} strokeWidth={2} className="text-text-primary" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p
          className="text-body-lg text-text-primary m-0 break-words"
          style={{ fontFamily: "var(--font-bold)" }}
        >
          {bannerHeadline(name, startDate, asOf)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <SeasonLevelTag level={level} />
          <span className="text-caption text-text-muted">{seasonRange(startDate, endDate)}</span>
        </div>
        <p className="text-body text-text-secondary m-0 mt-2 whitespace-pre-line break-words">
          {message}
        </p>
      </div>
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center text-text-muted"
      >
        <X size={18} strokeWidth={2} />
      </span>
    </div>
  );
}
