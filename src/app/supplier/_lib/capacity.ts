/**
 * Capacity derivation for the supplier shop.
 * Declared capacity comes from live service lines; committed load from accepted jobs.
 * Never invents figures the API does not supply.
 */

import type { Order, SupplierService } from "@/lib/api/types";

/** Order states that still consume shop production capacity. */
export const CAPACITY_COMMITTING_STATES = [
  "awaiting_downpayment",
  "downpayment_review",
  "payment_authorized",
  "production",
  "supplier_self_qc",
  "ready_for_dispatch",
] as const;

export type CapacityCommittingState =
  (typeof CAPACITY_COMMITTING_STATES)[number];

export function isCapacityCommitting(state: string): boolean {
  return (CAPACITY_COMMITTING_STATES as readonly string[]).includes(state);
}

export type DeclaredCapacity = {
  /** Sum of capacityDaily on live lines; null if no live line declares a daily figure. */
  daily: number | null;
  /** Sum of capacityWeekly on live lines; null if no live line declares a weekly figure. */
  weekly: number | null;
  liveLineCount: number;
  linesWithDaily: number;
  linesWithWeekly: number;
};

export function sumDeclaredCapacity(
  services: SupplierService[],
): DeclaredCapacity {
  const live = services.filter((s) => s.state === "live");
  let dailySum = 0;
  let weeklySum = 0;
  let linesWithDaily = 0;
  let linesWithWeekly = 0;

  for (const s of live) {
    if (s.capacityDaily != null && Number.isFinite(s.capacityDaily)) {
      dailySum += s.capacityDaily;
      linesWithDaily += 1;
    }
    if (s.capacityWeekly != null && Number.isFinite(s.capacityWeekly)) {
      weeklySum += s.capacityWeekly;
      linesWithWeekly += 1;
    }
  }

  return {
    daily: linesWithDaily > 0 ? dailySum : null,
    weekly: linesWithWeekly > 0 ? weeklySum : null,
    liveLineCount: live.length,
    linesWithDaily,
    linesWithWeekly,
  };
}

export type CommittedLoad = {
  jobCount: number;
  /** Sum of order.quantity for committing jobs (units in flight). */
  unitCount: number;
  jobs: Order[];
};

export function committedLoad(jobs: Order[]): CommittedLoad {
  const committing = jobs.filter((j) => isCapacityCommitting(j.state));
  return {
    jobCount: committing.length,
    unitCount: committing.reduce((sum, j) => sum + (j.quantity || 0), 0),
    jobs: committing,
  };
}

export type CapacitySnapshot = {
  declared: DeclaredCapacity;
  committed: CommittedLoad;
  /**
   * Remaining daily headroom when both figures exist.
   * Compared as units (job quantities) against declared daily capacity.
   * null when either side is unavailable — never invents remaining.
   */
  remainingDaily: number | null;
  remainingWeekly: number | null;
  /** Plain guidance for empty or partial data. */
  notes: string[];
};

export function buildCapacitySnapshot(
  services: SupplierService[],
  jobs: Order[],
): CapacitySnapshot {
  const declared = sumDeclaredCapacity(services);
  const committed = committedLoad(jobs);
  const notes: string[] = [];

  if (declared.liveLineCount === 0) {
    notes.push(
      "No live service lines yet. Declare capacity on a live catalogue line to see shop headroom.",
    );
  } else {
    if (declared.daily == null) {
      notes.push(
        "Daily capacity is not set on any live line. Edit a live service to declare a daily figure.",
      );
    }
    if (declared.weekly == null) {
      notes.push(
        "Weekly capacity is not set on any live line. Edit a live service to declare a weekly figure.",
      );
    }
    if (
      declared.linesWithDaily < declared.liveLineCount ||
      declared.linesWithWeekly < declared.liveLineCount
    ) {
      notes.push(
        "Some live lines omit daily or weekly capacity. Totals only include lines that declare a figure.",
      );
    }
  }

  notes.push(
    "Committed load counts accepted jobs still in production (accepted through ready for dispatch). Dispatch and delivery no longer hold shop capacity.",
  );

  const remainingDaily =
    declared.daily != null ? declared.daily - committed.unitCount : null;
  const remainingWeekly =
    declared.weekly != null ? declared.weekly - committed.unitCount : null;

  return {
    declared,
    committed,
    remainingDaily,
    remainingWeekly,
    notes,
  };
}

/** Format a capacity figure or an honest unavailable label. */
export function formatCapacityFigure(
  value: number | null | undefined,
  unitSingular = "unit",
): string {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  const unit =
    Math.abs(value) === 1 ? unitSingular : `${unitSingular}s`;
  return `${value.toLocaleString("en-PH")} ${unit}`;
}
