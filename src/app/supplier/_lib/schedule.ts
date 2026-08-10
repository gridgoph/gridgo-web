/**
 * Production schedule helpers — accepted jobs by promised date / deadline.
 * No separate schedule endpoint; compose from listJobs.
 */

import type { Order } from "@/lib/api/types";

/** Jobs the shop has accepted and should plan production around. */
export const SCHEDULE_STATES = [
  "awaiting_downpayment",
  "downpayment_review",
  "payment_authorized",
  "production",
  "supplier_self_qc",
  "ready_for_dispatch",
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
] as const;

export function isOnSchedule(state: string): boolean {
  return (SCHEDULE_STATES as readonly string[]).includes(state);
}

/** Prefer promised date, fall back to deadline. */
export function scheduleDateIso(job: Order): string | null {
  return job.promisedDate || job.deadline || null;
}

/** Local calendar day key YYYY-MM-DD for a job's schedule date. */
export function dayKeyForJob(
  job: Order,
  timeZone = "Asia/Manila",
): string | null {
  const iso = scheduleDateIso(job);
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export type ScheduleViewMode = "day" | "week";

export type DateRange = {
  start: Date;
  end: Date;
};

/** Start of local calendar day. */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** End of local calendar day (inclusive for display). */
export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Monday-start week containing `anchor`. */
export function weekContaining(anchor: Date): DateRange {
  const start = startOfDay(anchor);
  const day = start.getDay(); // 0 Sun … 6 Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);
  const end = endOfDay(new Date(start));
  end.setDate(start.getDate() + 6);
  return { start, end };
}

export function dayContaining(anchor: Date): DateRange {
  return { start: startOfDay(anchor), end: endOfDay(anchor) };
}

export function shiftRange(
  range: DateRange,
  mode: ScheduleViewMode,
  direction: -1 | 1,
): DateRange {
  const days = mode === "day" ? 1 : 7;
  const start = new Date(range.start);
  start.setDate(start.getDate() + days * direction);
  if (mode === "day") return dayContaining(start);
  return weekContaining(start);
}

export function eachDayInRange(range: DateRange): Date[] {
  const days: Date[] = [];
  const cursor = startOfDay(range.start);
  const last = startOfDay(range.end);
  while (cursor <= last) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function dayKeyFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return dayKeyFromDate(a) === dayKeyFromDate(b);
}

export function jobInRange(
  job: Order,
  range: DateRange,
  timeZone = "Asia/Manila",
): boolean {
  const key = dayKeyForJob(job, timeZone);
  if (!key) return false;
  // Compare using local range day keys so UI range matches grid columns.
  const startKey = dayKeyFromDate(range.start);
  const endKey = dayKeyFromDate(range.end);
  return key >= startKey && key <= endKey;
}

export type ScheduleEntry = {
  job: Order;
  dayKey: string | null;
  sortIso: string;
};

export function buildScheduleEntries(jobs: Order[]): ScheduleEntry[] {
  return jobs
    .filter((j) => isOnSchedule(j.state))
    .map((job) => {
      const iso = scheduleDateIso(job);
      return {
        job,
        dayKey: dayKeyForJob(job),
        sortIso: iso || "9999-12-31",
      };
    })
    .sort((a, b) => a.sortIso.localeCompare(b.sortIso));
}

export function filterEntriesInRange(
  entries: ScheduleEntry[],
  range: DateRange,
): ScheduleEntry[] {
  const startKey = dayKeyFromDate(range.start);
  const endKey = dayKeyFromDate(range.end);
  return entries.filter((e) => {
    if (!e.dayKey) return false;
    return e.dayKey >= startKey && e.dayKey <= endKey;
  });
}

export function groupEntriesByDay(
  entries: ScheduleEntry[],
): Map<string, ScheduleEntry[]> {
  const map = new Map<string, ScheduleEntry[]>();
  for (const e of entries) {
    const key = e.dayKey ?? "unscheduled";
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return map;
}

export function formatRangeLabel(range: DateRange, mode: ScheduleViewMode): string {
  const opts: Intl.DateTimeFormatOptions =
    mode === "day"
      ? { weekday: "short", day: "numeric", month: "short", year: "numeric" }
      : { day: "numeric", month: "short", year: "numeric" };
  const fmt = new Intl.DateTimeFormat("en-PH", opts);
  if (mode === "day") return fmt.format(range.start);
  return `${fmt.format(range.start)} – ${fmt.format(range.end)}`;
}
