import type { Taxonomy, TaxonomyCategory, TaxonomySubcategory } from "@/lib/api/types";

export type ChartCategory = {
  category: TaxonomyCategory;
  jobs: TaxonomySubcategory[];
};

function byChartOrder<T extends { sortOrder?: number; code: string }>(a: T, b: T): number {
  const ao = a.sortOrder ?? 999;
  const bo = b.sortOrder ?? 999;
  if (ao !== bo) return ao - bo;
  return a.code.localeCompare(b.code);
}

/** Super Admin chart: every category, including inactive jobs under it. */
export function groupJobsByCategory(taxonomy: Taxonomy): ChartCategory[] {
  const jobs = [...(taxonomy.subcategories ?? [])].sort(byChartOrder);
  return [...taxonomy.categories].sort(byChartOrder).map((category) => ({
    category,
    jobs: jobs.filter((job) => job.categoryCode === category.code),
  }));
}

export function slugTaxonomyCode(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function parseSortOrder(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return undefined;
  return n;
}
