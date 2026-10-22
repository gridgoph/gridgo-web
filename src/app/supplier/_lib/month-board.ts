import type { ScheduleClosure, ShopHours, SupplierService, WeeklyWindow } from "@/lib/api/types";

import { dayKeyFromDate } from "./schedule";

export type DayFace = "closure" | "not-working" | "open" | "booked";

export function closureOn(closures: ScheduleClosure[], dayKey: string): boolean {
  return closures.some((closure) => dayKey >= closure.startDay && dayKey <= closure.endDay);
}

export function workingWeekday(week: WeeklyWindow[], weekday: number): boolean {
  return week.some((window) => window.weekday === weekday);
}

export function dailyCapacity(services: Pick<SupplierService, "capacityDaily" | "state">[]): number | null {
  const live = services.filter((service) => service.state === "live" && typeof service.capacityDaily === "number");
  if (!live.length) return null;
  return live.reduce((sum, service) => sum + (service.capacityDaily ?? 0), 0);
}

/** How a day reads. Hours that have not loaded never invent a closure. */
export function dayFace(
  day: Date,
  hours: Pick<ShopHours, "week" | "closures"> | null,
  jobCount: number,
): DayFace {
  if (!hours) return jobCount ? "booked" : "open";
  const key = dayKeyFromDate(day);
  if (closureOn(hours.closures, key)) return "closure";
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
      return "Open";
  }
}

export function selectedDayEmpty(face: DayFace, jobCount: number): string | null {
  if (jobCount > 0) return null;
  if (face === "closure") return "Closed, and nothing promised.";
  if (face === "not-working") return "Closed, and nothing promised.";
  return "Nothing promised.";
}

export function closureBanner(face: DayFace): string | null {
  return face === "closure" ? "Shop closed — one of your closure dates" : null;
}
