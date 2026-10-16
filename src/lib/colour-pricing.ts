/**
 * Document and construction printing priced by how much strong colour each
 * page carries (issue report 0BE07331; contract gridgo-api
 * docs/COLOUR_PRICING_API.md).
 *
 * GRIDGO measures each page as it will print, on the chosen paper and layout,
 * and counts the share of the whole sheet in strong colour. Black, white,
 * greys and pale colours are not counted. The shop sets a price per sheet for
 * each colour tier and paper size; a tier left blank is not offered, and a page
 * that lands in one needs a price check. GRIDGO never fills in a price.
 *
 * Everything here is pure: the shop's tier table, the client-facing page
 * lines the GRIDGO Team reads at the quality check, the Super Admin
 * thresholds, and the shop's correction of a clearly wrong estimate.
 */

import { formatPhp, minorToPesosInput, pesosToMinor } from "@/lib/format";

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

export const LARGE_FORMAT_TIERS = ["none", "up_to_25", "up_to_50", "above_50"] as const;
export const A3_TIERS = ["monochrome", "full_colour"] as const;

export type LargeFormatTier = (typeof LARGE_FORMAT_TIERS)[number];
export type A3Tier = (typeof A3_TIERS)[number];
export type ColourTier = LargeFormatTier | A3Tier;
export type TierSet = "large_format" | "a3";

export const TIERS_OF: Record<TierSet, readonly ColourTier[]> = {
  large_format: LARGE_FORMAT_TIERS,
  a3: A3_TIERS,
};

/** The API's shipped default for the A3 monochrome limit: 10% of the sheet. */
export const DEFAULT_A3_LIMIT_BPS = 1000;

export function isColourTier(value: unknown): value is ColourTier {
  return (
    typeof value === "string" &&
    ((LARGE_FORMAT_TIERS as readonly string[]).includes(value) ||
      (A3_TIERS as readonly string[]).includes(value))
  );
}

/** Basis points as a percent a person reads: 1800 → "18%", 1250 → "12.5%". */
export function bpsPercent(bps: number): string {
  const percent = bps / 100;
  return `${Number.isInteger(percent) ? percent : Number(percent.toFixed(2))}%`;
}

/**
 * The tier as a shop or the GRIDGO Team says it. The A3 limit is a setting,
 * so its labels carry the limit in force.
 */
export function tierLabel(tier: string, a3LimitBps: number = DEFAULT_A3_LIMIT_BPS): string {
  switch (tier) {
    case "none":
      return "No strong colour";
    case "up_to_25":
      return "Up to 25%";
    case "up_to_50":
      return "Up to 50%";
    case "above_50":
      return "Above 50%";
    case "monochrome":
      return `Up to ${bpsPercent(a3LimitBps)}, monochrome`;
    case "full_colour":
      return `Above ${bpsPercent(a3LimitBps)}, full colour`;
    default:
      return "Unknown tier";
  }
}

/** What a tier means in a line under its label. */
export function tierHint(tier: ColourTier, a3LimitBps: number = DEFAULT_A3_LIMIT_BPS): string {
  switch (tier) {
    case "none":
      return "Black, white, greys and light colours only";
    case "up_to_25":
      return "Some strong colour, up to a quarter of the sheet";
    case "up_to_50":
      return "Up to half the sheet in strong colour";
    case "above_50":
      return "Full page coloured";
    case "monochrome":
      return `Strong colour on at most ${bpsPercent(a3LimitBps)} of the sheet`;
    case "full_colour":
      return `Strong colour on more than ${bpsPercent(a3LimitBps)} of the sheet`;
  }
}

/**
 * The coverage band a tier stands for, in basis points of the sheet. The
 * glyph fills to the band's top so the four large-format tiers read as four
 * steps even in greyscale.
 */
export function tierBand(tier: ColourTier, a3LimitBps: number = DEFAULT_A3_LIMIT_BPS): {
  from: number;
  to: number;
} {
  switch (tier) {
    case "none":
      return { from: 0, to: 0 };
    case "up_to_25":
      return { from: 1, to: 2500 };
    case "up_to_50":
      return { from: 2501, to: 5000 };
    case "above_50":
      return { from: 5001, to: 10000 };
    case "monochrome":
      return { from: 0, to: a3LimitBps };
    case "full_colour":
      return { from: a3LimitBps + 1, to: 10000 };
  }
}

/** Mirrors the API's `colourTier`: the boundaries are inclusive at the top. */
export function tierFor(bps: number, tierSet: TierSet, a3LimitBps: number): ColourTier {
  if (tierSet === "a3") return bps <= a3LimitBps ? "monochrome" : "full_colour";
  return bps === 0 ? "none" : bps <= 2500 ? "up_to_25" : bps <= 5000 ? "up_to_50" : "above_50";
}

// ---------------------------------------------------------------------------
// Paper sizes (mirrors gridgo-api src/print-layout.js `parsePaperSize`)
// ---------------------------------------------------------------------------

const PAPER_SIZES: Record<string, readonly [number, number]> = {
  a0: [841, 1189],
  a1: [594, 841],
  a2: [420, 594],
  a3: [297, 420],
  a4: [210, 297],
  a5: [148, 210],
  a6: [105, 148],
  b4: [250, 353],
  b5: [176, 250],
  short: [215.9, 279.4],
  letter: [215.9, 279.4],
  long: [215.9, 330.2],
  folio: [215.9, 330.2],
  legal: [215.9, 355.6],
  tabloid: [279.4, 431.8],
  ledger: [279.4, 431.8],
};

const UNIT_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  inch: 25.4,
  inches: 25.4,
  '"': 25.4,
  ft: 304.8,
  feet: 304.8,
  "'": 304.8,
};

export type PaperRead = { widthMilli: number; heightMilli: number; a3: boolean };

function paperOf(widthMm: number, heightMm: number): PaperRead {
  const widthMilli = Math.round(widthMm * 1000);
  const heightMilli = Math.round(heightMm * 1000);
  const short = Math.min(widthMilli, heightMilli);
  const long = Math.max(widthMilli, heightMilli);
  // The API names a page A3 within 2 mm either way round.
  const a3 = Math.abs(short - 297_000) <= 2000 && Math.abs(long - 420_000) <= 2000;
  return { widthMilli, heightMilli, a3 };
}

/**
 * The paper a shop typed: a name (A3, Short, Legal) or width × height with an
 * optional unit. A bare "20x30" is inches, the way plotting sizes are quoted.
 */
export function readPaperSize(text: string): PaperRead | null {
  const value = text.trim().toLowerCase();
  if (!value || value.length > 120) return null;
  const named = /^([a-z]+\d?)\b/.exec(value)?.[1];
  if (named && PAPER_SIZES[named]) return paperOf(...PAPER_SIZES[named]);
  const unit = "(mm|cm|inches|inch|in|feet|ft|\"|')?";
  const match = new RegExp(
    `(\\d+(?:\\.\\d+)?)\\s*${unit}\\s*[x×]\\s*(\\d+(?:\\.\\d+)?)\\s*${unit}`,
  ).exec(value);
  if (match) {
    const scale = UNIT_MM[match[4] || match[2] || "in"];
    const width = Number(match[1]) * scale;
    const height = Number(match[3]) * scale;
    if (width > 0 && height > 0 && width <= 20_000 && height <= 20_000) {
      return paperOf(width, height);
    }
  }
  for (const word of value.split(/[^a-z0-9]+/)) {
    if (PAPER_SIZES[word]) return paperOf(...PAPER_SIZES[word]);
  }
  return null;
}

/** A3 takes the two A3 tiers; every other size the four large-format tiers. */
export function tierSetOf(paper: PaperRead): TierSet {
  return paper.a3 ? "a3" : "large_format";
}

function physicalKey(paper: Pick<PaperRead, "widthMilli" | "heightMilli">): string {
  return `${Math.min(paper.widthMilli, paper.heightMilli)}:${Math.max(paper.widthMilli, paper.heightMilli)}`;
}

/** "20 × 30 in" or "297 × 420 mm" from thousandths of a millimetre. */
export function paperDimensions(size: { widthMilli: number; heightMilli: number }): string {
  const inches = (milli: number) => milli / 25_400;
  const w = inches(size.widthMilli);
  const h = inches(size.heightMilli);
  const whole = (n: number) => Math.abs(n - Math.round(n)) < 0.02;
  if (whole(w) && whole(h)) return `${Math.round(w)} × ${Math.round(h)} in`;
  return `${Math.round(size.widthMilli / 1000)} × ${Math.round(size.heightMilli / 1000)} mm`;
}

// ---------------------------------------------------------------------------
// The shop's tier table on a listing
// ---------------------------------------------------------------------------

export type ColourPriceSize = {
  paperSize: string;
  tierSet: TierSet;
  /** Shop-set per-sheet centavos. A missing tier is not offered. */
  prices: Partial<Record<ColourTier, number>>;
  widthMilli?: number;
  heightMilli?: number;
  pageSize?: string | null;
};

export type ListingColourPricing = { sizes: ColourPriceSize[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** The listing's table as the API sent it; null when absent or unreadable. */
export function readColourPricing(value: unknown): ListingColourPricing | null {
  if (!isRecord(value) || !Array.isArray(value.sizes)) return null;
  const sizes = value.sizes.flatMap((row): ColourPriceSize[] => {
    if (!isRecord(row) || typeof row.paperSize !== "string") return [];
    const tierSet: TierSet = row.tierSet === "a3" ? "a3" : "large_format";
    const prices: ColourPriceSize["prices"] = {};
    if (isRecord(row.prices)) {
      for (const tier of TIERS_OF[tierSet]) {
        const price = row.prices[tier];
        if (typeof price === "number" && Number.isSafeInteger(price) && price >= 0) {
          prices[tier] = price;
        }
      }
    }
    return [
      {
        paperSize: row.paperSize,
        tierSet,
        prices,
        ...(typeof row.widthMilli === "number" ? { widthMilli: row.widthMilli } : {}),
        ...(typeof row.heightMilli === "number" ? { heightMilli: row.heightMilli } : {}),
        ...(typeof row.pageSize === "string" ? { pageSize: row.pageSize } : {}),
      },
    ];
  });
  return { sizes };
}

/** Pesos as typed, per tier. Blank means the tier is not offered for the size. */
export type ColourSizeDraft = {
  key: string;
  paperSize: string;
  prices: Partial<Record<ColourTier, string>>;
};

export type ColourDraft = ColourSizeDraft[];

export const COLOUR_SIZES_MAX = 32;

let draftKey = 0;
export function newSizeKey(): string {
  draftKey += 1;
  return `size_${draftKey}`;
}

export function colourDraftFrom(pricing: ListingColourPricing | null): ColourDraft {
  return (pricing?.sizes ?? []).map((size, index) => ({
    key: `saved_${index}`,
    paperSize: size.paperSize,
    prices: Object.fromEntries(
      Object.entries(size.prices).map(([tier, minor]) => [tier, minorToPesosInput(minor ?? 0)]),
    ),
  }));
}

export type ColourDraftProblem = { key: string | null; message: string };

export type ColourDraftRead =
  | { ok: true; pricing: { sizes: Array<{ paperSize: string; tierSet: TierSet; prices: Partial<Record<ColourTier, number>> }> } }
  | { ok: false; problem: ColourDraftProblem };

/**
 * The table the API receives, or the first thing it would refuse. Blank
 * prices are left out (not offered), never sent as zero; zero is an
 * explicit free price.
 */
export function readColourDraft(draft: ColourDraft): ColourDraftRead {
  if (!draft.length) {
    return { ok: false, problem: { key: null, message: "add at least one paper size with its colour prices." } };
  }
  if (draft.length > COLOUR_SIZES_MAX) {
    return {
      ok: false,
      problem: { key: null, message: `a listing can price at most ${COLOUR_SIZES_MAX} paper sizes.` },
    };
  }
  const seen = new Map<string, string>();
  const sizes = [];
  for (const row of draft) {
    const name = row.paperSize.trim();
    const paper = readPaperSize(name);
    if (!paper) {
      return {
        ok: false,
        problem: {
          key: row.key,
          message: name
            ? `“${name}” is not a paper size GRIDGO can read. Use a name like A3 or a size like 20x30.`
            : "name each paper size, like A3 or 20x30.",
        },
      };
    }
    const physical = physicalKey(paper);
    const earlier = seen.get(physical);
    if (earlier) {
      return {
        ok: false,
        problem: { key: row.key, message: `${name} is the same paper as ${earlier}. Price each paper once.` },
      };
    }
    seen.set(physical, name);
    const tierSet = tierSetOf(paper);
    const prices: Partial<Record<ColourTier, number>> = {};
    for (const tier of TIERS_OF[tierSet]) {
      const typed = (row.prices[tier] ?? "").trim();
      if (!typed) continue;
      const minor = pesosToMinor(typed);
      if (minor == null) {
        return {
          ok: false,
          problem: {
            key: row.key,
            message: `enter the ${name} “${tierLabel(tier)}” price in pesos, like 60.00, or leave it blank.`,
          },
        };
      }
      prices[tier] = minor;
    }
    sizes.push({ paperSize: name, tierSet, prices });
  }
  return { ok: true, pricing: { sizes } };
}

/** Sizes in the draft with every tier blank: nothing on that paper can be priced. */
export function unpricedSizes(draft: ColourDraft): string[] {
  return draft
    .filter((row) => row.paperSize.trim())
    .filter((row) => Object.values(row.prices).every((price) => !(price ?? "").trim()))
    .map((row) => row.paperSize.trim());
}

/** The listing's lowest offered sheet rate, the shop's own figure. */
export function lowestSheetRate(pricing: ListingColourPricing | null): number | null {
  const all = (pricing?.sizes ?? []).flatMap((size) =>
    Object.values(size.prices).filter((price): price is number => typeof price === "number"),
  );
  return all.length ? Math.min(...all) : null;
}

/** Paper names a size option already carries, offered as one-tap rows. */
export function suggestedPapers(labels: readonly string[], draft: ColourDraft): string[] {
  const taken = new Set(
    draft.flatMap((row) => {
      const paper = readPaperSize(row.paperSize);
      return paper ? [physicalKey(paper)] : [];
    }),
  );
  const out: string[] = [];
  for (const label of labels) {
    const paper = readPaperSize(label);
    if (!paper) continue;
    const key = physicalKey(paper);
    if (taken.has(key)) continue;
    taken.add(key);
    out.push(label.trim());
  }
  return out;
}

// ---------------------------------------------------------------------------
// Detection results (cart, order line and price-check evidence)
// ---------------------------------------------------------------------------

export type QuantityMode = "copies_each_page" | "document_sets";

export type ColourPage = {
  fileId: string;
  page: number;
  strongColourBps: number;
  strongColourPercent?: number;
  tier: string | null;
  /** The shop's rate for staff and the shop; the all-in rate for a client. */
  sheetPriceMinor: number | null;
  clientSheetPriceMinor?: number | null;
  clientPageTotalMinor?: number | null;
  clientPageRoundingMinor?: number | null;
  status: string;
  message?: string;
  detectedAt?: string;
};

export type ColourQuote = {
  version?: number;
  status: string;
  pricedByColour: boolean;
  estimate?: boolean;
  quantityMode: QuantityMode | null;
  quantity: number;
  totalSheets: number | null;
  paperSize?: string;
  tierSet?: TierSet;
  /** The shop's line total (shop and staff only). */
  lineSubtotalMinor?: number | null;
  /** All-in for the client (client and staff). */
  clientLineSubtotalMinor?: number | null;
  warning: string | null;
  pages: ColourPage[];
  request?: {
    layout?: string;
    paper?: { widthMilli: number; heightMilli: number } | null;
    thresholds?: Partial<ColourThresholds>;
  } | null;
};

export type ColourCorrection = Omit<ColourQuote, "status" | "pricedByColour" | "warning"> & {
  status?: string;
  pricedByColour?: boolean;
  warning?: string | null;
  originalLineSubtotalMinor?: number;
  correctedLineSubtotalMinor?: number;
  originalClientLineSubtotalMinor?: number | null;
  correctedClientLineSubtotalMinor?: number | null;
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readPage(value: unknown): ColourPage | null {
  if (!isRecord(value)) return null;
  const page = num(value.page);
  const bps = num(value.strongColourBps);
  if (page == null || bps == null) return null;
  return {
    fileId: typeof value.fileId === "string" ? value.fileId : "",
    page,
    strongColourBps: bps,
    strongColourPercent: num(value.strongColourPercent) ?? bps / 100,
    tier: typeof value.tier === "string" ? value.tier : null,
    sheetPriceMinor: num(value.sheetPriceMinor),
    clientSheetPriceMinor: num(value.clientSheetPriceMinor),
    clientPageTotalMinor: num(value.clientPageTotalMinor),
    clientPageRoundingMinor: num(value.clientPageRoundingMinor),
    status: typeof value.status === "string" ? value.status : "priced",
    ...(typeof value.message === "string" ? { message: value.message } : {}),
    ...(typeof value.detectedAt === "string" ? { detectedAt: value.detectedAt } : {}),
  };
}

/** A quote, line snapshot or correction from the API; null when absent. */
export function readColourQuote(value: unknown): ColourQuote | null {
  if (!isRecord(value) || !Array.isArray(value.pages)) return null;
  const mode = value.quantityMode;
  return {
    ...(value as Partial<ColourQuote>),
    status: typeof value.status === "string" ? value.status : "priced",
    pricedByColour: value.pricedByColour !== false,
    quantityMode: mode === "copies_each_page" || mode === "document_sets" ? mode : null,
    quantity: num(value.quantity) ?? 1,
    totalSheets: num(value.totalSheets),
    tierSet: value.tierSet === "a3" ? "a3" : value.tierSet === "large_format" ? "large_format" : undefined,
    warning: typeof value.warning === "string" ? value.warning : null,
    pages: value.pages.flatMap((row) => {
      const page = readPage(row);
      return page ? [page] : [];
    }),
  };
}

/** The A3 limit the estimate was made with, else the default. */
export function quoteA3Limit(quote: Pick<ColourQuote, "request">): number {
  return num(quote.request?.thresholds?.a3MonochromeMaxBps) ?? DEFAULT_A3_LIMIT_BPS;
}

/** "Page 3: 18% strong colour", the price said apart so a missing one reads plainly. */
export function pageCoverageLine(page: Pick<ColourPage, "page" | "strongColourBps">): string {
  return `Page ${page.page}: ${bpsPercent(page.strongColourBps)} strong colour`;
}

export const PRICE_CHECK_MESSAGE = "This page needs a price check";

/**
 * A page's line as the issue report writes it: "Page 3: 18% strong colour,
 * ₱60.00". `price` picks which figure: the shop's own sheet rate or the
 * client's all-in one. A page with no rate says it needs a price check.
 */
export function pageLine(
  page: ColourPage,
  price: "shop" | "client" = "shop",
): string {
  const minor = price === "client" ? (page.clientSheetPriceMinor ?? null) : page.sheetPriceMinor;
  if (minor == null) return `${pageCoverageLine(page)}. ${page.message ?? PRICE_CHECK_MESSAGE}`;
  return `${pageCoverageLine(page)}, ${formatPhp(minor)}`;
}

/** "3 sets × 12 pages = 36 sheets"; never multiplied twice. */
export function sheetsLine(
  mode: QuantityMode | null,
  quantity: number,
  pages: number,
): string {
  const sheets = quantity * pages;
  const pagesWord = `${pages} ${pages === 1 ? "page" : "pages"}`;
  const sheetsWord = `${sheets} ${sheets === 1 ? "sheet" : "sheets"}`;
  if (mode === "document_sets") {
    return `${quantity} ${quantity === 1 ? "set" : "sets"} × ${pagesWord} = ${sheetsWord}`;
  }
  if (mode === "copies_each_page") {
    return `${quantity} ${quantity === 1 ? "copy" : "copies"} of each page × ${pagesWord} = ${sheetsWord}`;
  }
  return `${quantity} × ${pagesWord} = ${sheetsWord}`;
}

export function quantityModeLabel(mode: QuantityMode | null): string {
  if (mode === "document_sets") return "Sets of the whole document";
  if (mode === "copies_each_page") return "Copies of each page";
  return "Not chosen";
}

/** What a quote status means for the person reading it. */
export function quoteStatusLine(status: string): string {
  switch (status) {
    case "priced":
      return "Every page has a shop price.";
    case "needs_price_check":
      return "At least one page falls in a tier the shop has not priced for this paper.";
    case "fixed_price":
      return "Fixed price per sheet. The colour reading is for the one-colour warning only.";
    case "pending":
      return "GRIDGO is still measuring the pages.";
    case "failed":
      return "GRIDGO could not read this file. The client can retry or replace it.";
    case "configuration_required":
      return "The client has not chosen a paper and layout yet.";
    case "artwork_upload_required":
      return "Links cannot be measured. The client needs to upload the file.";
    case "quantity_mode_required":
      return "The client has not chosen copies of each page or sets.";
    case "analysis_limit":
      return "This file was measured too many times. The client uploads a fresh original.";
    case "unsupported":
      return "This file type cannot be measured. The client replaces it.";
    case "multiple_file_page_range_unsupported":
      return "A page range covers one document only. The client splits the files across items.";
    case "duplicate_artwork_unsupported":
      return "The same file is attached twice. The client attaches it once and picks copies or sets.";
    default:
      return "Colour reading not complete.";
  }
}

// ---------------------------------------------------------------------------
// The price-check queue
// ---------------------------------------------------------------------------

export type ColourPriceCheck = {
  cartId: string;
  lineId: string;
  clientId: string;
  supplierId: string;
  catalogItemId: string;
  colourPricing: ColourQuote;
};

export function readColourPriceChecks(body: unknown): ColourPriceCheck[] {
  const raw = isRecord(body) && Array.isArray(body.checks) ? body.checks : [];
  return raw.flatMap((row): ColourPriceCheck[] => {
    if (!isRecord(row)) return [];
    const quote = readColourQuote(row.colourPricing);
    const ids = ["cartId", "lineId", "clientId", "supplierId", "catalogItemId"] as const;
    if (!quote || ids.some((key) => typeof row[key] !== "string")) return [];
    return [
      {
        cartId: row.cartId as string,
        lineId: row.lineId as string,
        clientId: row.clientId as string,
        supplierId: row.supplierId as string,
        catalogItemId: row.catalogItemId as string,
        colourPricing: quote,
      },
    ];
  });
}

/** The pages with no shop rate: what the shop has to price. */
export function unpricedPages(quote: ColourQuote): ColourPage[] {
  return quote.pages.filter((page) => page.sheetPriceMinor == null);
}

/**
 * What is missing, in one sentence: a whole paper the shop never priced, or
 * the tiers it left blank on that paper.
 */
export function priceCheckGap(quote: ColourQuote): string {
  const missing = unpricedPages(quote);
  const limit = quoteA3Limit(quote);
  if (!quote.paperSize || !quote.tierSet) {
    const paper = quote.request?.paper;
    return `The shop has no colour prices for this paper${paper ? ` (${paperDimensions(paper)})` : ""}.`;
  }
  const tiers = [...new Set(missing.map((page) => page.tier).filter(isColourTier))];
  if (!tiers.length) return "Every page has a shop price now.";
  const named = tiers.map((tier) => `“${tierLabel(tier, limit)}”`).join(" and ");
  return `The shop left ${named} blank on ${quote.paperSize}.`;
}

// ---------------------------------------------------------------------------
// Super Admin thresholds
// ---------------------------------------------------------------------------

export type ColourThresholds = {
  minSaturationBps: number;
  minLightnessBps: number;
  maxLightnessBps: number;
  a3MonochromeMaxBps: number;
};

export const DEFAULT_THRESHOLDS: ColourThresholds = {
  minSaturationBps: 2500,
  minLightnessBps: 500,
  maxLightnessBps: 8500,
  a3MonochromeMaxBps: DEFAULT_A3_LIMIT_BPS,
};

export const THRESHOLD_KEYS = [
  "minSaturationBps",
  "minLightnessBps",
  "maxLightnessBps",
  "a3MonochromeMaxBps",
] as const;

export type ThresholdDraft = Record<keyof ColourThresholds, string>;

export function readThresholds(value: unknown): ColourThresholds | null {
  if (!isRecord(value)) return null;
  const out = { ...DEFAULT_THRESHOLDS };
  for (const key of THRESHOLD_KEYS) {
    const n = value[key];
    if (typeof n !== "number" || !Number.isSafeInteger(n)) return null;
    out[key] = n;
  }
  return out;
}

export function thresholdDraft(value: ColourThresholds): ThresholdDraft {
  return Object.fromEntries(
    THRESHOLD_KEYS.map((key) => [key, String(value[key] / 100)]),
  ) as ThresholdDraft;
}

/** Percent typed with up to two decimals → whole basis points. */
function percentToBps(text: string): number | null {
  const cleaned = text.trim().replace(/%$/, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const bps = Math.round(Number(cleaned) * 100);
  return bps >= 0 && bps <= 10_000 ? bps : null;
}

export const THRESHOLD_LABELS: Record<keyof ColourThresholds, string> = {
  minSaturationBps: "Strong from saturation",
  minLightnessBps: "Darker than this is near-black",
  maxLightnessBps: "Lighter than this is a light colour",
  a3MonochromeMaxBps: "A3 monochrome limit",
};

export type ThresholdRead =
  | { ok: true; value: ColourThresholds }
  | { ok: false; key: keyof ColourThresholds | null; problem: string };

/** Mirrors the API's `invalid_colour_settings` rules, field by field. */
export function readThresholdDraft(draft: ThresholdDraft): ThresholdRead {
  const value = { ...DEFAULT_THRESHOLDS };
  for (const key of THRESHOLD_KEYS) {
    const bps = percentToBps(draft[key]);
    if (bps == null) {
      return { ok: false, key, problem: `${THRESHOLD_LABELS[key]}: enter a percent from 0 to 100.` };
    }
    value[key] = bps;
  }
  if (value.minSaturationBps === 0) {
    return {
      ok: false,
      key: "minSaturationBps",
      problem: "Saturation must be above 0%, or greys would count as strong colour.",
    };
  }
  if (value.minLightnessBps >= value.maxLightnessBps) {
    return {
      ok: false,
      key: "minLightnessBps",
      problem: "The near-black limit must be below the light-colour limit.",
    };
  }
  if (value.maxLightnessBps === 10_000) {
    return {
      ok: false,
      key: "maxLightnessBps",
      problem: "The light-colour limit must be below 100%, or white would count.",
    };
  }
  return { ok: true, value };
}

/** The audit reason: each figure that moved, old to new. */
export function thresholdReason(before: ColourThresholds, after: ColourThresholds, note: string): string {
  const moved = THRESHOLD_KEYS.filter((key) => before[key] !== after[key]).map(
    (key) => `${THRESHOLD_LABELS[key]} ${bpsPercent(before[key])} to ${bpsPercent(after[key])}`,
  );
  const summary = `Colour detection: ${moved.length ? moved.join("; ") : "no figure changed"}`;
  const typed = note.trim();
  return (typed ? `${summary}. ${typed}` : summary).slice(0, 2000);
}

/**
 * The API's per-pixel rule (`strongPixel`): HSV saturation at or above the
 * limit, and HSL lightness inside the two limits, compared in integers so a
 * preview sits on exactly the same boundary as the estimate.
 */
export function countsAsStrong(
  rgb: readonly [number, number, number],
  thresholds: Pick<ColourThresholds, "minSaturationBps" | "minLightnessBps" | "maxLightnessBps">,
): boolean {
  const [r, g, b] = rgb;
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  return (
    high > 0 &&
    (high - low) * 10_000 >= thresholds.minSaturationBps * high &&
    (high + low) * 10_000 >= thresholds.minLightnessBps * 510 &&
    (high + low) * 10_000 <= thresholds.maxLightnessBps * 510
  );
}

/**
 * Ink a print shop names when it quotes, as sample data for the preview (not
 * portal colours). The report's own words: black, white, greys and light
 * colours are cheap; orange, red, green and bright blue are not.
 */
export const SAMPLE_INKS: ReadonlyArray<{ name: string; rgb: readonly [number, number, number] }> = [
  { name: "Black", rgb: [0, 0, 0] },
  { name: "Dark grey", rgb: [80, 80, 80] },
  { name: "Light grey", rgb: [200, 200, 200] },
  { name: "White", rgb: [255, 255, 255] },
  { name: "Navy, near black", rgb: [4, 6, 20] },
  { name: "Pale yellow", rgb: [255, 250, 205] },
  { name: "Sky tint", rgb: [210, 230, 250] },
  { name: "Muted tan", rgb: [190, 170, 150] },
  { name: "Orange", rgb: [245, 130, 32] },
  { name: "Red", rgb: [220, 30, 40] },
  { name: "Green", rgb: [40, 160, 70] },
  { name: "Bright blue", rgb: [20, 110, 230] },
];

// ---------------------------------------------------------------------------
// The shop's correction of a clearly wrong estimate (a change request)
// ---------------------------------------------------------------------------

export type CorrectionDraftRow = { fileId: string; page: number; percent: string; price: string };

export function correctionDraft(quote: ColourQuote): CorrectionDraftRow[] {
  return quote.pages.map((page) => ({
    fileId: page.fileId,
    page: page.page,
    percent: String(page.strongColourBps / 100),
    price: page.sheetPriceMinor == null ? "" : minorToPesosInput(page.sheetPriceMinor),
  }));
}

export type CorrectionRead =
  | {
      ok: true;
      pages: Array<{ fileId: string; page: number; strongColourBps: number; sheetPriceMinor: number }>;
      correctedLineSubtotalMinor: number;
      extraMinor: number;
      changed: boolean;
    }
  | { ok: false; page: number | null; problem: string };

/**
 * The corrected pages the API receives, with the line total and the extra
 * worked out the way the server does: corrected rates × the original
 * quantity, against the latest applied correction or the original line. The
 * server derives it again and refuses a mismatch; this only shows the shop
 * what it is asking before it sends.
 */
export function readCorrection(
  quote: ColourQuote,
  rows: CorrectionDraftRow[],
  baselineMinor: number,
): CorrectionRead {
  const pages = [];
  for (const row of rows) {
    const bps = percentToBps(row.percent);
    if (bps == null) {
      return { ok: false, page: row.page, problem: `Page ${row.page}: enter the strong colour as a percent from 0 to 100.` };
    }
    const price = pesosToMinor(row.price);
    if (price == null) {
      return { ok: false, page: row.page, problem: `Page ${row.page}: enter your sheet price in pesos, like 60.00.` };
    }
    pages.push({ fileId: row.fileId, page: row.page, strongColourBps: bps, sheetPriceMinor: price });
  }
  const correctedLineSubtotalMinor =
    pages.reduce((sum, page) => sum + page.sheetPriceMinor, 0) * Math.max(1, quote.quantity);
  const original = new Map(quote.pages.map((page) => [`${page.fileId}:${page.page}`, page]));
  const changed = pages.some((page) => {
    const before = original.get(`${page.fileId}:${page.page}`);
    return !before || before.strongColourBps !== page.strongColourBps || before.sheetPriceMinor !== page.sheetPriceMinor;
  });
  return {
    ok: true,
    pages,
    correctedLineSubtotalMinor,
    extraMinor: correctedLineSubtotalMinor - baselineMinor,
    changed,
  };
}

/** The shop's line total the correction is measured against. */
export function correctionBaseline(
  quote: ColourQuote,
  applied: { correctedLineSubtotalMinor?: number } | null | undefined,
): number | null {
  return applied?.correctedLineSubtotalMinor ?? quote.lineSubtotalMinor ?? null;
}
