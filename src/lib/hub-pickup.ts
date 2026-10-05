/**
 * Hub pick-up hours and fee (gridgo-api#148, gridgo-client#158; contract
 * "Hub pick-up settings" in OPERATIONAL_MODEL_V2_API.md).
 *
 * A client who chooses Pick-up collects at GRIDGO's own counter. Super Admin
 * sets when that counter is open and a flat fee charged once per pick-up
 * order. The fee ships at ₱0 and the hours ship unset (`schedule: null`):
 * unset is "not configured", never "open all week", and a screen must say so.
 *
 * The schedule uses the API's shared weekly-window shape: weekday 0 Sunday …
 * 6 Saturday, whole minutes after midnight (0–1440), closing after opening,
 * no overlapping windows on one day, at most 28 windows, optional inclusive
 * `YYYY-MM-DD` closures (at most 120). Saving always sends the complete
 * `{schedule, feeMinor}`; the hub's point is read-only.
 *
 * Pure: no React, no fetch.
 */

import type { HubPickup, WeeklySchedule, WeeklyWindow } from "@/lib/api/types";
import { formatPhp, minorToPesosInput, pesosToMinor } from "@/lib/format";

export const HUB_WINDOW_MAX = 28;
export const HUB_CLOSURE_MAX = 120;
/** Philippine time. The hub is in Davao. */
export const MANILA_OFFSET_MINUTES = 480;

/** Monday first, as the week is read here. */
export const WEEKDAYS: ReadonlyArray<{ day: number; short: string; long: string }> = [
  { day: 1, short: "Mon", long: "Monday" },
  { day: 2, short: "Tue", long: "Tuesday" },
  { day: 3, short: "Wed", long: "Wednesday" },
  { day: 4, short: "Thu", long: "Thursday" },
  { day: 5, short: "Fri", long: "Friday" },
  { day: 6, short: "Sat", long: "Saturday" },
  { day: 0, short: "Sun", long: "Sunday" },
];

export type WindowDraft = { opens: string; closes: string };
export type ClosureDraft = { startDay: string; endDay: string };

export type HubDraft = {
  fee: string;
  /** False while the hours are unset (`schedule: null`). */
  configured: boolean;
  utcOffsetMinutes: number;
  /** Windows by weekday 0–6. An empty list is a closed day. */
  days: Record<number, WindowDraft[]>;
  closures: ClosureDraft[];
};

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 540 → "09:00". Midnight at the close of the day (1440) → "00:00", the only
 * way a time field can show it; `timeToMinutes(…, true)` reads it back as 1440.
 */
export function minutesToTime(minutes: number): string {
  if (minutes >= 1440) return "00:00";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * "09:00" → 540. A closing time of "00:00" or "24:00" means midnight at the
 * end of the day (1440), since a window never ends before it starts.
 */
export function timeToMinutes(value: string, closing = false): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (m > 59 || h > 24 || (h === 24 && m > 0)) return null;
  const total = h * 60 + m;
  if (closing && (total === 0 || total === 1440)) return 1440;
  return total === 1440 ? null : total;
}

/** 540 → "9:00 AM", 1440 → "midnight". */
export function clockLabel(minutes: number): string {
  if (minutes === 1440 || minutes === 0) return "midnight";
  if (minutes === 720) return "noon";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function emptyDays(): Record<number, WindowDraft[]> {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

export function hubDraft(hub: Pick<HubPickup, "schedule" | "feeMinor">): HubDraft {
  const days = emptyDays();
  for (const window of hub.schedule?.week ?? []) {
    days[window.weekday]?.push({
      opens: minutesToTime(window.opensMinute),
      closes: minutesToTime(window.closesMinute),
    });
  }
  for (const list of Object.values(days))
    list.sort((a, b) => a.opens.localeCompare(b.opens));
  return {
    fee: minorToPesosInput(hub.feeMinor ?? 0),
    configured: hub.schedule !== null && hub.schedule !== undefined,
    utcOffsetMinutes: hub.schedule?.utcOffsetMinutes ?? MANILA_OFFSET_MINUTES,
    days,
    closures: (hub.schedule?.closures ?? []).map((closure) => ({ ...closure })),
  };
}

/** A sensible first week to edit from, never saved without a person choosing it. */
export const STARTER_WINDOW: WindowDraft = { opens: "09:00", closes: "17:00" };

export type HubParse =
  | { value: { schedule: WeeklySchedule | null; feeMinor: number } }
  | { problem: string; field: string };

export function readHubFee(typed: string): number | null {
  const minor = pesosToMinor(typed);
  return minor !== null && Number.isSafeInteger(minor) ? minor : null;
}

/** Mirrors the API's checks so a refusal is explained before saving. */
export function parseHubDraft(draft: HubDraft): HubParse {
  const feeMinor = readHubFee(draft.fee);
  if (feeMinor === null) {
    return { problem: "Enter the fee in pesos, for example 0 or 50.00.", field: "fee" };
  }
  if (!draft.configured) return { value: { schedule: null, feeMinor } };

  const week: WeeklyWindow[] = [];
  for (const { day, long } of WEEKDAYS) {
    const parsed: WeeklyWindow[] = [];
    for (const [index, window] of (draft.days[day] ?? []).entries()) {
      const opens = timeToMinutes(window.opens);
      const closes = timeToMinutes(window.closes, true);
      const field = `day-${day}-${index}`;
      if (opens === null || closes === null) {
        return { problem: `${long}: enter an opening and a closing time.`, field };
      }
      if (closes <= opens) {
        return { problem: `${long}: closing time must be after opening time.`, field };
      }
      if (
        parsed.some((other) => opens < other.closesMinute && other.opensMinute < closes)
      ) {
        return { problem: `${long}: two opening hours overlap.`, field };
      }
      parsed.push({ weekday: day, opensMinute: opens, closesMinute: closes });
    }
    week.push(...parsed.sort((a, b) => a.opensMinute - b.opensMinute));
  }
  if (week.length === 0) {
    return {
      problem: "Open the hub on at least one day, or choose Clear hours.",
      field: "week",
    };
  }
  if (week.length > HUB_WINDOW_MAX) {
    return {
      problem: `Use at most ${HUB_WINDOW_MAX} opening hours across the week.`,
      field: "week",
    };
  }
  if (draft.closures.length > HUB_CLOSURE_MAX) {
    return { problem: `Use at most ${HUB_CLOSURE_MAX} closures.`, field: "closures" };
  }
  for (const [index, closure] of draft.closures.entries()) {
    const field = `closure-${index}`;
    if (!DAY_KEY.test(closure.startDay) || !DAY_KEY.test(closure.endDay)) {
      return { problem: "Each closure needs a first and a last day.", field };
    }
    if (closure.endDay < closure.startDay) {
      return { problem: "A closure cannot end before it starts.", field };
    }
  }
  return {
    value: {
      feeMinor,
      schedule: {
        utcOffsetMinutes: draft.utcOffsetMinutes,
        week,
        closures: draft.closures.map((closure) => ({ ...closure })),
      },
    },
  };
}

function sameWindows(a: WeeklyWindow[], b: WeeklyWindow[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (window, index) =>
        window.opensMinute === b[index].opensMinute &&
        window.closesMinute === b[index].closesMinute,
    )
  );
}

function windowsLabel(windows: WeeklyWindow[]): string {
  return windows
    .map(
      (window) =>
        `${clockLabel(window.opensMinute)} to ${clockLabel(window.closesMinute)}`,
    )
    .join(", ");
}

/**
 * The week in a few lines, days with the same hours run together:
 * "Mon, Wed, Fri: 9:00 AM to 5:00 PM". Closed days are left out.
 */
export function scheduleLines(schedule: WeeklySchedule | null | undefined): string[] {
  if (!schedule) return [];
  const groups: { days: string[]; windows: WeeklyWindow[] }[] = [];
  for (const { day, short } of WEEKDAYS) {
    const windows = schedule.week
      .filter((window) => window.weekday === day)
      .sort((a, b) => a.opensMinute - b.opensMinute);
    if (!windows.length) continue;
    const same = groups.find((group) => sameWindows(group.windows, windows));
    if (same) same.days.push(short);
    else groups.push({ days: [short], windows });
  }
  return groups.map(
    (group) => `${group.days.join(", ")}: ${windowsLabel(group.windows)}`,
  );
}

/** The audited reason sent with a save, naming what moved. */
export function hubChangeReason(
  stored: Pick<HubPickup, "schedule" | "feeMinor">,
  next: Pick<HubPickup, "schedule" | "feeMinor">,
): string {
  const parts: string[] = [];
  if (stored.feeMinor !== next.feeMinor) {
    parts.push(`fee ${formatPhp(stored.feeMinor)} to ${formatPhp(next.feeMinor)}`);
  }
  if (JSON.stringify(stored.schedule) !== JSON.stringify(next.schedule)) {
    parts.push(next.schedule ? "opening hours updated" : "opening hours cleared");
  }
  return `Hub pick-up: ${parts.length ? parts.join("; ") : "saved unchanged"}`;
}

/** The fee in plain words: ₱0 reads "Free". */
export function hubFeeLabel(feeMinor: number): string {
  return feeMinor === 0 ? "Free (₱0.00)" : formatPhp(feeMinor);
}
