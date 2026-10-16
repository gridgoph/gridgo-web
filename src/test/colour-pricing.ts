import type { ColourQuote } from "@/lib/colour-pricing";

/**
 * A 20x30 whiteprint line in the shapes the API sends (report 0BE07331):
 * three sets of a two-page drawing, one page plain, one with 18% orange.
 * Shop rates ₱30 / ₱60; the client's all-in figures carry a 45% fee.
 */
export function staffColourQuote(partial: Partial<ColourQuote> = {}): ColourQuote {
  return {
    version: 1,
    status: "priced",
    pricedByColour: true,
    estimate: true,
    quantityMode: "document_sets",
    quantity: 3,
    totalSheets: 6,
    paperSize: "20x30",
    tierSet: "large_format",
    lineSubtotalMinor: 27_000,
    clientLineSubtotalMinor: 39_150,
    warning: null,
    request: {
      layout: "fit_to_paper",
      paper: { widthMilli: 508_000, heightMilli: 762_000 },
      thresholds: { minSaturationBps: 2500, minLightnessBps: 500, maxLightnessBps: 8500, a3MonochromeMaxBps: 1000 },
    },
    pages: [
      {
        fileId: "file_pdf",
        page: 1,
        strongColourBps: 0,
        strongColourPercent: 0,
        tier: "none",
        sheetPriceMinor: 3000,
        clientSheetPriceMinor: 4350,
        clientPageTotalMinor: 13_050,
        clientPageRoundingMinor: 0,
        status: "priced",
      },
      {
        fileId: "file_pdf",
        page: 2,
        strongColourBps: 1800,
        strongColourPercent: 18,
        tier: "up_to_25",
        sheetPriceMinor: 6000,
        clientSheetPriceMinor: 8700,
        clientPageTotalMinor: 26_100,
        clientPageRoundingMinor: 0,
        status: "priced",
      },
    ],
    ...partial,
  };
}

/** The shop's projection of the same line: its own rates, no client figures. */
export function shopColourQuote(partial: Partial<ColourQuote> = {}): ColourQuote {
  const staff = staffColourQuote();
  return {
    ...staff,
    clientLineSubtotalMinor: undefined,
    pages: staff.pages.map((page) => {
      const shop = { ...page };
      delete shop.clientSheetPriceMinor;
      delete shop.clientPageTotalMinor;
      delete shop.clientPageRoundingMinor;
      return shop;
    }),
    ...partial,
  };
}
