/**
 * Shop performance, warnings only (gridgo-api docs/SUPPLIER_PERFORMANCE_API.md,
 * tracker 223 decision B). Every late finish past the one-hour shop-time grace
 * sends the shop a written notice; repeated incidents add warnings, hide the
 * shop from Top Pick for seven days, or flag it for a roster review. No money
 * is taken, so nothing here ever shows an amount or a rate.
 *
 * The thresholds below are the contract's, for explaining a count; the API
 * decides every consequence and the screens show what it returned.
 */

import type {
  PerformanceEvent,
  SupplierPerformance,
} from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";
import { formatDate } from "@/lib/format";

export const PERFORMANCE_WINDOW_DAYS = 30;
export const TOP_PICK_HIDE_DAYS = 7;

const KIND_LABEL: Record<string, string> = {
  late_finish: "Late finish",
  on_time_finish: "Finished on time",
  declined: "Declined a job",
  timed_out: "Missed the acceptance hour",
  cancelled: "Cancelled an accepted job",
  arrived_packed: "Packed before the rider's check",
  no_fault: "Marked no-fault",
};

export function eventKindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? "Recorded event";
}

const WARNING_LABEL: Record<string, string> = {
  late_finish: "Late-finish notice",
  repeated_declines: "Declined 3 jobs in 30 days",
  repeated_timeouts: "Missed the acceptance hour twice or more in 30 days",
  accepted_order_cancelled: "Cancelled an accepted job",
  repeated_arrived_packed: "Packed before the rider's check on 2 jobs in 30 days",
};

export function warningLabel(code: string): string {
  return WARNING_LABEL[code] ?? "Warning";
}

const TIER_LABEL: Record<string, string> = {
  minor: "Minor: over 1 hour late",
  moderate: "Moderate: over 6 hours late",
  severe: "Severe: over 24 hours late",
};

export function tierLabel(tier: string | null): string | null {
  if (!tier) return null;
  return TIER_LABEL[tier] ?? "Late";
}

/** Shop hours, never wall-clock hours; the grace hour is not subtracted. */
export function hoursLateText(event: Pick<PerformanceEvent, "workingLateMs" | "hoursLate">): string | null {
  const ms = event.workingLateMs ?? (event.hoursLate === null ? null : event.hoursLate * 3_600_000);
  if (ms === null || !Number.isFinite(ms)) return null;
  const minutes = Math.round(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts = [
    hours ? `${hours.toLocaleString("en-PH")} ${hours === 1 ? "hour" : "hours"}` : null,
    rest ? `${rest} min` : null,
  ].filter(Boolean);
  return `${parts.length ? parts.join(" ") : "0 min"} late in shop hours`;
}

/** "92%" or null when there is no finished work in the window. */
export function onTimeRateText(onTime: SupplierPerformance["onTime"]): string | null {
  if (onTime.rate === null || !onTime.completed) return null;
  return `${Math.round(onTime.rate * 100)}%`;
}

export function onTimeDetail(onTime: SupplierPerformance["onTime"]): string {
  if (!onTime.completed) return `No finished work in the last ${PERFORMANCE_WINDOW_DAYS} days`;
  return `${onTime.onTime} of ${onTime.completed} finished jobs on time`;
}

export type Chip = { label: string; tone: StatusTone; icon: StatusIconName };

export function topPickChip(topPick: SupplierPerformance["topPick"]): Chip {
  return topPick.hidden
    ? {
        label: topPick.hiddenUntil
          ? `Hidden from Top Pick until ${formatDate(topPick.hiddenUntil)}`
          : "Hidden from Top Pick",
        tone: "warning",
        icon: "ban",
      }
    : { label: "Can be Top Pick", tone: "success", icon: "circle-check" };
}

export const ROSTER_REVIEW_CHIP: Chip = {
  label: "Roster review",
  tone: "warning",
  icon: "triangle-alert",
};

export function eventChip(event: PerformanceEvent): Chip {
  if (event.kind === "no_fault") return { label: "No-fault", tone: "neutral", icon: "circle-help" };
  if (event.exempt) return { label: "Exempt", tone: "neutral", icon: "circle-dashed" };
  if (event.kind === "on_time_finish") return { label: "On time", tone: "success", icon: "circle-check" };
  if (event.warningCodes.length) return { label: "Warning", tone: "warning", icon: "triangle-alert" };
  return { label: "Counted", tone: "neutral", icon: "circle-dot" };
}

/** Super Admin may exempt a late finish that is not already exempt. */
export function canMarkNoFault(event: PerformanceEvent): boolean {
  return event.kind === "late_finish" && !event.exempt;
}

export const NO_FAULT_REASON_MAX = 2000;

/** The counts that can carry a consequence, in words, for a row or a card. */
export function countLines(counts: SupplierPerformance["counts"]): Array<{
  label: string;
  value: number;
  rule: string;
}> {
  return [
    {
      label: "Late finishes",
      value: counts.lateFinishes,
      rule: "A notice for each; at 2, hidden from Top Pick for 7 days; at 3, roster review.",
    },
    {
      label: "Missed acceptance hours",
      value: counts.timeouts,
      rule: "At 2, a warning; at 3, hidden from Top Pick for 7 days.",
    },
    {
      label: "Declines",
      value: counts.declines,
      rule: "At 3, a warning.",
    },
    {
      label: "Cancelled after accepting",
      value: counts.cancellations,
      rule: "A warning at once; at 2, roster review.",
    },
    {
      label: "Packed before the rider's check",
      value: counts.arrivedPacked,
      rule: "On 2 different jobs, a warning.",
    },
  ];
}

export type ShopPerformanceRow = {
  supplierId: string;
  shopName: string;
  performance: SupplierPerformance;
  warnings: number;
  incidents: number;
  latestAt: string | null;
};

export function incidentCount(counts: SupplierPerformance["counts"]): number {
  return (
    counts.lateFinishes +
    counts.timeouts +
    counts.declines +
    counts.cancellations +
    counts.arrivedPacked
  );
}

export function performanceRow(
  performance: SupplierPerformance,
  shopName: string,
): ShopPerformanceRow {
  return {
    supplierId: performance.supplierId,
    shopName,
    performance,
    warnings: performance.warnings.length,
    incidents: incidentCount(performance.counts),
    latestAt: performance.events[0]?.at ?? null,
  };
}

/** Shops needing a look first: roster review, then hidden, then most warnings. */
export function sortPerformanceRows(rows: ShopPerformanceRow[]): ShopPerformanceRow[] {
  return [...rows].sort(
    (a, b) =>
      Number(b.performance.rosterReview) - Number(a.performance.rosterReview) ||
      Number(b.performance.topPick.hidden) - Number(a.performance.topPick.hidden) ||
      b.warnings - a.warnings ||
      b.incidents - a.incidents ||
      a.shopName.localeCompare(b.shopName),
  );
}

export function needsAttention(row: ShopPerformanceRow): boolean {
  return (
    row.performance.rosterReview ||
    row.performance.topPick.hidden ||
    row.warnings > 0 ||
    row.incidents > 0
  );
}

/**
 * The shop that recorded an event for this order, for an inbox notice that
 * names only the order. Null when no shop's history holds it.
 */
export function shopForOrder(shops: SupplierPerformance[], orderId: string): string | null {
  return (
    shops.find((shop) => shop.events.some((event) => event.orderId === orderId))?.supplierId ??
    null
  );
}

const ERROR_COPY: Record<string, string> = {
  reason_required: `Write why this is no-fault, in ${NO_FAULT_REASON_MAX.toLocaleString("en-PH")} characters or fewer.`,
  forbidden: "Only Super Admin can mark a late finish no-fault.",
  supplier_not_found: "This shop has no performance record for that order. Refresh the page.",
  order_not_found: "That order no longer exists. Refresh the page.",
  performance_not_active:
    "Shop performance has not started on this server yet, so nothing can be marked no-fault.",
};

export function performanceErrorCopy(code: string | undefined): string | null {
  return code ? (ERROR_COPY[code] ?? null) : null;
}
