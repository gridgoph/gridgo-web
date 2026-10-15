import type {
  ArtworkGuidanceRecord,
  ArtworkGuidanceSettings,
  Taxonomy,
} from "@/lib/api/types";

/** A small catalogue: two categories, one retired product type. */
export function guidanceTaxonomy(): Pick<Taxonomy, "categories" | "subcategories"> {
  return {
    categories: [
      { id: "c2", code: "large_format", name: "Large format", sortOrder: 2, productFamilyIds: [], active: true },
      { id: "c1", code: "paper", name: "Paper and documents", sortOrder: 1, productFamilyIds: [], active: true },
    ],
    subcategories: [
      { id: "s1", code: "flyers", categoryCode: "paper", name: "Flyers", sortOrder: 2, active: true },
      { id: "s2", code: "business_cards", categoryCode: "paper", name: "Business cards", sortOrder: 1, active: true },
      { id: "s3", code: "tarpaulins_outdoor_banners", categoryCode: "large_format", name: "Tarpaulins and outdoor banners", sortOrder: 1, active: true },
      { id: "s4", code: "old_banners", categoryCode: "large_format", name: "Old banners", sortOrder: 2, active: false },
      { id: "s5", code: "old_stickers", categoryCode: "paper", name: "Old stickers", sortOrder: 3, active: false },
    ],
  };
}

export function guidanceSettings(): ArtworkGuidanceSettings {
  return {
    version: 1,
    default: { minimumDpi: 300, acceptsRgb: false },
    subcategories: {
      flyers: { minimumDpi: 300, acceptsRgb: false },
      tarpaulins_outdoor_banners: { minimumDpi: 100, acceptsRgb: false },
      old_banners: { minimumDpi: 100, acceptsRgb: false },
    },
  };
}

/** A 3 x 6 ft tarpaulin from a 1200 x 2400 px RGB file: both warnings, one accepted. */
export function tarpaulinRecord(overrides: Partial<ArtworkGuidanceRecord> = {}): ArtworkGuidanceRecord {
  return {
    version: 1,
    evaluatedAt: "2026-10-15T07:30:00.000Z",
    subcategoryCode: "tarpaulins_outdoor_banners",
    minimumDpi: 100,
    acceptsRgb: false,
    expectedColorMode: "cmyk",
    orderedSize: { widthMilli: 914400, heightMilli: 1828800 },
    files: [
      {
        fileId: "file_tarp",
        colorMode: "rgb",
        pixelWidth: 1200,
        pixelHeight: 2400,
        effectiveDpi: 33,
        warnings: [
          { code: "low_resolution", effectiveDpi: 33, minimumDpi: 100, acceptedAt: "2026-10-15T07:20:00.000Z" },
          { code: "color_mode", colorMode: "rgb", expectedColorMode: "cmyk", acceptedAt: null },
        ],
      },
    ],
    openWarningCount: 1,
    ...overrides,
  };
}
