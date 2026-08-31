/**
 * Planning calendar composition from orders + live supplier services.
 * No dedicated calendar endpoint exists on the demo API.
 */

import type { Order, SupplierService, User } from "@/lib/api/types";

export type CalendarDay = {
  /** Local calendar date key YYYY-MM-DD */
  key: string;
  date: Date;
  isToday: boolean;
  /** Orders with promisedDate falling on this day. */
  deliveries: Order[];
  deliveryCount: number;
};

export type WeekRange = {
  /** Monday 00:00 local of the week containing anchor. */
  start: Date;
  /** Sunday end of that week (start + 6 days). */
  end: Date;
  days: Date[];
};

export type PlanningSnapshot = {
  week: WeekRange;
  days: CalendarDay[];
  /** Sum of capacityDaily across live services (platform capacity signal). */
  liveCapacityDaily: number | null;
  /** Sum of capacityWeekly across live services. */
  liveCapacityWeekly: number | null;
  liveServiceCount: number;
  verifiedSupplierCount: number;
  verifiedRiderCount: number;
  /** Honest gaps the API does not expose. */
  unavailable: {
    riderAvailability: string;
    zoneBlackouts: string;
  };
  agenda: AgendaItem[];
};

export type AgendaItem = {
  id: string;
  dateKey: string;
  at: string | null;
  title: string;
  /** An order placed through the storefront carries no zone; it is matched by distance. */
  zone: string | null | undefined;
  kind: "delivery";
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday-start week containing `anchor`. */
export function weekContaining(anchor: Date): WeekRange {
  const day = startOfLocalDay(anchor);
  // getDay: 0 Sun … 6 Sat → convert to Monday-based offset
  const dow = day.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const start = new Date(day);
  start.setDate(day.getDate() + mondayOffset);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  const end = days[6]!;
  return { start, end, days };
}

export function shiftWeek(anchor: Date, deltaWeeks: number): Date {
  const next = new Date(anchor);
  next.setDate(next.getDate() + deltaWeeks * 7);
  return next;
}

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function promisedDateKey(
  iso: string | null | undefined,
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return dateKey(d);
}

export function buildPlanningSnapshot(input: {
  orders: Order[];
  services: SupplierService[];
  users: User[];
  anchor: Date;
  today?: Date;
}): PlanningSnapshot {
  const today = startOfLocalDay(input.today ?? new Date());
  const week = weekContaining(input.anchor);
  const todayKey = dateKey(today);

  const byDay = new Map<string, Order[]>();
  for (const day of week.days) {
    byDay.set(dateKey(day), []);
  }

  for (const order of input.orders) {
    const key = promisedDateKey(order.promisedDate);
    if (!key) continue;
    const bucket = byDay.get(key);
    if (bucket) bucket.push(order);
  }

  const days: CalendarDay[] = week.days.map((d) => {
    const key = dateKey(d);
    const deliveries = byDay.get(key) ?? [];
    return {
      key,
      date: d,
      isToday: key === todayKey,
      deliveries,
      deliveryCount: deliveries.length,
    };
  });

  const live = input.services.filter((s) => s.state === "live");
  const capacityDailyValues = live
    .map((s) => s.capacityDaily)
    .filter((n): n is number => typeof n === "number");
  const capacityWeeklyValues = live
    .map((s) => s.capacityWeekly)
    .filter((n): n is number => typeof n === "number");

  const verifiedSupplierCount = input.users.filter(
    (u) => u.role === "supplier" && u.verificationStatus === "approved",
  ).length;
  const verifiedRiderCount = input.users.filter(
    (u) => u.role === "rider" && u.verificationStatus === "approved",
  ).length;

  const agenda: AgendaItem[] = days.flatMap((day) =>
    day.deliveries.map((o) => ({
      id: o.id,
      dateKey: day.key,
      at: o.promisedDate,
      title: o.title,
      zone: o.zone,
      kind: "delivery" as const,
    })),
  );

  return {
    week,
    days,
    liveCapacityDaily:
      capacityDailyValues.length > 0
        ? capacityDailyValues.reduce((a, b) => a + b, 0)
        : null,
    liveCapacityWeekly:
      capacityWeeklyValues.length > 0
        ? capacityWeeklyValues.reduce((a, b) => a + b, 0)
        : null,
    liveServiceCount: live.length,
    verifiedSupplierCount,
    verifiedRiderCount,
    unavailable: {
      riderAvailability:
        "Rider shift availability is not exposed by the demo API. Only verified rider count is shown.",
      zoneBlackouts:
        "Service-zone blackout calendars are not exposed by the demo API. No blackout rows can be shown.",
    },
    agenda,
  };
}

export function formatWeekHeading(week: WeekRange): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  const a = new Intl.DateTimeFormat("en-PH", opts).format(week.start);
  const b = new Intl.DateTimeFormat("en-PH", opts).format(week.end);
  return `${a} – ${b}`;
}

export function formatDayLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    day: "numeric",
  }).format(d);
}
