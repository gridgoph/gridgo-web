/**
 * GRIDGO's operating hours (gridgo-api#203, report 46481879; contract
 * `gridgo-api/docs/OPERATING_HOURS_API.md`).
 *
 * One window per open weekday in Manila time, inclusive closure dates, the
 * open-time minutes an artwork review takes, the same-day promise margin
 * (contract "Same-day promise margin control" in
 * `gridgo-api/docs/SCHEDULING_API.md`), and the Priority Delivery dispatch
 * cutoff (stored only: Priority Delivery is not offered yet). The
 * week decides when Operations reviews artwork, when riders are dispatched,
 * and how new orders' acceptance, reminder and lateness clocks count.
 *
 * Saving always sends the complete `operatingHours` object. The calendar walk
 * here mirrors `src/availability.js` in the API so the settings screen can
 * show what a client would be told before anything is saved; the API stays
 * the authority on every real order.
 *
 * Pure: no React, no fetch.
 */

import type { OperatingHours, OperatingTiming, WeeklyWindow } from "@/lib/api/types";
import {
  MANILA_OFFSET_MINUTES,
  WEEKDAYS,
  clockLabel,
  minutesToTime,
  timeToMinutes,
  type ClosureDraft,
} from "@/lib/hub-pickup";

export const MANILA_TIME_ZONE = "Asia/Manila";
export const REVIEW_MINUTES_MIN = 1;
export const REVIEW_MINUTES_MAX = 540;
export const CLOSURE_RANGES_MAX = 100;
/** Open-time minutes added after a same-day job's production: 0 to 10 hours. */
export const SAME_DAY_MARGIN_MINUTES_MAX = 600;
export const SAME_DAY_MARGIN_MINUTES_DEFAULT = 120;
/** Distinct closed dates across every range, and the longest single range. */
export const CLOSURE_DAYS_MAX = 90;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
/** The API walks at most a year looking for an opening. */
const MAX_WALK_DAYS = 366;

/** Launch defaults, as the API installs them. */
export const LAUNCH_OPERATING_HOURS: OperatingHours = {
  timeZone: MANILA_TIME_ZONE,
  schedule: {
    utcOffsetMinutes: MANILA_OFFSET_MINUTES,
    week: [1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      opensMinute: 480,
      closesMinute: 1020,
    })),
    closures: [],
  },
  artworkReviewMinutes: 60,
  sameDayPromiseAllowanceMinutes: SAME_DAY_MARGIN_MINUTES_DEFAULT,
  priorityDispatchCutoffMinute: 960,
};

export type DayDraft = {
  open: boolean;
  /** Kept while a day is closed, so switching it back on restores its hours. */
  opens: string;
  closes: string;
};

export type OperatingDraft = {
  /** By weekday, 0 Sunday … 6 Saturday. */
  days: Record<number, DayDraft>;
  closures: ClosureDraft[];
  /** Whole minutes, as typed. */
  review: string;
  /** "HH:MM", as typed. */
  cutoff: string;
  /** Hours and minutes, as typed. Null when the API does not offer the margin yet. */
  margin: { hours: string; minutes: string } | null;
};

const DEFAULT_DAY: DayDraft = { open: false, opens: "08:00", closes: "17:00" };

export function operatingDraft(hours: OperatingHours): OperatingDraft {
  const days: Record<number, DayDraft> = {};
  for (const { day } of WEEKDAYS) days[day] = { ...DEFAULT_DAY };
  for (const window of hours.schedule.week) {
    days[window.weekday] = {
      open: true,
      opens: minutesToTime(window.opensMinute),
      closes: minutesToTime(window.closesMinute),
    };
  }
  return {
    days,
    closures: (hours.schedule.closures ?? []).map((closure) => ({ ...closure })),
    review: String(hours.artworkReviewMinutes),
    cutoff: minutesToTime(hours.priorityDispatchCutoffMinute),
    margin:
      typeof hours.sameDayPromiseAllowanceMinutes === "number"
        ? {
            hours: String(Math.floor(hours.sameDayPromiseAllowanceMinutes / 60)),
            minutes: String(hours.sameDayPromiseAllowanceMinutes % 60),
          }
        : null,
  };
}

/** Whole minutes from the typed hours and minutes; null unless both read as whole numbers. */
export function marginMinutes(margin: { hours: string; minutes: string }): number | null {
  const hours = margin.hours.trim();
  const minutes = margin.minutes.trim();
  if (hours === "" && minutes === "") return null;
  const h = hours === "" ? 0 : Number(hours);
  const m = minutes === "" ? 0 : Number(minutes);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** Distinct calendar dates the closures cover. Unreadable rows count nothing. */
export function closureDayCount(closures: readonly ClosureDraft[]): number {
  const days = new Set<number>();
  for (const closure of closures) {
    const from = dayMs(closure.startDay);
    const to = dayMs(closure.endDay);
    if (
      from === null ||
      to === null ||
      to < from ||
      to - from > CLOSURE_DAYS_MAX * DAY_MS
    ) {
      continue;
    }
    for (let at = from; at <= to; at += DAY_MS) days.add(at);
  }
  return days.size;
}

/** Inclusive length of one range in days, or null while it cannot be read. */
export function closureLength(closure: ClosureDraft): number | null {
  const from = dayMs(closure.startDay);
  const to = dayMs(closure.endDay);
  if (from === null || to === null || to < from) return null;
  return Math.round((to - from) / DAY_MS) + 1;
}

function dayMs(day: string): number | null {
  if (!DAY_KEY.test(day)) return null;
  const at = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === day
    ? at
    : null;
}

export type OperatingParse =
  { value: OperatingHours } | { problem: string; field: string };

/** Mirrors the API's `invalid_operating_hours` checks so a refusal is explained first. */
export function parseOperatingDraft(draft: OperatingDraft): OperatingParse {
  const week: WeeklyWindow[] = [];
  for (const { day, long } of WEEKDAYS) {
    const row = draft.days[day];
    if (!row?.open) continue;
    const opens = timeToMinutes(row.opens);
    const closes = timeToMinutes(row.closes, true);
    const field = `day-${day}`;
    if (opens === null || closes === null) {
      return { problem: `${long}: enter an opening and a closing time.`, field };
    }
    if (closes <= opens) {
      return {
        problem: `${long}: closing time must be after opening time. Overnight hours are not supported.`,
        field,
      };
    }
    week.push({ weekday: day, opensMinute: opens, closesMinute: closes });
  }
  if (week.length === 0) {
    return { problem: "Open at least one day of the week.", field: "week" };
  }

  const review = Number(draft.review.trim());
  if (
    draft.review.trim() === "" ||
    !Number.isInteger(review) ||
    review < REVIEW_MINUTES_MIN ||
    review > REVIEW_MINUTES_MAX
  ) {
    return {
      problem: `Review time is whole minutes from ${REVIEW_MINUTES_MIN} to ${REVIEW_MINUTES_MAX} (9 hours).`,
      field: "review",
    };
  }

  const cutoff = timeToMinutes(draft.cutoff);
  if (cutoff === null || cutoff > 1439) {
    return { problem: "Enter the dispatch cutoff as a time of day.", field: "cutoff" };
  }

  let margin: number | undefined;
  if (draft.margin) {
    const minutes = marginMinutes(draft.margin);
    if (minutes === null || minutes > SAME_DAY_MARGIN_MINUTES_MAX) {
      return {
        problem: "Same-day promise margin is whole hours and minutes, up to 10 hours.",
        field: "margin",
      };
    }
    margin = minutes;
  }

  if (draft.closures.length > CLOSURE_RANGES_MAX) {
    return { problem: `Use at most ${CLOSURE_RANGES_MAX} closures.`, field: "closures" };
  }
  for (const [index, closure] of draft.closures.entries()) {
    const field = `closure-${index}`;
    const from = dayMs(closure.startDay);
    const to = dayMs(closure.endDay);
    if (from === null || to === null) {
      return { problem: "Each closure needs a first and a last day.", field };
    }
    if (to < from) return { problem: "A closure cannot end before it starts.", field };
    if (to - from > CLOSURE_DAYS_MAX * DAY_MS) {
      return {
        problem: `One closure can cover at most ${CLOSURE_DAYS_MAX} days.`,
        field,
      };
    }
  }
  if (closureDayCount(draft.closures) > CLOSURE_DAYS_MAX) {
    return {
      problem: `Closures can cover at most ${CLOSURE_DAYS_MAX} days in total. Remove some that have passed.`,
      field: "closures",
    };
  }

  const value: OperatingHours = {
    timeZone: MANILA_TIME_ZONE,
    schedule: {
      utcOffsetMinutes: MANILA_OFFSET_MINUTES,
      week,
      closures: draft.closures.map((closure) => ({ ...closure })),
    },
    artworkReviewMinutes: review,
    // Left out against an older API, which then keeps whatever it stores.
    ...(margin === undefined ? {} : { sameDayPromiseAllowanceMinutes: margin }),
    priorityDispatchCutoffMinute: cutoff,
  };

  // The API also proves a review can always finish within its year-long walk.
  const probes = [
    Date.parse("2000-01-02T00:00:00+08:00"),
    ...value.schedule.closures.map((closure) =>
      Date.parse(`${closure.startDay}T00:00:00+08:00`),
    ),
  ];
  for (const from of probes) {
    if (addOpeningMs(value.schedule, from, review * MINUTE_MS) === null) {
      return {
        problem:
          "These hours are too short to fit one review within a year. Open more time.",
        field: "week",
      };
    }
  }
  return { value };
}

// ---------------------------------------------------------------------------
// The calendar walk (mirrors gridgo-api src/availability.js)
// ---------------------------------------------------------------------------

type Schedule = OperatingHours["schedule"];

function localOf(timeMs: number, offsetMinutes: number) {
  const shifted = new Date(timeMs + offsetMinutes * MINUTE_MS);
  return {
    dayKey: shifted.toISOString().slice(0, 10),
    weekday: shifted.getUTCDay(),
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

function instantAt(dayKey: string, minuteOfDay: number, offsetMinutes: number): number {
  return (
    Date.parse(`${dayKey}T00:00:00.000Z`) + (minuteOfDay - offsetMinutes) * MINUTE_MS
  );
}

function nextDayKey(dayKey: string): string {
  return new Date(Date.parse(`${dayKey}T00:00:00.000Z`) + DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function isClosureDay(
  schedule: Pick<Schedule, "closures">,
  dayKey: string,
): boolean {
  return (schedule.closures ?? []).some(
    (closure) => dayKey >= closure.startDay && dayKey <= closure.endDay,
  );
}

function windowOn(
  schedule: Schedule,
  dayKey: string,
  weekday: number,
): WeeklyWindow | null {
  if (isClosureDay(schedule, dayKey)) return null;
  return schedule.week.find((window) => window.weekday === weekday) ?? null;
}

export function isOpenAt(schedule: Schedule, atMs: number): boolean {
  const { dayKey, weekday, minuteOfDay } = localOf(atMs, schedule.utcOffsetMinutes);
  const window = windowOn(schedule, dayKey, weekday);
  return Boolean(
    window && minuteOfDay >= window.opensMinute && minuteOfDay < window.closesMinute,
  );
}

/**
 * The instant `durationMs` of open time after `fromMs`. Zero still moves a
 * closed moment to the next opening. Null when nothing opens within a year.
 */
export function addOpeningMs(
  schedule: Schedule,
  fromMs: number,
  durationMs: number,
): number | null {
  const offset = schedule.utcOffsetMinutes;
  let { dayKey, weekday } = localOf(fromMs, offset);
  let remaining = durationMs;
  for (let day = 0; day < MAX_WALK_DAYS; day += 1) {
    const window = windowOn(schedule, dayKey, weekday);
    if (window) {
      const start = Math.max(instantAt(dayKey, window.opensMinute, offset), fromMs);
      const closes = instantAt(dayKey, window.closesMinute, offset);
      if (start < closes) {
        if (remaining <= closes - start) return start + remaining;
        remaining -= closes - start;
      }
    }
    dayKey = nextDayKey(dayKey);
    weekday = (weekday + 1) % 7;
  }
  return null;
}

/** Open time between two instants, in milliseconds. */
export function openingMsBetween(
  schedule: Schedule,
  fromMs: number,
  toMs: number,
): number {
  if (toMs <= fromMs) return 0;
  const offset = schedule.utcOffsetMinutes;
  let { dayKey, weekday } = localOf(fromMs, offset);
  let total = 0;
  while (instantAt(dayKey, 0, offset) < toMs) {
    const window = windowOn(schedule, dayKey, weekday);
    if (window) {
      total += Math.max(
        0,
        Math.min(toMs, instantAt(dayKey, window.closesMinute, offset)) -
          Math.max(fromMs, instantAt(dayKey, window.opensMinute, offset)),
      );
    }
    dayKey = nextDayKey(dayKey);
    weekday = (weekday + 1) % 7;
  }
  return total;
}

/** When the window open at `atMs` closes; null while closed. */
export function closesAtWhileOpen(schedule: Schedule, atMs: number): number | null {
  if (!isOpenAt(schedule, atMs)) return null;
  const { dayKey, weekday } = localOf(atMs, schedule.utcOffsetMinutes);
  const window = windowOn(schedule, dayKey, weekday);
  return window
    ? instantAt(dayKey, window.closesMinute, schedule.utcOffsetMinutes)
    : null;
}

export type ReviewPreview = {
  isOpenNow: boolean;
  scheduledReviewAt: number;
  reviewCompletesAt: number;
  reviewDelayed: boolean;
};

/** The review a file arriving at `atMs` would get: the API's `reviewTiming`. */
export function reviewTimingAt(
  hours: OperatingHours,
  atMs: number,
): ReviewPreview | null {
  const duration = hours.artworkReviewMinutes * MINUTE_MS;
  const scheduled = addOpeningMs(hours.schedule, atMs, 0);
  if (scheduled === null) return null;
  const completes = addOpeningMs(hours.schedule, scheduled, duration);
  const withoutClosures = addOpeningMs(
    { ...hours.schedule, closures: [] },
    atMs,
    duration,
  );
  if (completes === null) return null;
  return {
    isOpenNow: isOpenAt(hours.schedule, atMs),
    scheduledReviewAt: scheduled,
    reviewCompletesAt: completes,
    reviewDelayed: withoutClosures !== null && completes > withoutClosures,
  };
}

/** A Manila calendar day key ("2026-10-12") for an instant. */
export function manilaDayKey(atMs: number): string {
  return localOf(atMs, MANILA_OFFSET_MINUTES).dayKey;
}

/** An instant from a Manila day key and "HH:MM". */
export function manilaInstant(dayKey: string, time: string): number | null {
  const minute = timeToMinutes(time);
  if (!DAY_KEY.test(dayKey) || minute === null) return null;
  const at = instantAt(dayKey, minute, MANILA_OFFSET_MINUTES);
  return Number.isFinite(at) ? at : null;
}

/** The weekday (0 Sunday) of a Manila day key. */
export function weekdayOf(dayKey: string): number {
  return new Date(`${dayKey}T00:00:00.000Z`).getUTCDay();
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

const MANILA_WHEN = new Intl.DateTimeFormat("en-PH", {
  weekday: "long",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: MANILA_TIME_ZONE,
});
const MANILA_TIME = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: MANILA_TIME_ZONE,
});
const MANILA_DAY = new Intl.DateTimeFormat("en-PH", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: MANILA_TIME_ZONE,
});
const MANILA_DAY_YEAR = new Intl.DateTimeFormat("en-PH", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: MANILA_TIME_ZONE,
});

/** "Monday, 13 Oct, 8:00 AM" in Philippine time, whatever the reader's clock says. */
export function manilaWhen(at: number | string): string {
  const ms = typeof at === "number" ? at : Date.parse(at);
  return Number.isFinite(ms) ? MANILA_WHEN.format(ms) : "—";
}

/** "8:00 AM" in Philippine time. */
export function manilaTime(at: number | string): string {
  const ms = typeof at === "number" ? at : Date.parse(at);
  return Number.isFinite(ms) ? MANILA_TIME.format(ms) : "—";
}

/** Same Manila day as `nowMs`: just the time; otherwise day and time. */
export function manilaWhenFrom(at: number | string, nowMs: number): string {
  const ms = typeof at === "number" ? at : Date.parse(at);
  if (!Number.isFinite(ms)) return "—";
  if (manilaDayKey(ms) === manilaDayKey(nowMs)) return `today, ${manilaTime(ms)}`;
  if (manilaDayKey(ms) === manilaDayKey(nowMs + DAY_MS))
    return `tomorrow, ${manilaTime(ms)}`;
  return manilaWhen(ms);
}

/** "Thu, 25 Dec 2026". */
export function closureDayLabel(day: string, withYear = true): string {
  const ms = Date.parse(`${day}T00:00:00+08:00`);
  if (!Number.isFinite(ms)) return day;
  return (withYear ? MANILA_DAY_YEAR : MANILA_DAY).format(ms);
}

/** "Thu, 25 Dec 2026" or "Thu, 25 Dec to Fri, 26 Dec 2026". */
export function closureLabel(closure: ClosureDraft): string {
  if (closure.startDay === closure.endDay) return closureDayLabel(closure.startDay);
  const sameYear = closure.startDay.slice(0, 4) === closure.endDay.slice(0, 4);
  return `${closureDayLabel(closure.startDay, !sameYear)} to ${closureDayLabel(closure.endDay)}`;
}

/** 60 → "1 hour", 90 → "1 hour 30 minutes", 45 → "45 minutes". */
export function durationWords(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = hours ? `${hours} ${hours === 1 ? "hour" : "hours"}` : "";
  const m = rest ? `${rest} ${rest === 1 ? "minute" : "minutes"}` : "";
  return [h, m].filter(Boolean).join(" ") || "0 minutes";
}

function windowsEqual(a: WeeklyWindow | undefined, b: WeeklyWindow | undefined): boolean {
  return a?.opensMinute === b?.opensMinute && a?.closesMinute === b?.closesMinute;
}

/** "Mon to Sat, 8:00 AM to 5:00 PM", runs of days with the same hours joined. */
export function weekSummary(week: readonly WeeklyWindow[]): string[] {
  const byDay = new Map(week.map((window) => [window.weekday, window]));
  const runs: { days: string[]; window: WeeklyWindow }[] = [];
  let previous: WeeklyWindow | undefined;
  for (const { day, short } of WEEKDAYS) {
    const window = byDay.get(day);
    if (!window) {
      previous = undefined;
      continue;
    }
    const last = runs[runs.length - 1];
    if (last && previous && windowsEqual(previous, window)) last.days.push(short);
    else runs.push({ days: [short], window });
    previous = window;
  }
  // Runs with identical hours that are not adjacent are listed together.
  const merged: { days: string[]; window: WeeklyWindow; runs: string[] }[] = [];
  for (const run of runs) {
    const label =
      run.days.length > 2
        ? `${run.days[0]} to ${run.days[run.days.length - 1]}`
        : run.days.join(", ");
    const same = merged.find((entry) => windowsEqual(entry.window, run.window));
    if (same) same.runs.push(label);
    else merged.push({ ...run, runs: [label] });
  }
  return merged.map(
    (entry) =>
      `${entry.runs.join(", ")}: ${clockLabel(entry.window.opensMinute)} to ${clockLabel(entry.window.closesMinute)}`,
  );
}

/** Closed weekdays by name: "Sunday". */
export function closedWeekdays(week: readonly WeeklyWindow[]): string[] {
  const open = new Set(week.map((window) => window.weekday));
  return WEEKDAYS.filter(({ day }) => !open.has(day)).map(({ long }) => long);
}

/** The header line: open until when, or closed until when. */
export function operatingStatusLine(
  hours: OperatingHours,
  status: Pick<OperatingTiming, "isOpenNow" | "scheduledReviewAt">,
  nowMs: number,
): string {
  if (status.isOpenNow) {
    const closes = closesAtWhileOpen(hours.schedule, nowMs);
    return closes === null ? "Open now" : `Open now, until ${manilaTime(closes)}`;
  }
  return `Closed. Opens ${manilaWhenFrom(status.scheduledReviewAt, nowMs)}`;
}

/**
 * Everything that moved between two operating-hours objects, in words. Feeds
 * the audited reason and the audit log line, so both read the same.
 */
export function operatingHoursChanges(
  previous: OperatingHours | null | undefined,
  next: OperatingHours | null | undefined,
): string[] {
  if (!next) return [];
  const before = previous ?? LAUNCH_OPERATING_HOURS;
  const changes: string[] = [];
  for (const { day, long } of WEEKDAYS) {
    const was = before.schedule.week.find((window) => window.weekday === day);
    const now = next.schedule.week.find((window) => window.weekday === day);
    if (windowsEqual(was, now)) continue;
    if (!now) changes.push(`${long} closed`);
    else
      changes.push(
        `${long} ${was ? "now" : "opened"} ${clockLabel(now.opensMinute)} to ${clockLabel(now.closesMinute)}`,
      );
  }
  if (before.artworkReviewMinutes !== next.artworkReviewMinutes) {
    changes.push(
      `review time ${durationWords(before.artworkReviewMinutes)} to ${durationWords(next.artworkReviewMinutes)}`,
    );
  }
  // An older settings row has no margin; the API reads it as the default.
  const wasMargin = before.sameDayPromiseAllowanceMinutes ?? SAME_DAY_MARGIN_MINUTES_DEFAULT;
  if (
    typeof next.sameDayPromiseAllowanceMinutes === "number" &&
    next.sameDayPromiseAllowanceMinutes !== wasMargin
  ) {
    changes.push(
      `same-day promise margin ${durationWords(wasMargin)} to ${durationWords(next.sameDayPromiseAllowanceMinutes)}`,
    );
  }
  const key = (closure: ClosureDraft) => `${closure.startDay}/${closure.endDay}`;
  const wasClosures = new Set((before.schedule.closures ?? []).map(key));
  const nowClosures = new Set((next.schedule.closures ?? []).map(key));
  for (const closure of next.schedule.closures ?? []) {
    if (!wasClosures.has(key(closure))) changes.push(`closed ${closureLabel(closure)}`);
  }
  for (const closure of before.schedule.closures ?? []) {
    if (!nowClosures.has(key(closure))) changes.push(`reopened ${closureLabel(closure)}`);
  }
  if (before.priorityDispatchCutoffMinute !== next.priorityDispatchCutoffMinute) {
    changes.push(
      `Priority dispatch cutoff ${clockLabel(before.priorityDispatchCutoffMinute)} to ${clockLabel(next.priorityDispatchCutoffMinute)}`,
    );
  }
  return changes;
}

/** The audited reason: what moved, then the person's own words if they gave any. */
export function operatingHoursReason(
  previous: OperatingHours,
  next: OperatingHours,
  note: string,
): string {
  const changes = operatingHoursChanges(previous, next);
  const what = `Operating hours: ${changes.length ? changes.join("; ") : "saved unchanged"}`;
  const why = note.trim();
  return why ? `${what}. ${why}` : what;
}
