import { describe, expect, it } from "vitest";

import type { Taxonomy, TaxonomyCategory, TaxonomySubcategory } from "@/lib/api/types";

import { groupJobsByCategory, parseSortOrder, slugTaxonomyCode } from "./catalogue-chart";

function cat(
  partial: Pick<TaxonomyCategory, "code" | "name"> & Partial<TaxonomyCategory>,
): TaxonomyCategory {
  return {
    id: `taxc_${partial.code}`,
    productFamilyIds: [],
    active: true,
    ...partial,
  };
}

function job(
  partial: Pick<TaxonomySubcategory, "code" | "name" | "categoryCode"> &
    Partial<TaxonomySubcategory>,
): TaxonomySubcategory {
  return {
    id: `taxs_${partial.code}`,
    active: true,
    ...partial,
  };
}

const taxonomy: Taxonomy = {
  categories: [
    cat({ code: "corporate_event_merch", name: "Corporate", sortOrder: 2 }),
    cat({ code: "marketing_collateral", name: "Marketing", sortOrder: 1 }),
  ],
  subcategories: [
    job({
      code: "lanyards_id_accessories",
      name: "Lanyards",
      categoryCode: "corporate_event_merch",
      sortOrder: 1,
    }),
    job({
      code: "brochures",
      name: "Brochures",
      categoryCode: "marketing_collateral",
      sortOrder: 2,
    }),
    job({
      code: "flyers",
      name: "Flyers",
      categoryCode: "marketing_collateral",
      sortOrder: 1,
      examples: ["A5", "A4"],
    }),
  ],
  materials: [],
  finishes: [],
};

describe("catalogue chart", () => {
  it("groups print jobs under categories in chart order", () => {
    const chart = groupJobsByCategory(taxonomy);
    expect(chart.map((panel) => panel.category.code)).toEqual([
      "marketing_collateral",
      "corporate_event_merch",
    ]);
    expect(chart[0].jobs.map((j) => j.code)).toEqual(["flyers", "brochures"]);
    expect(chart[1].jobs.map((j) => j.code)).toEqual(["lanyards_id_accessories"]);
  });

  it("keeps inactive jobs on the ops chart", () => {
    const hidden = job({
      code: "hidden_job",
      name: "Hidden",
      categoryCode: "marketing_collateral",
      sortOrder: 9,
      active: false,
    });
    const chart = groupJobsByCategory({
      ...taxonomy,
      subcategories: [...(taxonomy.subcategories ?? []), hidden],
    });
    expect(chart[0].jobs.map((j) => j.code)).toContain("hidden_job");
  });

  it("slugs a print-job code", () => {
    expect(slugTaxonomyCode("Business Cards")).toBe("business_cards");
    expect(slugTaxonomyCode("  3D Printing! ")).toBe("3d_printing");
  });

  it("parses a 1-based sort order or leaves it unset", () => {
    expect(parseSortOrder("3")).toBe(3);
    expect(parseSortOrder("")).toBeUndefined();
    expect(parseSortOrder("0")).toBeUndefined();
    expect(parseSortOrder("1.5")).toBeUndefined();
  });
});
