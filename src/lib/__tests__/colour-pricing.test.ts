import { describe, expect, it } from "vitest";

import {
  DEFAULT_THRESHOLDS,
  SAMPLE_INKS,
  colourDraftFrom,
  correctionDraft,
  countsAsStrong,
  pageLine,
  priceCheckGap,
  readColourDraft,
  readColourPriceChecks,
  readColourQuote,
  readCorrection,
  readPaperSize,
  readThresholdDraft,
  sheetsLine,
  thresholdDraft,
  thresholdReason,
  tierFor,
  tierLabel,
  unpricedSizes,
  type ColourQuote,
} from "@/lib/colour-pricing";

describe("tiers", () => {
  it("keeps the large-format boundaries inclusive at the top, and only exactly 0 is no strong colour", () => {
    expect(tierFor(0, "large_format", 1000)).toBe("none");
    expect(tierFor(1, "large_format", 1000)).toBe("up_to_25");
    expect(tierFor(2500, "large_format", 1000)).toBe("up_to_25");
    expect(tierFor(2501, "large_format", 1000)).toBe("up_to_50");
    expect(tierFor(5000, "large_format", 1000)).toBe("up_to_50");
    expect(tierFor(5001, "large_format", 1000)).toBe("above_50");
  });

  it("splits A3 at the editable monochrome limit", () => {
    expect(tierFor(1000, "a3", 1000)).toBe("monochrome");
    expect(tierFor(1001, "a3", 1000)).toBe("full_colour");
    expect(tierFor(1400, "a3", 1500)).toBe("monochrome");
    expect(tierLabel("monochrome", 1500)).toBe("Up to 15%, monochrome");
    expect(tierLabel("full_colour")).toBe("Above 10%, full colour");
  });
});

describe("paper sizes", () => {
  it("reads named and measured paper the way the API does", () => {
    expect(readPaperSize("A3")?.a3).toBe(true);
    expect(readPaperSize("297 x 420 mm")?.a3).toBe(true);
    expect(readPaperSize("20x30")).toMatchObject({ widthMilli: 508_000, heightMilli: 762_000, a3: false });
    expect(readPaperSize("Long")?.a3).toBe(false);
    expect(readPaperSize("big")).toBeNull();
  });
});

describe("the shop's tier table", () => {
  it("leaves a blank tier out (not offered) and keeps zero as a free price", () => {
    const read = readColourDraft([
      { key: "a", paperSize: "20x30", prices: { none: "30", up_to_25: "60", up_to_50: "", above_50: "0" } },
      { key: "b", paperSize: "A3", prices: { monochrome: "10.00" } },
    ]);
    expect(read).toEqual({
      ok: true,
      pricing: {
        sizes: [
          { paperSize: "20x30", tierSet: "large_format", prices: { none: 3000, up_to_25: 6000, above_50: 0 } },
          { paperSize: "A3", tierSet: "a3", prices: { monochrome: 1000 } },
        ],
      },
    });
  });

  it("refuses the same paper twice, rotated or renamed", () => {
    const read = readColourDraft([
      { key: "a", paperSize: "A3", prices: {} },
      { key: "b", paperSize: "420x297mm", prices: {} },
    ]);
    expect(read).toMatchObject({ ok: false, problem: { key: "b" } });
  });

  it("refuses an unreadable size or price on its own row, and an empty table", () => {
    expect(readColourDraft([])).toMatchObject({ ok: false, problem: { key: null } });
    expect(readColourDraft([{ key: "x", paperSize: "huge", prices: {} }])).toMatchObject({
      ok: false,
      problem: { key: "x" },
    });
    expect(
      readColourDraft([{ key: "y", paperSize: "A3", prices: { monochrome: "ten" } }]),
    ).toMatchObject({ ok: false, problem: { key: "y" } });
  });

  it("round-trips a saved table without a change, and names a paper with nothing priced", () => {
    const saved = {
      sizes: [{ paperSize: "20x30", tierSet: "large_format" as const, prices: { none: 3000, above_50: 20000 } }],
    };
    const draft = colourDraftFrom(saved);
    expect(readColourDraft(draft)).toEqual({ ok: true, pricing: saved });
    expect(unpricedSizes([{ key: "z", paperSize: "A3", prices: { monochrome: " " } }])).toEqual(["A3"]);
  });
});

const quote: ColourQuote = readColourQuote({
  version: 1,
  status: "needs_price_check",
  pricedByColour: true,
  quantityMode: "document_sets",
  quantity: 3,
  totalSheets: 6,
  paperSize: "20x30",
  tierSet: "large_format",
  lineSubtotalMinor: null,
  warning: null,
  request: { paper: { widthMilli: 508_000, heightMilli: 762_000 }, thresholds: DEFAULT_THRESHOLDS },
  pages: [
    { fileId: "f", page: 1, strongColourBps: 0, tier: "none", sheetPriceMinor: 3000, status: "priced" },
    {
      fileId: "f",
      page: 2,
      strongColourBps: 3100,
      tier: "up_to_50",
      sheetPriceMinor: null,
      status: "needs_price_check",
      message: "This page needs a price check",
    },
  ],
})!;

describe("page lines", () => {
  it("says each page as the report writes it, and never prices an unpriced page", () => {
    expect(pageLine({ ...quote.pages[0], strongColourBps: 1800, sheetPriceMinor: 6000 })).toBe(
      "Page 1: 18% strong colour, ₱60.00",
    );
    expect(pageLine(quote.pages[1])).toBe("Page 2: 31% strong colour. This page needs a price check");
  });

  it("multiplies pages by copies or sets once", () => {
    expect(sheetsLine("document_sets", 3, 12)).toBe("3 sets × 12 pages = 36 sheets");
    expect(sheetsLine("copies_each_page", 2, 1)).toBe("2 copies of each page × 1 page = 2 sheets");
  });

  it("names the blank tier for the price check", () => {
    expect(priceCheckGap(quote)).toBe("The shop left “Up to 50%” blank on 20x30.");
    expect(priceCheckGap({ ...quote, paperSize: undefined, tierSet: undefined })).toBe(
      "The shop has no colour prices for this paper (20 × 30 in).",
    );
  });

  it("reads the price-check queue and drops rows it cannot use", () => {
    const checks = readColourPriceChecks({
      checks: [
        { cartId: "c", lineId: "l", clientId: "u", supplierId: "s", catalogItemId: "i", colourPricing: quote },
        { cartId: "c" },
      ],
    });
    expect(checks).toHaveLength(1);
    expect(checks[0].colourPricing.pages[1].sheetPriceMinor).toBeNull();
  });
});

describe("thresholds", () => {
  it("mirrors the API's rules field by field", () => {
    const draft = thresholdDraft(DEFAULT_THRESHOLDS);
    expect(draft).toEqual({ minSaturationBps: "25", minLightnessBps: "5", maxLightnessBps: "85", a3MonochromeMaxBps: "10" });
    expect(readThresholdDraft(draft)).toEqual({ ok: true, value: DEFAULT_THRESHOLDS });
    expect(readThresholdDraft({ ...draft, minSaturationBps: "0" })).toMatchObject({ ok: false, key: "minSaturationBps" });
    expect(readThresholdDraft({ ...draft, minLightnessBps: "85" })).toMatchObject({ ok: false, key: "minLightnessBps" });
    expect(readThresholdDraft({ ...draft, maxLightnessBps: "100" })).toMatchObject({ ok: false, key: "maxLightnessBps" });
    expect(readThresholdDraft({ ...draft, a3MonochromeMaxBps: "12.5" })).toMatchObject({
      ok: true,
      value: { a3MonochromeMaxBps: 1250 },
    });
  });

  it("counts saturated inks and leaves black, greys, white and pale tints out", () => {
    const counted = SAMPLE_INKS.filter((ink) => countsAsStrong(ink.rgb, DEFAULT_THRESHOLDS)).map((ink) => ink.name);
    expect(counted).toEqual(["Orange", "Red", "Green", "Bright blue"]);
  });

  it("writes an audit reason naming each figure that moved", () => {
    expect(
      thresholdReason(DEFAULT_THRESHOLDS, { ...DEFAULT_THRESHOLDS, a3MonochromeMaxBps: 1500 }, "From a month of orders."),
    ).toBe("Colour detection: A3 monochrome limit 10% to 15%. From a month of orders.");
  });
});

describe("the shop's colour correction", () => {
  const priced = readColourQuote({
    ...quote,
    status: "priced",
    lineSubtotalMinor: 27_000,
    pages: [
      { fileId: "f", page: 1, strongColourBps: 0, tier: "none", sheetPriceMinor: 3000, status: "priced" },
      { fileId: "f", page: 2, strongColourBps: 1800, tier: "up_to_25", sheetPriceMinor: 6000, status: "priced" },
    ],
  })!;

  it("sends every page once and works out the extra against the line total", () => {
    const rows = correctionDraft(priced);
    rows[0] = { ...rows[0], percent: "18", price: "60" };
    expect(readCorrection(priced, rows, 27_000)).toEqual({
      ok: true,
      pages: [
        { fileId: "f", page: 1, strongColourBps: 1800, sheetPriceMinor: 6000 },
        { fileId: "f", page: 2, strongColourBps: 1800, sheetPriceMinor: 6000 },
      ],
      correctedLineSubtotalMinor: 36_000,
      extraMinor: 9_000,
      changed: true,
    });
  });

  it("notices an unchanged draft and a lower total", () => {
    const rows = correctionDraft(priced);
    expect(readCorrection(priced, rows, 27_000)).toMatchObject({ ok: true, changed: false, extraMinor: 0 });
    rows[1] = { ...rows[1], percent: "0", price: "30" };
    expect(readCorrection(priced, rows, 27_000)).toMatchObject({ ok: true, extraMinor: -9_000 });
    rows[1] = { ...rows[1], percent: "120" };
    expect(readCorrection(priced, rows, 27_000)).toMatchObject({ ok: false, page: 2 });
  });
});
