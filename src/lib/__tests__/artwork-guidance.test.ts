import { describe, expect, it } from "vitest";

import {
  countsLine,
  dpiReach,
  guidanceChanges,
  guidanceDraft,
  guidanceGroups,
  guidanceReason,
  orderGuidanceCounts,
  orderedSizeLabel,
  parseGuidanceDraft,
  parseTarget,
  recordCounts,
  targetLine,
  warningLine,
} from "@/lib/artwork-guidance";
import { guidanceSettings, guidanceTaxonomy, tarpaulinRecord } from "@/test/artwork-guidance";

describe("guidanceGroups", () => {
  it("groups by category in the catalogue's order and keeps a retired type only while it has its own target", () => {
    const groups = guidanceGroups(guidanceTaxonomy(), guidanceSettings());
    expect(groups.map((group) => group.name)).toEqual(["Paper and documents", "Large format"]);
    expect(groups[0].rows.map((row) => row.name)).toEqual(["Business cards", "Flyers"]);
    expect(groups[1].rows).toEqual([
      { code: "tarpaulins_outdoor_banners", name: "Tarpaulins and outdoor banners", retired: false },
      { code: "old_banners", name: "Old banners", retired: true },
    ]);
  });

  it("lists a stored code the catalogue no longer has under its code", () => {
    const stored = guidanceSettings();
    stored.subcategories.gone = { minimumDpi: 150, acceptsRgb: true };
    const groups = guidanceGroups(guidanceTaxonomy(), stored);
    expect(groups.at(-1)).toEqual({
      code: "_other",
      name: "Other product types",
      rows: [{ code: "gone", name: "gone", retired: true }],
    });
  });
});

describe("drafts", () => {
  it("round-trips the stored value", () => {
    expect(parseGuidanceDraft(guidanceDraft(guidanceSettings()))).toEqual({
      value: guidanceSettings(),
      invalid: [],
    });
  });

  it.each(["49", "1201", "300.5", "", "abc"])("refuses %j", (dpi) => {
    expect(parseTarget({ check: true, dpi, acceptsRgb: false })).toBeNull();
  });

  it("takes the bounds and no check at all", () => {
    expect(parseTarget({ check: true, dpi: " 50 ", acceptsRgb: true })).toEqual({ minimumDpi: 50, acceptsRgb: true });
    expect(parseTarget({ check: true, dpi: "1200", acceptsRgb: false })).toEqual({ minimumDpi: 1200, acceptsRgb: false });
    expect(parseTarget({ check: false, dpi: "9", acceptsRgb: true })).toEqual({ minimumDpi: null, acceptsRgb: true });
  });

  it("names every entry out of range", () => {
    const draft = guidanceDraft(guidanceSettings());
    draft.base.dpi = "20";
    draft.own.flyers.dpi = "2000";
    expect(parseGuidanceDraft(draft)).toEqual({ value: null, invalid: ["default", "flyers"] });
  });
});

describe("guidanceChanges", () => {
  const names: Record<string, string> = { flyers: "Flyers", business_cards: "Business cards", tarpaulins_outdoor_banners: "Tarpaulins" };
  const nameOf = (code: string) => names[code] ?? code;

  it("says each change in words, including moving to and from the default", () => {
    const stored = guidanceSettings();
    const next = structuredClone(stored);
    next.default = { minimumDpi: 250, acceptsRgb: false };
    next.subcategories.flyers = { minimumDpi: null, acceptsRgb: true };
    next.subcategories.business_cards = { minimumDpi: 350, acceptsRgb: false };
    delete next.subcategories.tarpaulins_outdoor_banners;
    expect(guidanceChanges(stored, next, nameOf)).toEqual([
      "Default: 300 DPI, expects CMYK to 250 DPI, expects CMYK",
      "Flyers: 300 DPI, expects CMYK to No resolution check, RGB accepted",
      "Tarpaulins: 100 DPI, expects CMYK to default (250 DPI, expects CMYK)",
      "Business cards: default (300 DPI, expects CMYK) to 350 DPI, expects CMYK",
    ]);
  });

  it("is empty when nothing moved", () => {
    expect(guidanceChanges(guidanceSettings(), guidanceSettings(), nameOf)).toEqual([]);
  });

  it("keeps the reason inside the API's text limit", () => {
    expect(guidanceReason(["Flyers: a to b"])).toBe("Artwork guidance. Flyers: a to b.");
    expect(guidanceReason(Array(200).fill("A long product type name: 300 DPI to 200 DPI")).length).toBeLessThanOrEqual(1900);
  });
});

describe("the order record in words", () => {
  it("states the ordered size in the unit a person would use", () => {
    expect(orderedSizeLabel({ widthMilli: 914400, heightMilli: 1828800 })).toBe("3 × 6 ft (914 × 1829 mm)");
    expect(orderedSizeLabel({ widthMilli: 148000, heightMilli: 210000 })).toBe("148 × 210 mm (5.8 × 8.3 in)");
    expect(orderedSizeLabel(null)).toBeNull();
  });

  it("names the figures the client was shown", () => {
    const [low, colour] = tarpaulinRecord().files[0].warnings;
    expect(warningLine(low)).toBe("Prints at 33 DPI at the ordered size; the target is 100 DPI.");
    expect(warningLine(colour)).toBe("The file is RGB; this product type expects CMYK.");
    expect(targetLine({ minimumDpi: null, acceptsRgb: true })).toBe("No resolution check, RGB accepted");
  });

  it("counts accepted and open warnings across the order's lines", () => {
    expect(recordCounts(tarpaulinRecord())).toEqual({ warnings: 2, accepted: 1, open: 1 });
    const order = {
      productionItems: [
        { id: "a", itemName: "Tarp", quantity: 1, measurement: null, artworkGuidance: tarpaulinRecord() },
        { id: "b", itemName: "Old line", quantity: 1, measurement: null, artworkGuidance: null },
      ],
    };
    const counts = orderGuidanceCounts(order);
    expect(counts).toEqual({ warnings: 2, accepted: 1, open: 1 });
    expect(countsLine(counts!)).toBe("2 artwork warnings, 1 accepted by the client");
    expect(countsLine({ warnings: 1, accepted: 1, open: 0 })).toBe("1 artwork warning, accepted by the client");
    expect(countsLine({ warnings: 2, accepted: 0, open: 2 })).toBe("2 artwork warnings, not accepted by the client");
    expect(orderGuidanceCounts({ productionItems: [] })).toBeNull();
  });

  it("caps the gauge at the target", () => {
    expect(dpiReach(33, 100)).toBeCloseTo(0.33);
    expect(dpiReach(450, 300)).toBe(1);
    expect(dpiReach(null, 300)).toBeNull();
    expect(dpiReach(120, null)).toBeNull();
  });
});
