/**
 * How many shops are accredited on a category.
 * Print jobs do not get a fake listing count — shops own those listings.
 */

import type {
  SupplierService,
  TaxonomyCategoryAlias,
} from "@/lib/api/types";

export type TaxonomyUsage = {
  total: number;
  live: number;
  pending: number;
  other: number;
};

function emptyUsage(): TaxonomyUsage {
  return { total: 0, live: 0, pending: 0, other: 0 };
}

function shopRank(service: SupplierService): number {
  if (service.state === "live") return 3;
  if (service.state === "pending_verification") return 2;
  return 1;
}

/** Unique shops, taking the strongest accreditation state per shop. */
function tallyShops(services: SupplierService[]): TaxonomyUsage {
  const best = new Map<string, number>();
  for (const service of services) {
    const rank = shopRank(service);
    best.set(service.supplierId, Math.max(best.get(service.supplierId) ?? 0, rank));
  }
  const usage = emptyUsage();
  for (const rank of best.values()) {
    usage.total += 1;
    if (rank === 3) usage.live += 1;
    else if (rank === 2) usage.pending += 1;
    else usage.other += 1;
  }
  return usage;
}

export function serviceMatchesCategory(
  serviceCode: string,
  categoryCode: string,
  aliases?: TaxonomyCategoryAlias[],
): boolean {
  if (serviceCode === categoryCode) return true;
  const alias = aliases?.find(
    (entry) => entry.code === serviceCode && entry.active !== false,
  );
  return alias?.categoryCode === categoryCode;
}

export function usageForCategory(
  services: SupplierService[],
  categoryCode: string,
  aliases?: TaxonomyCategoryAlias[],
): TaxonomyUsage {
  return tallyShops(
    services.filter((s) =>
      serviceMatchesCategory(s.categoryCode, categoryCode, aliases),
    ),
  );
}

export function shopsAccreditedCopy(usage: TaxonomyUsage): string {
  if (usage.total === 0) {
    return "No shops are accredited on this category yet. Edits affect shops that get accredited later.";
  }
  const liveBit =
    usage.live > 0
      ? `${usage.live} live`
      : null;
  const pendingBit =
    usage.pending > 0
      ? `${usage.pending} awaiting verification`
      : null;
  const otherBit =
    usage.other > 0
      ? `${usage.other} draft, suspended, or withdrawn`
      : null;
  const parts = [liveBit, pendingBit, otherBit].filter(Boolean);
  const shops = `${usage.total} shop${usage.total === 1 ? " is" : "s are"} accredited on this category`;
  return parts.length ? `${shops} (${parts.join("; ")}).` : `${shops}.`;
}

export function printJobConsequenceCopy(): string {
  return "Shops file listings of this job on their board. Hiding it hides it from new listings; existing listings keep this job.";
}
