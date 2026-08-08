/**
 * Blast-radius helpers: how many supplier services reference a taxonomy code.
 */

import type { SupplierService } from "@/lib/api/types";

export type TaxonomyUsage = {
  total: number;
  live: number;
  pending: number;
  other: number;
};

function emptyUsage(): TaxonomyUsage {
  return { total: 0, live: 0, pending: 0, other: 0 };
}

function tally(services: SupplierService[]): TaxonomyUsage {
  const usage = emptyUsage();
  for (const s of services) {
    usage.total += 1;
    if (s.state === "live") usage.live += 1;
    else if (s.state === "pending_verification") usage.pending += 1;
    else usage.other += 1;
  }
  return usage;
}

export function usageForCategory(
  services: SupplierService[],
  categoryCode: string,
): TaxonomyUsage {
  return tally(services.filter((s) => s.categoryCode === categoryCode));
}

export function usageForMaterial(
  services: SupplierService[],
  materialCode: string,
): TaxonomyUsage {
  return tally(
    services.filter((s) => s.materialCodes?.includes(materialCode)),
  );
}

export function usageForFinish(
  services: SupplierService[],
  finishCode: string,
): TaxonomyUsage {
  return tally(services.filter((s) => s.finishCodes?.includes(finishCode)));
}

/** Plain-language blast-radius sentence for edit dialogs. */
export function usageBlastCopy(usage: TaxonomyUsage, noun: string): string {
  if (usage.total === 0) {
    return `No supplier services currently use this ${noun}. Edits affect future catalogue declarations only.`;
  }
  const liveBit =
    usage.live > 0
      ? `${usage.live} live service${usage.live === 1 ? "" : "s"}`
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
  return `${usage.total} supplier service${usage.total === 1 ? "" : "s"} reference this ${noun} (${parts.join("; ")}). Changing or deactivating it reshapes what those services can express on the marketplace.`;
}
