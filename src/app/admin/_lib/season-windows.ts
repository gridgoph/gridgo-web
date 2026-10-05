/**
 * Season windows — the Super Admin editor's rules.
 *
 * A season window tells clients that shops fill up early around a stretch of
 * dates (graduation, school opening, the holidays). It is awareness only: it
 * never blocks a date, changes matching or moves a price. Super Admin writes
 * the name and message clients read.
 *
 * Contract: gridgo-api docs/SEASON_WINDOWS_API.md. Dates are inclusive
 * `YYYY-MM-DD` calendar days in Asia/Manila and are compared as strings; a
 * `Date` is only built from them to word them. The server's `today` (also a
 * Manila day) is the clock for everything here.
 */

import { isApiError } from "@/lib/api/client";
import type {
  SeasonDemandLevel,
  SeasonPushDryRunWindow,
  SeasonWindow,
  SeasonWindowInput,
} from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

/** The API trims both and refuses anything longer. */
export const SEASON_LIMITS = { name: 120, message: 500, reason: 500 } as const;

/** The home banner opens 42 days before a season and closes 28 days before (inclusive). */
export const BANNER_OPENS_DAYS_BEFORE = 42;
export const BANNER_CLOSES_DAYS_BEFORE = 28;

export const DEMAND_LEVELS: readonly {
  value: SeasonDemandLevel;
  label: string;
  hint: string;
}[] = [
  { value: "Normal", label: "Normal", hint: "Worth knowing. Shops are not unusually full." },
  { value: "Busy", label: "Busy", hint: "Shops fill faster than usual. Order a little earlier." },
  { value: "Peak", label: "Peak", hint: "The busiest time of year. Late orders may find no shop free." },
];

/** The shade a level is painted in, matching the client app's calendar track. */
export function seasonTrackVar(level: SeasonDemandLevel): string {
  return `var(--season-track-${level.toLowerCase()})`;
}

// ---------------------------------------------------------------------------
// Calendar days
// ---------------------------------------------------------------------------

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day written `YYYY-MM-DD` (rejects 2026-02-30). */
export function isDayKey(value: string): boolean {
  const match = DAY_KEY.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  );
}

/** `YYYY-MM-DD` shifted by whole calendar days. */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** The banner interval the server will compute for a season starting on `startDate`. */
export function bannerIntervalFor(startDate: string): { startDate: string; endDate: string } {
  return {
    startDate: addDays(startDate, -BANNER_OPENS_DAYS_BEFORE),
    endDate: addDays(startDate, -BANNER_CLOSES_DAYS_BEFORE),
  };
}

function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** "Fri 13 Nov 2026" — assembled, so every runtime's locale data words it alike. */
export function seasonDay(key: string): string {
  const date = keyToDate(key);
  const part = (opts: Intl.DateTimeFormatOptions) =>
    date.toLocaleDateString("en-PH", { ...opts, timeZone: "UTC" });
  return `${part({ weekday: "short" })} ${date.getUTCDate()} ${part({ month: "short" })} ${date.getUTCFullYear()}`;
}

/** "13–30 Nov 2026", "28 Mar – 5 Apr 2027", "30 Dec 2026 – 3 Jan 2027". */
export function seasonRange(startDate: string, endDate: string): string {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const month = (key: string) =>
    keyToDate(key).toLocaleDateString("en-PH", { month: "short", timeZone: "UTC" });
  if (startDate === endDate) return `${sd} ${month(startDate)} ${sy}`;
  if (sy === ey && sm === em) return `${sd}–${ed} ${month(endDate)} ${ey}`;
  if (sy === ey) return `${sd} ${month(startDate)} – ${ed} ${month(endDate)} ${ey}`;
  return `${sd} ${month(startDate)} ${sy} – ${ed} ${month(endDate)} ${ey}`;
}

/** Inclusive length: a season from the 13th to the 30th is 18 days. */
export function seasonLength(startDate: string, endDate: string): number {
  return daysBetween(startDate, endDate) + 1;
}

function inDays(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n % 7 === 0) return `in ${n / 7} week${n === 7 ? "" : "s"}`;
  return `in ${n} days`;
}

/**
 * The client home banner's headline, worded exactly as the client app words
 * it (gridgo-client `bannerHeadline`): counted from `today` to the start.
 */
export function bannerHeadline(name: string, startDate: string, today: string): string {
  const days = daysBetween(today, startDate);
  if (days <= 0) return `${name} has started`;
  if (days === 1) return `${name} starts tomorrow`;
  if (days % 7 === 0) return `${name} starts in ${days / 7} weeks`;
  return `${name} starts in ${days} days`;
}

// ---------------------------------------------------------------------------
// When the banner shows
// ---------------------------------------------------------------------------

export type BannerPhase = "ahead" | "showing" | "missed" | "over";

export type BannerTiming = {
  phase: BannerPhase;
  /** One line, the plain answer to "when will clients see this?". */
  headline: string;
  /** What that means, for the editor. */
  detail: string;
  tone: StatusTone;
  icon: StatusIconName;
  chip: string;
};

/**
 * When a window's home banner shows, against today.
 *
 * `missed` is a season created too close to its start: the six-to-four-week
 * interval has already gone by, so no banner (and no notice) will ever show.
 * `over` is the same arithmetic on a window that had its interval normally.
 */
export function bannerTiming(
  interval: { startDate: string; endDate: string },
  today: string,
  opts: { isNew?: boolean } = {},
): BannerTiming {
  const range = seasonRange(interval.startDate, interval.endDate);
  if (today < interval.startDate) {
    const n = daysBetween(today, interval.startDate);
    return {
      phase: "ahead",
      headline: `Banner shows ${range}`,
      detail: `Clients start seeing it on ${seasonDay(interval.startDate)}, ${inDays(n)}, and it stays until ${seasonDay(interval.endDate)}.`,
      tone: "info",
      icon: "clock",
      chip: `Banner ${inDays(n)}`,
    };
  }
  if (today <= interval.endDate) {
    const left = daysBetween(today, interval.endDate);
    return {
      phase: "showing",
      headline: `Banner showing now, until ${seasonDay(interval.endDate)}`,
      detail:
        left === 0
          ? "Today is its last day on the client home screen."
          : `Clients see it on their home screen for ${left + 1} more days, including today.`,
      tone: "success",
      icon: "circle-dot",
      chip: "Banner showing",
    };
  }
  if (opts.isNew) {
    return {
      phase: "missed",
      headline: "Too close to start for a banner",
      detail: `The banner would have shown ${range}, six to four weeks before the season. That has passed, so clients will only see this season on their deadline calendar.`,
      tone: "warning",
      icon: "triangle-alert",
      chip: "No banner",
    };
  }
  return {
    phase: "over",
    headline: `Banner showed ${range}`,
    detail: "The home banner has finished. The season stays on the deadline calendar until its last day.",
    tone: "neutral",
    icon: "circle-check",
    chip: "Banner done",
  };
}

// ---------------------------------------------------------------------------
// Pre-season notice per window
// ---------------------------------------------------------------------------

export type NoticeLine = { tone: StatusTone; icon: StatusIconName; label: string; detail: string };

function people(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-PH")} ${n === 1 ? one : many}`;
}

export function reachPhrase(clients: number, devices: number): string {
  return `${people(clients, "client", "clients")} on ${people(devices, "phone", "phones")}`;
}

/** What happens with this window's one push notice. */
export function noticeLine(
  window: Pick<SeasonWindow, "noticeQueuedAt" | "status">,
  dry: SeasonPushDryRunWindow | undefined,
  pushEnabled: boolean,
  phase: BannerPhase,
): NoticeLine {
  if (window.noticeQueuedAt) {
    return {
      tone: "success",
      icon: "circle-check",
      label: "Notice sent",
      detail: `Queued for clients on ${new Date(window.noticeQueuedAt).toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" })}. It never sends twice, even after an edit.`,
    };
  }
  if (phase === "showing" && dry?.due) {
    const reach = reachPhrase(dry.wouldNotifyClients, dry.wouldNotifyDevices);
    return pushEnabled
      ? {
          tone: "warning",
          icon: "clock",
          label: "Notice sending",
          detail: `Goes out within a minute to ${reach}.`,
        }
      : {
          tone: "neutral",
          icon: "circle-dashed",
          label: "Notice held",
          detail: `Notices are off. Turned on now, this would reach ${reach}.`,
        };
  }
  if (phase === "ahead") {
    return pushEnabled
      ? {
          tone: "info",
          icon: "clock",
          label: "Notice scheduled",
          detail: "One notice goes to clients who allow notifications when the banner starts.",
        }
      : {
          tone: "neutral",
          icon: "circle-dashed",
          label: "No notice",
          detail: "Notices are off, so only the banner and calendar will show this.",
        };
  }
  return {
    tone: "neutral",
    icon: "ban",
    label: "No notice",
    detail: "Notices only go out while the banner is showing, never afterwards.",
  };
}

// ---------------------------------------------------------------------------
// The editor's form
// ---------------------------------------------------------------------------

export type SeasonDraft = {
  name: string;
  startDate: string;
  endDate: string;
  demandLevel: SeasonDemandLevel | "";
  message: string;
};

export type SeasonField = keyof SeasonDraft;
export type SeasonErrors = Partial<Record<SeasonField, string>>;

export const EMPTY_DRAFT: SeasonDraft = {
  name: "",
  startDate: "",
  endDate: "",
  demandLevel: "",
  message: "",
};

export function draftFromWindow(window: SeasonWindow): SeasonDraft {
  return {
    name: window.name,
    startDate: window.startDate,
    endDate: window.endDate,
    demandLevel: window.demandLevel,
    message: window.message,
  };
}

/** Mirrors the API's `400 invalid_season_window` checks, in words. */
export function validateSeasonDraft(draft: SeasonDraft): SeasonErrors {
  const errors: SeasonErrors = {};
  const name = draft.name.trim();
  const message = draft.message.trim();
  if (!name) errors.name = "Give the season a name clients will recognise.";
  else if (name.length > SEASON_LIMITS.name)
    errors.name = `Keep the name to ${SEASON_LIMITS.name} characters.`;

  if (!draft.startDate) errors.startDate = "Choose the first day of the season.";
  else if (!isDayKey(draft.startDate)) errors.startDate = "Enter a real date.";

  if (!draft.endDate) errors.endDate = "Choose the last day of the season.";
  else if (!isDayKey(draft.endDate)) errors.endDate = "Enter a real date.";
  else if (isDayKey(draft.startDate) && draft.endDate < draft.startDate)
    errors.endDate = "The last day can't be before the first day.";

  if (!draft.demandLevel) errors.demandLevel = "Choose how busy shops get.";

  if (!message) errors.message = "Write the message clients will read. It can't be empty.";
  else if (message.length > SEASON_LIMITS.message)
    errors.message = `Keep the message to ${SEASON_LIMITS.message} characters.`;
  return errors;
}

/** The trimmed request body; call only on a draft with no errors. */
export function inputFromDraft(draft: SeasonDraft): SeasonWindowInput {
  return {
    name: draft.name.trim(),
    startDate: draft.startDate,
    endDate: draft.endDate,
    demandLevel: draft.demandLevel as SeasonDemandLevel,
    message: draft.message.trim(),
  };
}

/** Only what changed, so an edit never rewrites a field nobody touched. */
export function changedFields(
  window: SeasonWindow,
  input: SeasonWindowInput,
): Partial<SeasonWindowInput> {
  const out: Partial<SeasonWindowInput> = {};
  for (const key of ["name", "startDate", "endDate", "demandLevel", "message"] as const) {
    if (window[key] !== input[key]) (out as Record<string, string>)[key] = input[key];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export type SeasonGroups = { current: SeasonWindow[]; upcoming: SeasonWindow[]; past: SeasonWindow[] };

/** Current and upcoming soonest first; past most recent first. */
export function groupSeasons(windows: SeasonWindow[]): SeasonGroups {
  const byStart = (a: SeasonWindow, b: SeasonWindow) =>
    a.startDate === b.startDate ? a.id.localeCompare(b.id) : a.startDate < b.startDate ? -1 : 1;
  const sorted = [...windows].sort(byStart);
  return {
    current: sorted.filter((w) => w.status === "current"),
    upcoming: sorted.filter((w) => w.status === "upcoming"),
    past: sorted.filter((w) => w.status === "past").reverse(),
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

const FIELD_NAMES: Record<string, SeasonField> = {
  name: "name",
  startDate: "startDate",
  endDate: "endDate",
  demandLevel: "demandLevel",
  message: "message",
};

/** A `400 invalid_season_window` pinned to the field the server named. */
export function seasonFieldError(err: unknown): { field: SeasonField; message: string } | null {
  if (!isApiError(err) || err.code !== "invalid_season_window") return null;
  const field = FIELD_NAMES[String(err.detail("field") ?? "")];
  if (!field) return null;
  const copy: Record<SeasonField, string> = {
    name: `The name is missing or longer than ${SEASON_LIMITS.name} characters.`,
    startDate: "The first day is not a real date.",
    endDate: "The last day is missing or before the first day.",
    demandLevel: "Choose Normal, Busy or Peak.",
    message: `The message is empty or longer than ${SEASON_LIMITS.message} characters.`,
  };
  return { field, message: copy[field] };
}

export function seasonErrorMessage(err: unknown, fallback: string): string {
  if (!isApiError(err)) return fallback;
  switch (err.code) {
    case "season_window_version_conflict":
      return "Someone changed this season since you opened it. The list has been refreshed; check it and try again.";
    case "season_window_not_found":
      return "That season no longer exists. The list has been refreshed.";
    case "invalid_season_window":
      return "Check the highlighted field and try again.";
    case "season_push_reason_required":
      return `Say why, in up to ${SEASON_LIMITS.reason} characters. It goes in the audit log.`;
    case "invalid_season_push_setting":
      return "The notice switch could not be read. Refresh and try again.";
  }
  switch (err.kind) {
    case "unauthorized":
      return "Your session expired. Sign in again as Super Admin.";
    case "forbidden":
      return "Only Super Admin can change season windows.";
    case "server":
      return "The API failed processing this request. Retry in a moment.";
    default:
      return fallback;
  }
}

/** A 409 or 404 means the list on screen is stale and must be re-read. */
export function seasonErrorNeedsReload(err: unknown): boolean {
  return (
    isApiError(err) &&
    (err.code === "season_window_version_conflict" || err.code === "season_window_not_found")
  );
}
