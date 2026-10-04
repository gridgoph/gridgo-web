/**
 * Late-production penalties, read for Operations and Super Admin.
 * Contract: gridgo-api docs/PRODUCTION_PENALTIES_API.md (gridgo-api#123).
 *
 * A shop that finishes after its ready-by time gets a lapse: a warning first,
 * then (only while Super Admin's real-deductions switch is on, and only for a
 * lapse that began with it on) one deduction from what GRIDGO still owes the
 * shop on that order. Recent lapses also cost the shop quality points in
 * matching. The tier bands, the 30-day window and the 2-point / 10-point
 * ranking rule are API constants, not settings, so they live here; the three
 * rates and the switch are settings and are only ever read from the API.
 *
 * Pure functions, unit tested.
 */

import type {
  Order,
  ProductionLapse,
  ProductionPenaltyPolicy,
  ProductionPenaltyTier,
} from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";
import {
  applyRateBps,
  bpsToPercentInput,
  formatRatePercent,
  percentInputToBps,
} from "@/components/settings/service-fee";

export const PENALTY_TIERS: readonly ProductionPenaltyTier[] = ["minor", "moderate", "severe"];

/** Shipped rates (the captain, 4 Oct 2026): 5% / 15% / 30%, deductions off. */
export const DEFAULT_PRODUCTION_PENALTY: ProductionPenaltyPolicy = {
  deductionsEnabled: false,
  minorBps: 500,
  moderateBps: 1_500,
  severeBps: 3_000,
};

/** How each tier is measured. Fixed in the API (`latenessTier`). */
export const TIER_BANDS: Record<ProductionPenaltyTier, string> = {
  minor: "Up to 6 hours late",
  moderate: "6 to 24 hours late, with a formal warning",
  severe: "Over 24 hours late, or no word from the shop",
};

export const TIER_LABELS: Record<ProductionPenaltyTier, string> = {
  minor: "Minor",
  moderate: "Moderate",
  severe: "Severe",
};

/** Matching counts a lapse whose missed deadline is this recent. */
export const RECENT_LAPSE_DAYS = 30;
export const QUALITY_POINTS_PER_LAPSE = 2;
export const QUALITY_POINTS_CAP = 10;
/** Recent lapses after which the ranking effect stops growing (10 / 2). */
export const LAPSES_TO_CAP = QUALITY_POINTS_CAP / QUALITY_POINTS_PER_LAPSE;

function tierOf(tier: string): ProductionPenaltyTier {
  return tier === "moderate" || tier === "severe" ? tier : "minor";
}

export type Presentation = { label: string; tone: StatusTone; icon: StatusIconName };

export function presentTier(tier: string): Presentation {
  const known = tierOf(tier);
  if (known === "severe") return { label: "Severe", tone: "error", icon: "circle-x" };
  if (known === "moderate") return { label: "Moderate", tone: "warning", icon: "triangle-alert" };
  return { label: "Minor", tone: "neutral", icon: "clock" };
}

/**
 * Where the money side of a lapse stands. A `warned` lapse waits for its one
 * assessment, but only while the live switch is on: turning it off stops
 * pending deductions, so it reads as paused rather than pending.
 */
export function presentLapseStatus(lapse: ProductionLapse, deductionsOn: boolean | null): Presentation {
  switch (lapse.status) {
    case "applied":
      return { label: "Deducted", tone: "warning", icon: "circle-check" };
    case "closed":
      return { label: "Closed, nothing deducted", tone: "neutral", icon: "ban" };
    case "warned":
      return deductionsOn === false
        ? { label: "Deduction paused", tone: "neutral", icon: "circle-dashed" }
        : { label: "Deduction pending", tone: "info", icon: "clock" };
    default:
      return { label: "Warning only", tone: "neutral", icon: "circle-dot" };
  }
}

/** "45 min", "3 h 20 min", "2 d 4 h". Minutes round down; under a minute is "under a minute". */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "under a minute";
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return mins ? `${hours} h ${mins} min` : `${hours} h`;
  return `${mins} min`;
}

const ACTIVE_PRODUCTION = new Set(["payment_authorized", "production", "supplier_self_qc"]);

export type Lateness =
  /** Marked ready this long after the deadline. */
  | { kind: "finished"; lateMs: number }
  /** Still in production; this long past the deadline so far. */
  | { kind: "running"; lateMs: number }
  /** The order is not readable here; only the tier band is known. */
  | { kind: "unknown" };

/** How late the job was, from the order's own ready time when the portal has it. */
export function latenessOf(lapse: ProductionLapse, order: Order | undefined, now: number): Lateness {
  const deadline = Date.parse(lapse.deadlineAt);
  if (!order || !Number.isFinite(deadline)) return { kind: "unknown" };
  if (order.readyAt) {
    const ready = Date.parse(order.readyAt);
    return Number.isFinite(ready) ? { kind: "finished", lateMs: ready - deadline } : { kind: "unknown" };
  }
  if (ACTIVE_PRODUCTION.has(order.state)) return { kind: "running", lateMs: now - deadline };
  return { kind: "unknown" };
}

export function latenessText(lateness: Lateness, tier: string): string {
  if (lateness.kind === "finished") return `Ready ${formatDuration(lateness.lateMs)} late`;
  if (lateness.kind === "running") return `Not ready, ${formatDuration(lateness.lateMs)} past`;
  return TIER_BANDS[tierOf(tier)];
}

/**
 * What GRIDGO still owes the shop on the order right now: its unpaid,
 * non-superseded payout stages (already net of any deduction). Null when the
 * order carries no stage amounts the portal can add up.
 */
export function unpaidPayoutMinor(order: Order | undefined): number | null {
  const stages = order?.payoutMilestones;
  if (!stages?.length) return null;
  let sum = 0;
  for (const stage of stages) {
    if (stage.status === "released" || stage.status === "superseded") continue;
    if (typeof stage.amountMinor !== "number") return null;
    sum += stage.amountMinor;
  }
  return sum;
}

/** Total late-production deductions on an order's payout stages. */
export function orderDeductionMinor(order: Pick<Order, "payoutMilestones">): number {
  return (order.payoutMilestones ?? []).reduce(
    (sum, stage) => sum + (stage.productionDeductionMinor ?? 0),
    0,
  );
}

/** Operations may record "no word from the shop" only on an open, unfinished, overdue job. */
export function canRecordNoCommunication(lapse: ProductionLapse, order: Order | undefined, now: number): boolean {
  if (!order || order.readyAt || !ACTIVE_PRODUCTION.has(order.state)) return false;
  if (lapse.status === "applied" || lapse.status === "closed" || tierOf(lapse.tier) === "severe") return false;
  return Date.parse(lapse.deadlineAt) < now;
}

export function isRecentLapse(lapse: ProductionLapse, now: number): boolean {
  const deadline = Date.parse(lapse.deadlineAt);
  return Number.isFinite(deadline) && deadline <= now && deadline >= now - RECENT_LAPSE_DAYS * 86_400_000;
}

export function qualityPointsLost(recentCount: number): number {
  return Math.min(QUALITY_POINTS_CAP, recentCount * QUALITY_POINTS_PER_LAPSE);
}

export type ShopLapseSummary = {
  supplierId: string;
  shopName: string;
  /** Lapses whose deadline fell in the last 30 days, newest first. */
  recent: ProductionLapse[];
  total: number;
  byTier: Record<ProductionPenaltyTier, number>;
  formalWarnings: number;
  deductedMinor: number;
  /** Lapses still waiting on their one deduction. */
  pending: number;
  latestDeadlineAt: string | null;
};

export function summarizeShop(
  supplierId: string,
  shopName: string,
  lapses: readonly ProductionLapse[],
  now: number,
): ShopLapseSummary {
  const byTier: Record<ProductionPenaltyTier, number> = { minor: 0, moderate: 0, severe: 0 };
  let formalWarnings = 0;
  let deductedMinor = 0;
  let pending = 0;
  let latest: string | null = null;
  for (const lapse of lapses) {
    byTier[tierOf(lapse.tier)] += 1;
    formalWarnings += lapse.warnings.filter((warning) => warning.formal).length;
    if (lapse.status === "applied") deductedMinor += lapse.deductionMinor;
    if (lapse.status === "warned") pending += 1;
    if (!latest || lapse.deadlineAt > latest) latest = lapse.deadlineAt;
  }
  const recent = lapses
    .filter((lapse) => isRecentLapse(lapse, now))
    .sort((a, b) => b.deadlineAt.localeCompare(a.deadlineAt));
  return {
    supplierId,
    shopName,
    recent,
    total: lapses.length,
    byTier,
    formalWarnings,
    deductedMinor,
    pending,
    latestDeadlineAt: latest,
  };
}

function worstRecent(summary: ShopLapseSummary): number {
  return summary.recent.reduce((worst, lapse) => Math.max(worst, PENALTY_TIERS.indexOf(tierOf(lapse.tier))), -1);
}

/**
 * Problem shops first: most late orders in the last 30 days, then the worst
 * recent tier, then the most late orders ever, then the most recent miss.
 */
export function sortFleet(rows: readonly ShopLapseSummary[]): ShopLapseSummary[] {
  return [...rows].sort(
    (a, b) =>
      b.recent.length - a.recent.length ||
      worstRecent(b) - worstRecent(a) ||
      b.total - a.total ||
      (b.latestDeadlineAt ?? "").localeCompare(a.latestDeadlineAt ?? "") ||
      a.shopName.localeCompare(b.shopName),
  );
}

// ---------------------------------------------------------------------------
// The Super Admin settings card
// ---------------------------------------------------------------------------

export type PenaltyRateDraft = Record<ProductionPenaltyTier, string>;

export function penaltyRateDraft(policy: ProductionPenaltyPolicy): PenaltyRateDraft {
  return {
    minor: bpsToPercentInput(policy.minorBps),
    moderate: bpsToPercentInput(policy.moderateBps),
    severe: bpsToPercentInput(policy.severeBps),
  };
}

export const PENALTY_RATE_INVALID =
  "Each rate is a percentage from 0 to 100 with up to two decimals, like 5 or 12.5.";
export const PENALTY_RATE_ORDER =
  "A later tier can never take less than an earlier one: minor, then moderate, then severe, each the same or higher.";

/**
 * The typed rates as the complete policy the API takes, or what is wrong with
 * them. Mirrors `400 invalid_production_penalty`.
 */
export function parsePenaltyRates(
  draft: PenaltyRateDraft,
  deductionsEnabled: boolean,
): { policy: ProductionPenaltyPolicy } | { problem: string; tier?: ProductionPenaltyTier } {
  const bps = {} as Record<ProductionPenaltyTier, number>;
  for (const tier of PENALTY_TIERS) {
    const value = percentInputToBps(draft[tier]);
    if (value === null) return { problem: PENALTY_RATE_INVALID, tier };
    bps[tier] = value;
  }
  if (bps.minor > bps.moderate) return { problem: PENALTY_RATE_ORDER, tier: "moderate" };
  if (bps.moderate > bps.severe) return { problem: PENALTY_RATE_ORDER, tier: "severe" };
  return {
    policy: {
      deductionsEnabled,
      minorBps: bps.minor,
      moderateBps: bps.moderate,
      severeBps: bps.severe,
    },
  };
}

/** The worked example's job: ₱10,000 still owed to the shop. */
export const PENALTY_EXAMPLE_BALANCE_MINOR = 1_000_000;

/** What a tier takes from a balance: half-up, never more than the balance. */
export function penaltyDeductionMinor(balanceMinor: number, rateBps: number): number {
  return Math.min(balanceMinor, applyRateBps(balanceMinor, rateBps));
}

export function tierRateBps(policy: ProductionPenaltyPolicy, tier: ProductionPenaltyTier): number {
  return tier === "severe" ? policy.severeBps : tier === "moderate" ? policy.moderateBps : policy.minorBps;
}

/** The audit line saved with a penalty change. The API requires one. */
export function penaltyChangeReason(from: ProductionPenaltyPolicy, to: ProductionPenaltyPolicy): string {
  const changes: string[] = [];
  for (const tier of PENALTY_TIERS) {
    const before = tierRateBps(from, tier);
    const after = tierRateBps(to, tier);
    if (before !== after) {
      changes.push(`${tier} ${formatRatePercent(before)} to ${formatRatePercent(after)}`);
    }
  }
  if (from.deductionsEnabled !== to.deductionsEnabled) {
    changes.push(to.deductionsEnabled ? "real deductions turned on" : "real deductions turned off");
  }
  return changes.length
    ? `Late-production penalties from the portal: ${changes.join("; ")}`
    : "Late-production penalties from the portal";
}
