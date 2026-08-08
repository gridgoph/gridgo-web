/**
 * Resolve platform taxonomy codes to display names.
 */

import type {
  Taxonomy,
  TaxonomyCategory,
  TaxonomyFinish,
  TaxonomyMaterial,
  Zone,
} from "@/lib/api/types";

export function categoryName(
  code: string,
  taxonomy: Taxonomy | null | undefined,
): string {
  const hit = taxonomy?.categories.find((c) => c.code === code);
  return hit?.name ?? humanizeCode(code);
}

export function materialNames(
  codes: string[],
  taxonomy: Taxonomy | null | undefined,
): string[] {
  return codes.map((code) => {
    const hit = taxonomy?.materials.find((m) => m.code === code);
    return hit?.name ?? humanizeCode(code);
  });
}

export function finishNames(
  codes: string[],
  taxonomy: Taxonomy | null | undefined,
): string[] {
  return codes.map((code) => {
    const hit = taxonomy?.finishes.find((f) => f.code === code);
    return hit?.name ?? humanizeCode(code);
  });
}

export function zoneName(code: string, zones: Zone[] | null | undefined): string {
  const hit = zones?.find((z) => z.code === code);
  return hit?.name ?? humanizeCode(code);
}

export function zoneNames(
  codes: string[],
  zones: Zone[] | null | undefined,
): string[] {
  return codes.map((c) => zoneName(c, zones));
}

export function activeCategories(taxonomy: Taxonomy): TaxonomyCategory[] {
  return taxonomy.categories.filter((c) => c.active);
}

export function materialsForCategory(
  taxonomy: Taxonomy,
  categoryCode: string,
): TaxonomyMaterial[] {
  return taxonomy.materials.filter(
    (m) => m.active && m.categoryCodes.includes(categoryCode),
  );
}

export function finishesForCategory(
  taxonomy: Taxonomy,
  categoryCode: string,
): TaxonomyFinish[] {
  return taxonomy.finishes.filter(
    (f) => f.active && f.categoryCodes.includes(categoryCode),
  );
}

function humanizeCode(code: string): string {
  return code.replace(/_/g, " ");
}
