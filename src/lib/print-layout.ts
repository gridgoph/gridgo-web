/**
 * Print layout: how a document or drawing sits on the paper (gridgo-client#245;
 * contract gridgo-api docs/PRINT_LAYOUT_API.md).
 *
 * A shop marks which layouts a listing prints. A client ordering it must
 * choose one before checkout, and the API freezes the choice and the fit check
 * the client saw onto the order line. This module names the layouts with the
 * customer app's words (gridgo-client `lib/printLayout.ts`) and turns the
 * frozen check into what the shop needs at the press: the paper, the client's
 * page, and whether anything is cut off or the drawing scale changes. It never
 * measures anything itself: a size GRIDGO could not read is said to be
 * unknown, never guessed.
 */

import type {
  Order,
  PrintLayoutCheck,
  PrintLayoutCode,
  PrintLayoutFilePage,
  PrintLayoutPaper,
  ProductionItem,
} from "@/lib/api/types";

export const LAYOUT_CODES = [
  "fit_to_paper",
  "actual_size_centered",
  "actual_size_original_position",
] as const;

export type KnownLayout = (typeof LAYOUT_CODES)[number];

const LABELS: Record<KnownLayout, string> = {
  fit_to_paper: "Fit to paper",
  actual_size_centered: "Actual size, centred",
  actual_size_original_position: "Actual size, in its original position",
};

/** What each layout does, as the client reads it. */
const HINTS: Record<KnownLayout, string> = {
  fit_to_paper: "Scaled up or down to fill the paper.",
  actual_size_centered: "Printed at 100%, in the middle of the paper.",
  actual_size_original_position: "Printed at 100%, from the page's top-left corner.",
};

/** What the shop does at the press for each layout. */
const PRESS: Record<KnownLayout, string> = {
  fit_to_paper: "Scale the page to fit the paper, keeping its proportions, centred.",
  actual_size_centered: "Print at 100%, centred on the paper.",
  actual_size_original_position: "Print at 100%, from the page's top-left corner.",
};

export function isKnownLayout(code: unknown): code is KnownLayout {
  return typeof code === "string" && (LAYOUT_CODES as readonly string[]).includes(code);
}

/** "Fit to paper". A code added after this build shipped reads as itself, tidied. */
export function layoutLabel(code: PrintLayoutCode): string {
  if (isKnownLayout(code)) return LABELS[code];
  const words = code.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function layoutHint(code: KnownLayout): string {
  return HINTS[code];
}

/**
 * A listing's layouts from the API, in the canonical order, deduplicated.
 * `null` when the API does not send the field (it predates layouts), so a
 * screen can stay silent instead of offering a choice it cannot save.
 */
export function readPrintLayouts(value: unknown): KnownLayout[] | null {
  if (!Array.isArray(value)) return null;
  return LAYOUT_CODES.filter((code) => value.includes(code));
}

/** The set with `code` switched on or off, in the canonical order. */
export function toggleLayout(
  current: readonly KnownLayout[],
  code: KnownLayout,
): KnownLayout[] {
  const on = current.includes(code);
  return LAYOUT_CODES.filter((entry) => (entry === code ? !on : current.includes(entry)));
}

/** Two sets hold the same layouts, whatever their order. */
export function sameLayouts(
  a: readonly string[] | null | undefined,
  b: readonly string[] | null | undefined,
): boolean {
  const left = LAYOUT_CODES.filter((code) => (a ?? []).includes(code));
  const right = LAYOUT_CODES.filter((code) => (b ?? []).includes(code));
  return left.join() === right.join();
}

/** The layouts in a sentence, for the review screens. */
export function layoutsLine(codes: readonly string[] | null | undefined): string {
  const known = LAYOUT_CODES.filter((code) => (codes ?? []).includes(code));
  if (!known.length) return "None: clients are not asked";
  return known.map((code) => LABELS[code]).join("; ");
}

// ---- The editor ----

/** Under the Print layouts heading in the shop's listing editor. */
export const PRINT_LAYOUTS_HELP =
  "For documents and drawings: how the client's file sits on the paper. Mark only the layouts you can print.";

/** What marking a layout means for clients, said before the shop ticks one. */
export function printLayoutsEffect(codes: readonly KnownLayout[]): string {
  return codes.length
    ? "Clients must choose one of these before they can order this listing. Nothing is chosen for them."
    : "No layout marked: clients are not asked how the file sits on the paper. Mark one or more and clients must choose one before they can order.";
}

/** A changed set waits for the GRIDGO Team, like any change to price or specs. */
export const PRINT_LAYOUTS_REVIEW =
  "A change goes to the GRIDGO Team for review. Until it is approved, clients keep seeing the layouts you had before.";

// ---- Sizes ----

/** "210 × 297 mm", to the millimetre. */
export function sizeLine(size: { widthMilli: number; heightMilli: number }): string {
  const mm = (milli: number) => String(Math.round(milli / 1000));
  return `${mm(size.widthMilli)} × ${mm(size.heightMilli)} mm`;
}

/** "A4, 210 × 297 mm"; a label that already gives its size is not repeated. */
export function paperLine(paper: PrintLayoutPaper): string {
  const label = paper.label.trim();
  if (!label || /\d\s*(mm|cm|in|ft|")/i.test(label) || /\d\s*[x×]\s*\d/i.test(label)) {
    return label ? `${label} (${sizeLine(paper)})` : sizeLine(paper);
  }
  return `${label}, ${sizeLine(paper)}`;
}

/** "A3, 297 × 420 mm" or "297 × 420 mm" when the page has no standard name. */
export function pageLine(page: PrintLayoutFilePage): string {
  return page.pageSize ? `${page.pageSize}, ${sizeLine(page)}` : sizeLine(page);
}

/** The first page GRIDGO could measure, as the client's preview drew it. */
function firstPage(check: PrintLayoutCheck): PrintLayoutFilePage | null {
  return check.files.find((file) => file.page)?.page ?? null;
}

/** A page's name for a sentence: "A3" or "297 × 420 mm". */
function pageName(page: PrintLayoutFilePage | null): string {
  if (!page) return "the page";
  return page.pageSize ? `${page.pageSize} page` : `${sizeLine(page)} page`;
}

/**
 * How much Fit to paper scales the first page, either way round, as a whole
 * percentage. Null when a size is missing or the pages differ in size.
 */
export function fitScalePercent(
  paper: Pick<PrintLayoutPaper, "widthMilli" | "heightMilli"> | null,
  page: PrintLayoutFilePage | null,
): number | null {
  if (!paper || !page || page.mixedPageSizes) return null;
  const pageShort = Math.min(page.widthMilli, page.heightMilli);
  const pageLong = Math.max(page.widthMilli, page.heightMilli);
  const paperShort = Math.min(paper.widthMilli, paper.heightMilli);
  const paperLong = Math.max(paper.widthMilli, paper.heightMilli);
  if (!(pageShort > 0 && pageLong > 0 && paperShort > 0 && paperLong > 0)) return null;
  return Math.round(Math.min(paperShort / pageShort, paperLong / pageLong) * 100);
}

// ---- The agreed spec ----

export type LayoutNoteTone = "warning" | "success" | "neutral";

export type LayoutNote = { tone: LayoutNoteTone; text: string };

export type LayoutSpec = {
  code: PrintLayoutCode;
  label: string;
  /** What to do at the press; null for a code this build does not know. */
  press: string | null;
  paper: string | null;
  page: string | null;
  /** The pages differ in size; GRIDGO checked the largest. */
  mixed: boolean;
  /** The one outcome: cut off, scale changes, fits, or not known. */
  outcome: LayoutNote | null;
  /** A paper the listing offers that would have taken the page whole. */
  suggestion: string | null;
};

/**
 * One order line's layout and frozen check, in shop wording. Null for a line
 * whose product has no layout choice (and every line of an older order).
 */
export function layoutSpec(
  item: Pick<ProductionItem, "printLayout" | "printLayoutCheck">,
): LayoutSpec | null {
  const code = item.printLayout;
  if (!code) return null;
  const check = item.printLayoutCheck ?? null;
  const page = check ? firstPage(check) : null;
  const paper = check?.paper ?? null;
  return {
    code,
    label: layoutLabel(code),
    press: isKnownLayout(code) ? PRESS[code] : null,
    paper: paper ? paperLine(paper) : null,
    page: page ? pageLine(page) : null,
    mixed: Boolean(check?.files.some((file) => file.page?.mixedPageSizes)),
    outcome: check ? outcomeOf(code, check, page) : null,
    suggestion:
      check?.exceedsPaper && check.suggestedPaper && code !== "fit_to_paper"
        ? `${check.suggestedPaper.label} would have printed it whole.`
        : null,
  };
}

function outcomeOf(
  code: PrintLayoutCode,
  check: PrintLayoutCheck,
  page: PrintLayoutFilePage | null,
): LayoutNote {
  const paper = check.paper;
  const unknown: LayoutNote = {
    tone: "neutral",
    text: !paper
      ? "GRIDGO could not read a paper size from the options, so the fit was not checked. Check the file against the paper before printing."
      : "GRIDGO could not read the page size of the file, so the fit was not checked. Check the file against the paper before printing.",
  };
  if (code === "fit_to_paper") {
    if (check.scaleChanges === true && paper) {
      const percent = fitScalePercent(paper, page);
      const how = percent == null ? "" : ` (about ${percent}%)`;
      return {
        tone: "warning",
        text: `The drawing scale changes: the client's ${pageName(page)} is scaled to fit ${paper.label}${how}. The client was told before ordering.`,
      };
    }
    if (check.scaleChanges === false && paper) {
      return {
        tone: "success",
        text: `The page is already ${paper.label}, so the drawing prints at its own scale.`,
      };
    }
    return unknown;
  }
  if (check.cutOff === true && paper) {
    const edges =
      code === "actual_size_original_position"
        ? "its right and bottom edges past the paper are cut off"
        : "its edges past the paper are cut off";
    return {
      tone: "warning",
      text: `The client's ${pageName(page)} is bigger than ${paper.label}, so ${edges}. The client was told before ordering.`,
    };
  }
  if (check.exceedsPaper === false && paper) {
    return { tone: "success", text: `The page fits on ${paper.label} at its real size.` };
  }
  return unknown;
}

/** The lines of an order that carry a layout, in the order's own order. */
export function layoutItems(
  order: Pick<Order, "productionItems">,
): Array<{ item: ProductionItem; spec: LayoutSpec }> {
  return (order.productionItems ?? []).flatMap((item) => {
    const spec = layoutSpec(item);
    return spec ? [{ item, spec }] : [];
  });
}

/** The job ticket's one line: the layout and what it does to the page. */
export function ticketLayoutLine(spec: LayoutSpec, item?: ProductionItem): string {
  const check = item?.printLayoutCheck ?? null;
  const paper = check?.paper?.label;
  if (check?.cutOff && paper) return `Layout: ${spec.label}, cut off on ${paper}`;
  if (spec.code === "fit_to_paper" && check?.scaleChanges && paper) {
    return `Layout: ${spec.label}, scaled to ${paper}`;
  }
  return `Layout: ${spec.label}`;
}
