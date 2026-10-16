/**
 * A shop's hours: the days and times it opens, the dates it is shut, closing
 * for a while, and staying open later today (gridgo-api#219, report 4B4D2591;
 * contract `gridgo-api/docs/SHOP_HOURS_API.md`).
 *
 * GRIDGO counts a job's hour to answer, its production time and its lateness
 * on these hours. The shop edits them at `/supplier/shop-hours` (and in the
 * shop app, whose `lib/shopHours.ts` this mirrors rule for rule); the GRIDGO
 * Team reads every shop's at `/ops/shop-hours` and `/admin/shop-hours` and may
 * only switch Temporarily closed, with a reason.
 *
 * Three rules shape the screens:
 *
 * - **Every open day has the same hours.** The API refuses open days of
 *   different lengths for now (`409 production_day_length_unavailable`), so
 *   the editor is one set of days and one opening and closing time.
 * - **Saving the week or the closure dates replaces the base schedule**, and
 *   that clears today's extension. A save keeps it by sending it again when
 *   the API would still accept it, and asks first when it cannot.
 * - **The clock is Manila's.** The shop is fixed to UTC+08:00, so "today" and
 *   "now" are read at that offset, never from the browser's own zone.
 *
 * Pure: no React, no fetch.
 */

import type {
  ShopHours,
  ShopHoursExtension,
  ShopHoursPatch,
  ScheduleClosure,
  WeeklyWindow,
} from "@/lib/api/types";
import { WEEKDAYS } from "@/lib/hub-pickup";
import { closureLabel } from "@/lib/operating-hours";

export const MANILA_OFFSET_MINUTES = 480;
/** The inbox row the API writes when a shop's hours change. It names no shop. */
export const SHOP_HOURS_NOTICE = "supplier_hours_updated";
export const DISPATCH_NOTICE_CODE = "review_and_dispatch_in_next_working_window";
const MINUTE_MS = 60_000;
const DAY_MINUTES = 1440;
/** The latest close the API accepts for an extension: 11:59 PM. */
export const LAST_EXTENSION_MINUTE = 1439;
/** An extension must end at least this long after it is declared. Exactly 30 is fine. */
export const EXTENSION_LEAD_MINUTES = 30;
/** The API's limits on closure dates. */
export const MAX_CLOSURE_RANGES = 100;
export const MAX_CLOSED_DAYS = 90;
/** Staff closing a shop write a reason the audit log keeps. */
export const STAFF_REASON_MAX = 2000;

/** The shop reads this when an extension runs past GRIDGO's review and delivery hours. */
export const DISPATCH_WAITS_COPY =
  "This runs past GRIDGO's review and delivery hours. Review and dispatch resume in the next working window.";

export const STALE_SHOP_HOURS_COPY =
  "Your shop's details changed somewhere else while this page was open. The latest hours are loaded. Check them and make your change again.";
export const STALE_STAFF_HOURS_COPY =
  "This shop's details changed while this page was open. The latest hours are loaded. Check them and make your change again.";

/* ------------------------------------------------------------------ reading */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function minuteOf(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= DAY_MINUTES
    ? (value as number)
    : null;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function windowOf(raw: unknown): WeeklyWindow | null {
  if (!isRecord(raw)) return null;
  const weekday = raw.weekday;
  const opensMinute = minuteOf(raw.opensMinute);
  const closesMinute = minuteOf(raw.closesMinute);
  if (!Number.isInteger(weekday) || (weekday as number) < 0 || (weekday as number) > 6) return null;
  if (opensMinute == null || closesMinute == null || closesMinute <= opensMinute) return null;
  return { weekday: weekday as number, opensMinute, closesMinute };
}

function closureOf(raw: unknown): ScheduleClosure | null {
  if (!isRecord(raw)) return null;
  const { startDay, endDay } = raw;
  if (typeof startDay !== "string" || typeof endDay !== "string") return null;
  if (!DAY_KEY.test(startDay) || !DAY_KEY.test(endDay) || endDay < startDay) return null;
  return { startDay, endDay };
}

function extensionOf(raw: unknown): ShopHoursExtension | null {
  if (!isRecord(raw) || typeof raw.day !== "string" || !DAY_KEY.test(raw.day)) return null;
  const opensMinute = minuteOf(raw.opensMinute);
  const closesMinute = minuteOf(raw.closesMinute);
  if (opensMinute == null || closesMinute == null) return null;
  return { day: raw.day, opensMinute, closesMinute };
}

const byStart = (a: ScheduleClosure, b: ScheduleClosure) =>
  a.startDay.localeCompare(b.startDay) || a.endDay.localeCompare(b.endDay);

/** One `hours` object from the API, read defensively. Null when it is not one at all. */
export function normalizeShopHours(raw: unknown): ShopHours | null {
  if (!isRecord(raw)) return null;
  const schedule = isRecord(raw.schedule) ? raw.schedule : {};
  const week = (Array.isArray(schedule.week) ? schedule.week : [])
    .map(windowOf)
    .filter((row): row is WeeklyWindow => row !== null)
    .sort((a, b) => a.weekday - b.weekday);
  const closures = (Array.isArray(schedule.closures) ? schedule.closures : [])
    .map(closureOf)
    .filter((row): row is ScheduleClosure => row !== null)
    .sort(byStart);
  return {
    version: Number.isInteger(raw.version) ? (raw.version as number) : 1,
    week,
    closures,
    temporarilyClosed: raw.temporarilyClosed === true,
    isOpenNow: raw.isOpenNow === true,
    calendarAvailable: raw.calendarAvailable !== false,
    nextOpeningAt: typeof raw.nextOpeningAt === "string" ? raw.nextOpeningAt : null,
    todayExtension: extensionOf(raw.todayExtension),
    dispatchWaits: raw.dispatchNotice === DISPATCH_NOTICE_CODE,
  };
}

/* -------------------------------------------------------------- Manila clock */

export type ManilaClock = {
  /** Today's Manila date. */
  dayKey: string;
  /** 0 is Sunday, as the API numbers them. */
  weekday: number;
  /** Minutes since Manila midnight, with the seconds kept as a fraction. */
  minute: number;
};

export function manilaClock(at: Date | number): ManilaClock {
  const ms = typeof at === "number" ? at : at.getTime();
  const shifted = new Date(ms + MANILA_OFFSET_MINUTES * MINUTE_MS);
  const dayKey = shifted.toISOString().slice(0, 10);
  const midnight = Date.parse(`${dayKey}T00:00:00Z`);
  return { dayKey, weekday: shifted.getUTCDay(), minute: (shifted.getTime() - midnight) / MINUTE_MS };
}

export function addDays(dayKey: string, days: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + days * DAY_MINUTES * MINUTE_MS)
    .toISOString()
    .slice(0, 10);
}

/** "8:00 AM", "12:00 PM" for noon, "11:59 PM". */
export function timeLabel(minute: number): string {
  const whole = Math.round(minute) % DAY_MINUTES;
  const hour = Math.floor(whole / 60);
  const rest = whole % 60;
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(rest).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

/** "9 hours", "9½ hours", "8 hours 15 minutes". */
export function dayLengthLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  if (rest === 30) return `${hours}½ hours`;
  if (hours === 0) return `${rest} minutes`;
  return `${hours} ${hours === 1 ? "hour" : "hours"} ${rest} minutes`;
}

/* ------------------------------------------------------------- weekly hours */

export type WeekDraft = {
  /** Open weekdays, API numbering (0 Sunday). */
  days: number[];
  opensMinute: number;
  closesMinute: number;
};

export const DEFAULT_WEEK_DRAFT: WeekDraft = {
  days: [1, 2, 3, 4, 5, 6],
  opensMinute: 8 * 60,
  closesMinute: 18 * 60,
};

/**
 * The editor's starting point: the days the API has open, at the hours most
 * of them keep. `uneven` says the saved week did not fit one shared time (older
 * hours), so the screen can say a save evens it out.
 */
export function weekDraftOf(week: readonly WeeklyWindow[]): { draft: WeekDraft; uneven: boolean } {
  if (!week.length) return { draft: DEFAULT_WEEK_DRAFT, uneven: false };
  const counts = new Map<string, { row: WeeklyWindow; count: number }>();
  for (const row of week) {
    const key = `${row.opensMinute}-${row.closesMinute}`;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { row, count: 1 });
  }
  const common = [...counts.values()].sort((a, b) => b.count - a.count)[0].row;
  const days = [...new Set(week.map((row) => row.weekday))].sort((a, b) => a - b);
  return {
    draft: { days, opensMinute: common.opensMinute, closesMinute: common.closesMinute },
    uneven: counts.size > 1 || days.length !== week.length,
  };
}

export function weekFromDraft(draft: WeekDraft): WeeklyWindow[] {
  return [...draft.days]
    .sort((a, b) => a - b)
    .map((weekday) => ({ weekday, opensMinute: draft.opensMinute, closesMinute: draft.closesMinute }));
}

export function weekDraftChanged(week: readonly WeeklyWindow[], draft: WeekDraft): boolean {
  const saved = weekDraftOf(week);
  return (
    saved.uneven ||
    JSON.stringify(weekFromDraft(saved.draft)) !== JSON.stringify(weekFromDraft(draft))
  );
}

export function validateWeekDraft(draft: WeekDraft): string | null {
  if (!draft.days.length) return "Pick at least one day your shop opens.";
  if (draft.closesMinute <= draft.opensMinute) return "Pick a closing time later than the opening time.";
  return null;
}

/** "Mon–Sat", "Every day", "Mon, Wed, Fri", "No open days". */
export function openDaysLabel(days: readonly number[]): string {
  const open = WEEKDAYS.filter((day) => days.includes(day.day));
  if (!open.length) return "No open days";
  if (open.length === 7) return "Every day";
  const runs: string[][] = [];
  let index = -2;
  for (const day of open) {
    const at = WEEKDAYS.indexOf(day);
    if (at === index + 1) runs[runs.length - 1].push(day.short);
    else runs.push([day.short]);
    index = at;
  }
  return runs
    .map((run) => (run.length > 2 ? `${run[0]}–${run[run.length - 1]}` : run.join(", ")))
    .join(", ");
}

/** "Mon–Sat, 8:00 AM to 6:00 PM", or each distinct window when the week is uneven. */
export function weekLabel(week: readonly WeeklyWindow[]): string {
  if (!week.length) return "No open days";
  const groups = new Map<string, number[]>();
  for (const row of week) {
    const key = `${row.opensMinute}-${row.closesMinute}`;
    groups.set(key, [...(groups.get(key) ?? []), row.weekday]);
  }
  return [...groups.entries()]
    .map(([key, days]) => {
      const [opens, closes] = key.split("-").map(Number);
      return `${openDaysLabel(days)}, ${timeLabel(opens)} to ${timeLabel(closes)}`;
    })
    .join("; ");
}

/** Half-hour choices across a day, keeping an odd time the API already holds. */
export function timeChoices(keep?: number): number[] {
  const choices: number[] = [];
  for (let minute = 0; minute < DAY_MINUTES; minute += 30) choices.push(minute);
  if (keep != null && keep < DAY_MINUTES && !choices.includes(keep)) choices.push(keep);
  return choices.sort((a, b) => a - b);
}

/* ------------------------------------------------------------ closure dates */

function dayCount(closure: ScheduleClosure): number {
  return (
    Math.round(
      (Date.parse(closure.endDay) - Date.parse(closure.startDay)) / (DAY_MINUTES * MINUTE_MS),
    ) + 1
  );
}

/** Distinct closed dates across every range: the API's 90-date budget. */
export function closedDayCount(closures: readonly ScheduleClosure[]): number {
  const days = new Set<string>();
  for (const closure of closures) {
    for (let index = 0; index < dayCount(closure); index += 1) {
      days.add(addDays(closure.startDay, index));
    }
  }
  return days.size;
}

export function sameClosure(a: ScheduleClosure, b: ScheduleClosure): boolean {
  return a.startDay === b.startDay && a.endDay === b.endDay;
}

/** Why this closure cannot be saved, naming the fix. Null when the API should take it. */
export function validateClosure(
  candidate: ScheduleClosure,
  closures: readonly ScheduleClosure[],
  replacing: ScheduleClosure | null = null,
): string | null {
  if (!DAY_KEY.test(candidate.startDay) || !DAY_KEY.test(candidate.endDay)) {
    return "Pick a first and a last closed date.";
  }
  if (candidate.endDay < candidate.startDay) {
    return "The last closed date is before the first. Move it later.";
  }
  const others = closures.filter((closure) => !(replacing && sameClosure(closure, replacing)));
  const clash = others.find(
    (closure) => closure.startDay <= candidate.endDay && candidate.startDay <= closure.endDay,
  );
  if (clash) {
    return `This overlaps your closure on ${closureLabel(clash)}. Change that one instead.`;
  }
  if (others.length + 1 > MAX_CLOSURE_RANGES) {
    return `GRIDGO keeps up to ${MAX_CLOSURE_RANGES} closures. Remove a past one first.`;
  }
  if (closedDayCount([...others, candidate]) > MAX_CLOSED_DAYS) {
    return `Closures can cover ${MAX_CLOSED_DAYS} dates in total. Remove or shorten one first.`;
  }
  return null;
}

export function withClosure(
  closures: readonly ScheduleClosure[],
  next: ScheduleClosure,
  replacing: ScheduleClosure | null = null,
): ScheduleClosure[] {
  return [
    ...closures.filter((closure) => !(replacing && sameClosure(closure, replacing))),
    next,
  ].sort(byStart);
}

export function withoutClosure(
  closures: readonly ScheduleClosure[],
  gone: ScheduleClosure,
): ScheduleClosure[] {
  return closures.filter((closure) => !sameClosure(closure, gone));
}

/** The closure covering a Manila date, or null. */
export function closureOnDay(
  closures: readonly ScheduleClosure[],
  dayKey: string,
): ScheduleClosure | null {
  return closures.find((closure) => closure.startDay <= dayKey && dayKey <= closure.endDay) ?? null;
}

/** "1 day", "3 days". */
export function closureLengthLabel(closure: ScheduleClosure): string {
  const days = dayCount(closure);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** Closures still to come (or running today), soonest first. */
export function upcomingClosures(
  closures: readonly ScheduleClosure[],
  today: string,
): ScheduleClosure[] {
  return closures.filter((closure) => closure.endDay >= today);
}

/* --------------------------------------------------------------- open status */

export type ShopStatusState = "open" | "closed" | "temporarily_closed" | "unreadable";

export type ShopStatus = {
  state: ShopStatusState;
  title: string;
  detail: string;
};

/** Who is reading: the shop itself ("you") or the GRIDGO Team ("the shop"). */
export type ShopHoursReader = "shop" | "staff";

function todayWindow(hours: ShopHours, clock: ManilaClock): WeeklyWindow | null {
  return hours.week.find((row) => row.weekday === clock.weekday) ?? null;
}

/** Today's extension, only when it is for today's Manila date. */
export function extensionToday(hours: ShopHours, now: Date | number): ShopHoursExtension | null {
  const today = manilaClock(now).dayKey;
  return hours.todayExtension?.day === today ? hours.todayExtension : null;
}

/** "today at 8:00 AM", "tomorrow at 8:00 AM", "Mon, 19 Oct 2026 at 8:00 AM". */
export function openingLabel(iso: string, now: Date | number): string | null {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const when = manilaClock(at);
  const today = manilaClock(now).dayKey;
  const day =
    when.dayKey === today
      ? "today"
      : when.dayKey === addDays(today, 1)
        ? "tomorrow"
        : closureLabel({ startDay: when.dayKey, endDay: when.dayKey });
  return `${day} at ${timeLabel(Math.floor(when.minute))}`;
}

/** Open now, closed now, or closed for a while, and what happens next. */
export function shopStatus(
  hours: ShopHours,
  now: Date | number,
  reader: ShopHoursReader = "shop",
): ShopStatus {
  const you = reader === "shop";
  if (hours.temporarilyClosed) {
    return {
      state: "temporarily_closed",
      title: "Temporarily closed",
      detail: you
        ? "No reopening date is set. You reopen when you switch this off."
        : "No reopening date is set. The shop reopens on its weekly hours when this is switched off.",
    };
  }
  if (!hours.calendarAvailable) {
    return {
      state: "unreadable",
      title: "Hours need setting",
      detail: you
        ? "GRIDGO cannot read the hours saved for your shop. Set your open days and times below."
        : "GRIDGO cannot read the hours saved for this shop, so new jobs cannot be timed against them until the shop sets them again.",
    };
  }
  const clock = manilaClock(now);
  if (hours.isOpenNow) {
    const extension = extensionToday(hours, now);
    const close = extension?.closesMinute ?? todayWindow(hours, clock)?.closesMinute;
    return {
      state: "open",
      title: "Open now",
      detail:
        close != null
          ? `Until ${timeLabel(close)} today${extension ? (you ? ", with your extension" : ", with an extension") : ""}.`
          : "Open on the usual hours.",
    };
  }
  const next = hours.nextOpeningAt ? openingLabel(hours.nextOpeningAt, now) : null;
  const closureToday = closureOnDay(hours.closures, clock.dayKey) ? "Today is a closure date. " : "";
  return {
    state: "closed",
    title: "Closed now",
    detail: `${closureToday}${
      next
        ? `Opens ${next}.`
        : you
          ? "No opening is set in the coming year. Add open days below."
          : "No opening is set in the coming year."
    }`,
  };
}

/* ---------------------------------------------------------- today's extension */

export type ExtensionState =
  | { kind: "unavailable"; reason: string }
  | {
      kind: "available";
      normalClose: number;
      choices: number[];
      current: ShopHoursExtension | null;
    };

/**
 * Whether today can run later, and to which times, by the API's own rules: an
 * open day without a closure date, a shop that is not closed for a while, a
 * close later than the usual one, before midnight, and at least 30 minutes
 * away (exactly 30 is accepted).
 */
export function extensionState(hours: ShopHours, now: Date | number): ExtensionState {
  if (hours.temporarilyClosed) {
    return {
      kind: "unavailable",
      reason: "Reopen your shop first. A temporarily closed shop cannot extend its hours.",
    };
  }
  const clock = manilaClock(now);
  const row = todayWindow(hours, clock);
  if (!row) {
    return {
      kind: "unavailable",
      reason: "Today is not one of your open days. You can extend only a day you open.",
    };
  }
  if (closureOnDay(hours.closures, clock.dayKey)) {
    return {
      kind: "unavailable",
      reason:
        "Today is one of your closure dates. Remove it first if you are opening after all.",
    };
  }
  const earliest = Math.max(
    row.closesMinute + 30,
    Math.ceil((clock.minute + EXTENSION_LEAD_MINUTES) / 30) * 30,
  );
  const choices: number[] = [];
  for (let minute = earliest; minute < DAY_MINUTES; minute += 30) choices.push(minute);
  if (
    clock.minute + EXTENSION_LEAD_MINUTES <= LAST_EXTENSION_MINUTE &&
    row.closesMinute < LAST_EXTENSION_MINUTE
  ) {
    choices.push(LAST_EXTENSION_MINUTE);
  }
  const current = extensionToday(hours, now);
  const usable = [...new Set(choices)]
    .filter((minute) => minute > row.closesMinute)
    .sort((a, b) => a - b);
  if (!usable.length && !current) {
    return {
      kind: "unavailable",
      reason:
        "It is too late to extend today. The new closing time has to be at least 30 minutes away and before midnight.",
    };
  }
  return { kind: "available", normalClose: row.closesMinute, choices: usable, current };
}

/** The API would still accept this close as today's extension, from `now`. */
export function extensionStillValid(closesMinute: number, now: Date | number): boolean {
  return (
    closesMinute <= LAST_EXTENSION_MINUTE &&
    closesMinute - manilaClock(now).minute >= EXTENSION_LEAD_MINUTES
  );
}

/**
 * Whether an extension to this time runs past GRIDGO's own hours today, from
 * the operating week in `GET /settings`. Null when that is not known; the
 * API's own `dispatchNotice` is the answer once an extension is saved.
 */
export function extensionPastGridgoHours(
  closesMinute: number,
  operatingWeek: readonly WeeklyWindow[] | null,
  now: Date | number,
): boolean | null {
  if (!operatingWeek) return null;
  const clock = manilaClock(now);
  const rows = operatingWeek.filter((row) => row.weekday === clock.weekday);
  if (!rows.length) return true;
  const closes = Math.max(...rows.map((row) => row.closesMinute));
  return closesMinute > closes || clock.minute >= closes;
}

/* ------------------------------------------------------------------- writes */

/**
 * A new base schedule: the week, the closure dates, or both. The API clears
 * today's extension on any base change, so it is sent again when it would
 * still be accepted. `dropsExtension` tells the caller to ask first.
 */
export function schedulePatch(
  hours: ShopHours,
  change: { week?: WeeklyWindow[]; closures?: ScheduleClosure[] },
  now: Date | number,
): { patch: ShopHoursPatch; dropsExtension: boolean } {
  const week = change.week ?? hours.week;
  const closures = change.closures ?? hours.closures;
  const patch: ShopHoursPatch = {
    schedule: { utcOffsetMinutes: MANILA_OFFSET_MINUTES, week, closures },
  };
  const clock = manilaClock(now);
  const extension = extensionToday(hours, now);
  if (!extension) return { patch, dropsExtension: false };
  const row = week.find((window) => window.weekday === clock.weekday);
  const keeps =
    !hours.temporarilyClosed &&
    row != null &&
    extension.closesMinute > row.closesMinute &&
    !closureOnDay(closures, clock.dayKey) &&
    extensionStillValid(extension.closesMinute, now);
  if (keeps) patch.extension = { closesMinute: extension.closesMinute };
  return { patch, dropsExtension: !keeps };
}

/* ------------------------------------------------------------ the shop list */

export type ShopHoursRow = {
  supplierId: string;
  shopName: string;
  hours: ShopHours;
};

/** Temporarily closed first (they take no new jobs), then closed, then open; by name within. */
export const SHOP_STATE_ORDER: Record<ShopStatusState, number> = {
  temporarily_closed: 0,
  unreadable: 1,
  closed: 2,
  open: 3,
};

export function sortShopRows(rows: readonly ShopHoursRow[], now: Date | number): ShopHoursRow[] {
  return [...rows].sort(
    (a, b) =>
      SHOP_STATE_ORDER[shopStatus(a.hours, now, "staff").state] -
        SHOP_STATE_ORDER[shopStatus(b.hours, now, "staff").state] ||
      a.shopName.localeCompare(b.shopName),
  );
}

/** `GET /ops/shops/hours`, read defensively; a row without hours is left out. */
export function normalizeShopHoursList(raw: unknown): ShopHoursRow[] {
  const shops = isRecord(raw) && Array.isArray(raw.shops) ? raw.shops : [];
  return shops.flatMap((shop) => {
    if (!isRecord(shop) || typeof shop.supplierId !== "string") return [];
    const hours = normalizeShopHours(shop.hours);
    if (!hours) return [];
    const name = typeof shop.shopName === "string" && shop.shopName.trim() ? shop.shopName.trim() : "Unnamed shop";
    return [{ supplierId: shop.supplierId, shopName: name, hours }];
  });
}
