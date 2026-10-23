import type { ShopHours, WeeklyWindow } from "@/lib/api/types";

import { closureOnDay } from "@/lib/shop-hours";

import { dayKeyFromDate } from "./schedule";

export type DayFace =
  "closure" | "not-working" | "open" | "booked" | "unknown" | "booked-unknown";

export function workingWeekday(week: WeeklyWindow[], weekday: number): boolean {
  return week.some((window) => window.weekday === weekday);
}

/** How a day reads. Hours that have not loaded never invent a closure. */
export function dayFace(
  day: Date,
  hours:
    | (Pick<ShopHours, "week" | "closures"> &
        Partial<Pick<ShopHours, "calendarAvailable">>)
    | null,
  jobCount: number,
): DayFace {
  if (!hours || hours.calendarAvailable === false)
    return jobCount ? "booked-unknown" : "unknown";
  const key = dayKeyFromDate(day);
  if (closureOnDay(hours.closures, key)) return "closure";
  if (!workingWeekday(hours.week, day.getDay())) return "not-working";
  return jobCount ? "booked" : "open";
}

export function monthCellLabel(face: DayFace): string {
  switch (face) {
    case "closure":
      return "Closure date";
    case "not-working":
      return "Not a working day";
    case "open":
      return "Nothing booked";
    case "booked":
      return "Jobs due";
    case "unknown":
      return "Hours unavailable";
    case "booked-unknown":
      return "Jobs due · hours unavailable";
  }
}

export function selectedDayEmpty(face: DayFace, jobCount: number): string | null {
  if (jobCount > 0) return null;
  if (face === "unknown") return "No jobs due. Opening hours unavailable.";
  if (face === "closure") return "Closed, and nothing promised.";
  if (face === "not-working") return "Closed, and nothing promised.";
  return "Nothing promised.";
}

export function closureBanner(face: DayFace): string | null {
  return face === "closure" ? "Shop closed — one of your closure dates" : null;
}
