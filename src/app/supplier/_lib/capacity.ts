/**
 * Capacity derivation for the supplier shop.
 * Declared capacity comes from live service lines; committed load from accepted jobs.
 * Never invents figures the API does not supply.
 */

import type {
  Order,
  SupplierService,
  UpdateSupplierServiceInput,
} from "@/lib/api/types";
import {
  DEFAULT_DAY_MINUTES,
  readServiceLineTime,
  sameTime,
  singleTimeProblem,
  timeFields,
  workingDays,
  type ProductionTime,
} from "@/lib/production-time";

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

// ---------------------------------------------------------------------------
// Editing one live line: its capacity and usual production time
// ---------------------------------------------------------------------------

/** What a shop edits on one service line. Capacity stays text so a blank is "not set". */
export type ServiceLineDraft = {
  capacityDaily: string;
  capacityWeekly: string;
  /** The line's usual production time: hours for same-day work, else working days. */
  turnaround: ProductionTime;
};

/** A line with no usual time yet starts here, as in the supplier app. */
const DEFAULT_LINE_TIME = workingDays(2);

export function serviceLineDraft(service: SupplierService): ServiceLineDraft {
  return {
    capacityDaily: service.capacityDaily != null ? String(service.capacityDaily) : "",
    capacityWeekly: service.capacityWeekly != null ? String(service.capacityWeekly) : "",
    turnaround: serviceLineTime(service) ?? DEFAULT_LINE_TIME,
  };
}

/** The line's usual production time as GRIDGO holds it, or null when it has none. */
export function serviceLineTime(service: SupplierService): ProductionTime | null {
  return readServiceLineTime(service as unknown as Record<string, unknown>);
}

/** The shop's working day for this line; GRIDGO's ten-hour default when not sent. */
export function serviceLineDayMinutes(service: SupplierService): number {
  return service.productionDayMinutes ?? DEFAULT_DAY_MINUTES;
}

function wholeCount(raw: string): number | null | "invalid" {
  const text = raw.trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= 0 ? value : "invalid";
}

/** Why the draft cannot be saved, naming the fix. Null when it can. */
export function serviceLineProblem(
  draft: ServiceLineDraft,
  dayMinutes: number = DEFAULT_DAY_MINUTES,
): string | null {
  const daily = wholeCount(draft.capacityDaily);
  const weekly = wholeCount(draft.capacityWeekly);
  if (daily === "invalid") return "Daily capacity is a whole number of units, like 500.";
  if (weekly === "invalid") return "Weekly capacity is a whole number of units, like 2500.";
  if (daily != null && weekly != null && weekly > 0 && weekly < daily) {
    return "Weekly capacity is lower than daily capacity. Raise the weekly figure or lower the daily one.";
  }
  return singleTimeProblem(draft.turnaround, dayMinutes);
}

/**
 * What a save sends: the counts that are set, and the production time in its
 * own unit's field only when it changed. GRIDGO keeps any field left out.
 */
export function serviceLinePatch(
  service: SupplierService,
  draft: ServiceLineDraft,
): UpdateSupplierServiceInput {
  const patch: UpdateSupplierServiceInput = {};
  const daily = wholeCount(draft.capacityDaily);
  const weekly = wholeCount(draft.capacityWeekly);
  if (typeof daily === "number") patch.capacityDaily = daily;
  if (typeof weekly === "number") patch.capacityWeekly = weekly;
  if (!sameTime(serviceLineTime(service), draft.turnaround)) {
    Object.assign(patch, timeFields("turnaround", draft.turnaround));
  }
  return patch;
}
