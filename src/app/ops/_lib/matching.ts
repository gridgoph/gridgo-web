/**
 * Explainable supplier matching helpers (no auto-rank black box).
 */

import type {
  EligibleSupplierCandidate,
  MatchingRankingInputs,
  SupplierService,
} from "@/lib/api/types";
import { presentMatchReason, presentZone } from "./present";

export type ExplainedCandidate = {
  supplierId: string;
  supplierName: string;
  eligible: boolean;
  verificationStatus: string | undefined;
  reasons: string[];
  matchingServiceIds: string[];
  services: SupplierService[];
  rankingInputs?: MatchingRankingInputs;
  capacityDaily: number | null;
  capacityWeekly: number | null;
  zones: string[];
  minTurnaroundHours: number | null;
};

/**
 * Flatten API candidates into a display-ready shape.
 * Eligible first, then ineligible — but never a silent score rank.
 */
export function explainCandidates(
  candidates: EligibleSupplierCandidate[],
): ExplainedCandidate[] {
  const mapped = candidates.map((c) => {
    const live = c.services.filter((s) => s.state === "live");
    const capacityDaily = live.reduce<number | null>((acc, s) => {
      if (s.capacityDaily == null) return acc;
      return (acc ?? 0) + s.capacityDaily;
    }, null);
    const capacityWeekly = live.reduce<number | null>((acc, s) => {
      if (s.capacityWeekly == null) return acc;
      return (acc ?? 0) + s.capacityWeekly;
    }, null);
    const zones = [
      ...new Set(live.flatMap((s) => s.zones)),
    ];
    const turnarounds = live
      .map((s) => s.turnaroundHours)
      .filter((n) => typeof n === "number");
    const minTurnaroundHours = turnarounds.length
      ? Math.min(...turnarounds)
      : null;

    return {
      supplierId: c.supplier.id,
      supplierName:
        c.supplier.supplierName || c.supplier.name || c.supplier.id,
      eligible: c.eligible,
      verificationStatus: c.supplier.verificationStatus,
      reasons: c.reasons.map(presentMatchReason),
      matchingServiceIds: c.matchingServiceIds,
      services: c.services,
      rankingInputs: c.rankingInputs,
      capacityDaily,
      capacityWeekly,
      zones,
      minTurnaroundHours,
    };
  });

  return mapped.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return a.supplierName.localeCompare(b.supplierName);
  });
}

export function formatCapacity(
  daily: number | null,
  weekly: number | null,
): string {
  const parts: string[] = [];
  if (daily != null) parts.push(`${daily}/day`);
  if (weekly != null) parts.push(`${weekly}/week`);
  return parts.length ? parts.join(" · ") : "Not declared";
}

export function formatZones(zones: string[]): string {
  if (!zones.length) return "No zones on live services";
  return zones.map(presentZone).join(", ");
}

export function formatTurnaround(hours: number | null): string {
  if (hours == null) return "Not declared";
  if (hours < 24) return `${hours} hours`;
  const days = hours / 24;
  if (Number.isInteger(days)) return `${days} day${days === 1 ? "" : "s"}`;
  return `${hours} hours`;
}
