/**
 * What Operations reads on the quality step.
 *
 * The file facts were stored at upload. This module only grades and lines
 * them up against the order. It does not fetch, and it does not invent a
 * colour mode, a font list, bleed, or a warning the client never accepted.
 */

import type { DetectedArtwork, Order, ProductionItem, StoredFile } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import { describeQuantity } from "@/lib/quantity";

export type Grade = "good" | "warning" | "problem";

export type GradedFact = {
  id: string;
  label: string;
  value: string;
  grade: Grade;
};

export type CompareMatch = "Match" | "Different" | "Check by eye";

export type CompareRow = {
  item: string;
  ordered: string;
  file: string;
  match: CompareMatch;
};

const MILLI = 1000;
const MM_PER_INCH = 25.4;

const NAMED_SIZES: Record<string, { width: number; height: number }> = {
  a3: { width: 297, height: 420 },
  a4: { width: 210, height: 297 },
  a5: { width: 148, height: 210 },
  a6: { width: 105, height: 148 },
  b5: { width: 176, height: 250 },
  letter: { width: 216, height: 279 },
  legal: { width: 216, height: 356 },
  tabloid: { width: 279, height: 432 },
};

const UNIT_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  inch: 25.4,
  inches: 25.4,
  ft: 304.8,
  foot: 304.8,
  feet: 304.8,
};

const STANDARD_FONT = /^(Helvetica|Times-Roman|Times|Courier|Symbol|ZapfDingbats)(-|$)/;

export type SizeMilli = { width: number; height: number };

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function roundMm(milli: number): string {
  const mm = milli / MILLI;
  const rounded = Math.round(mm * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function namedSizeMilli(label: string | null | undefined): SizeMilli | null {
  const raw = text(label);
  if (!raw) return null;
  const named = NAMED_SIZES[raw.toLowerCase().split(/\s+/)[0]];
  if (named) return { width: named.width * MILLI, height: named.height * MILLI };
  const pair = raw.toLowerCase().match(
    /^(\d+(?:\.\d+)?)\s*([a-z"]*)\s*[x×]\s*(\d+(?:\.\d+)?)\s*([a-z"]*)/,
  );
  if (!pair) return null;
  const unit = pair[4] || pair[2];
  const scale = UNIT_MM[unit];
  if (!scale) return null;
  if (pair[2] && pair[4] && pair[2] !== pair[4]) return null;
  const width = Math.round(Number(pair[1]) * scale * MILLI);
  const height = Math.round(Number(pair[3]) * scale * MILLI);
  if (!(width > 0) || !(height > 0)) return null;
  return { width, height };
}

function measuredSize(item: ProductionItem | undefined): SizeMilli | null {
  const width = item?.measurement?.widthMilli;
  const height = item?.measurement?.heightMilli;
  if (!width || !height) return null;
  const scale = UNIT_MM[String(item?.measurement?.unit ?? "").toLowerCase()];
  if (!scale) return null;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** The physical size the client ordered, in thousandths of a millimetre. */
export function orderedSizeMilli(order: Pick<Order, "size" | "productionItems">): SizeMilli | null {
  for (const item of order.productionItems || []) {
    const measured = measuredSize(item);
    if (measured) return measured;
  }
  return namedSizeMilli(order.size) || namedSizeMilli(specText(order, "size"));
}

/** Held work is printed at 300 DPI. Anything over about two feet is large format, at 100. */
export function dpiTarget(size: SizeMilli): number {
  const longest = Math.max(size.width, size.height);
  return longest > 600 * MILLI ? 100 : 300;
}

function largeFormat(size: SizeMilli | null): boolean {
  return Boolean(size && Math.max(size.width, size.height) > 600 * MILLI);
}

export function effectiveDpi(
  pixels: { width: number; height: number } | null,
  size: SizeMilli | null,
): number | null {
  if (!pixels?.width || !pixels?.height || !size) return null;
  const pixelLong = Math.max(pixels.width, pixels.height);
  const pixelShort = Math.min(pixels.width, pixels.height);
  const sizeLong = Math.max(size.width, size.height) / MILLI / MM_PER_INCH;
  const sizeShort = Math.min(size.width, size.height) / MILLI / MM_PER_INCH;
  if (!(sizeLong > 0) || !(sizeShort > 0)) return null;
  return Math.round(Math.min(pixelLong / sizeLong, pixelShort / sizeShort));
}

function gradeDpi(dpi: number, target: number): Grade {
  if (dpi >= target) return "good";
  if (dpi >= target / 2) return "warning";
  return "problem";
}

function specOf(order: Pick<Order, "productionItems">): Record<string, unknown> {
  const spec = order.productionItems?.[0]?.structuredSpec;
  return spec && typeof spec === "object" ? spec : {};
}

function specText(order: Pick<Order, "productionItems">, key: string): string | null {
  return text(specOf(order)[key]);
}

function orientationOf(size: SizeMilli | null): "portrait" | "landscape" | "square" | null {
  if (!size) return null;
  if (size.width === size.height) return "square";
  return size.width > size.height ? "landscape" : "portrait";
}

function orientationLabel(value: string | null | undefined): string {
  if (value === "landscape") return "Landscape";
  if (value === "portrait") return "Portrait";
  if (value === "square") return "Square";
  return "Not in the file";
}

function sizesMatch(file: SizeMilli, ordered: SizeMilli): boolean {
  const fileShort = Math.min(file.width, file.height);
  const fileLong = Math.max(file.width, file.height);
  const orderedShort = Math.min(ordered.width, ordered.height);
  const orderedLong = Math.max(ordered.width, ordered.height);
  return Math.abs(fileShort - orderedShort) <= 2 * MILLI && Math.abs(fileLong - orderedLong) <= 2 * MILLI;
}

function fileSizeMilli(detected: DetectedArtwork | null | undefined): SizeMilli | null {
  if (!detected?.widthMilli || !detected.heightMilli) return null;
  return { width: detected.widthMilli, height: detected.heightMilli };
}

function pageSizeValue(detected: DetectedArtwork): string {
  const size = fileSizeMilli(detected);
  const mm = size ? `${roundMm(size.width)} × ${roundMm(size.height)} mm` : null;
  if (detected.pageSize && mm) return `${mm}, ${detected.pageSize}`;
  return detected.pageSize || mm || "Not in the file";
}

function colorValue(detected: DetectedArtwork): string | null {
  if (!detected.colorMode) return null;
  const names: Record<string, string> = {
    cmyk: "CMYK",
    rgb: "RGB",
    gray: "Greyscale",
    mixed: "Mixed",
    indexed: "Indexed",
    icc: "ICC profile",
    spot: "Spot colour",
  };
  const label = names[detected.colorMode] || detected.colorMode;
  return detected.hasAlpha ? `${label}, with transparency` : label;
}

function gradeColor(mode: string, alpha: boolean, large: boolean): Grade {
  if (alpha) return "warning";
  if (mode === "cmyk") return "good";
  if (mode === "rgb") return large ? "good" : "warning";
  if (mode === "mixed" || mode === "indexed" || mode === "icc" || mode === "spot" || mode === "gray") {
    return "warning";
  }
  return "warning";
}

function gradeFonts(fonts: { name: string; embedded: boolean }[]): Grade {
  const missing = fonts.filter((font) => !font.embedded && !STANDARD_FONT.test(font.name));
  if (missing.length) return "problem";
  if (fonts.some((font) => !font.embedded)) return "warning";
  return "good";
}

function fontValue(fonts: { name: string; embedded: boolean }[]): string {
  return fonts
    .map((font) => `${font.name}, ${font.embedded ? "embedded" : "not embedded"}`)
    .join("; ");
}

function gradeBleed(bleedMilli: number, large: boolean): Grade {
  if (large) return bleedMilli > 0 ? "good" : "warning";
  if (bleedMilli >= 2.5 * MILLI) return "good";
  if (bleedMilli > 0) return "warning";
  return "problem";
}

function primaryDetected(files: readonly StoredFile[]): DetectedArtwork | null {
  for (const file of files) {
    if (file.detected?.widthMilli || file.detected?.pageCount || file.detected?.pixelWidth) {
      return file.detected;
    }
  }
  return files.find((file) => file.detected)?.detected ?? null;
}

export function acceptedUploadWarning(
  files: readonly Pick<StoredFile, "detected">[],
): { at: string; text: string } | null {
  for (const file of files) {
    const warning = file.detected?.acceptedWarning;
    if (!warning || typeof warning.at !== "string" || !warning.at.trim()) continue;
    const message = text(warning.message);
    return {
      at: warning.at,
      text: message || "The client accepted a warning on this file at upload.",
    };
  }
  return null;
}

/** File facts Operations grades. Omitted when the upload reader did not store them. */
export function fileDetailFacts(
  files: readonly StoredFile[],
  order: Pick<Order, "size" | "productionItems">,
): GradedFact[] {
  const detected = primaryDetected(files);
  if (!detected) return [];
  const ordered = orderedSizeMilli(order);
  const large = largeFormat(ordered);
  const facts: GradedFact[] = [];
  const raster = detected.kind === "raster" || (detected.pixelWidth != null && detected.pixelHeight != null);

  if (!raster && (detected.widthMilli || detected.pageSize || detected.pageCount)) {
    if (detected.widthMilli && detected.heightMilli) {
      const fileSize = fileSizeMilli(detected);
      let grade: Grade = "warning";
      if (fileSize && ordered) grade = sizesMatch(fileSize, ordered) ? "good" : "problem";
      facts.push({ id: "page-size", label: "Page size", value: pageSizeValue(detected), grade });
    }
    if (detected.pageCount != null) {
      const orderedPages = orderedPageCount(order);
      let grade: Grade = "warning";
      if (orderedPages != null) grade = detected.pageCount === orderedPages ? "good" : "problem";
      facts.push({
        id: "pages",
        label: "Pages",
        value: String(detected.pageCount),
        grade,
      });
    }
    const color = colorValue(detected);
    if (color && detected.colorMode) {
      facts.push({
        id: "color",
        label: "Colour mode",
        value: color,
        grade: gradeColor(detected.colorMode, Boolean(detected.hasAlpha), large),
      });
    }
    if (detected.fonts?.length) {
      facts.push({
        id: "fonts",
        label: "Embedded fonts",
        value: fontValue(detected.fonts),
        grade: gradeFonts(detected.fonts),
      });
    }
    if (typeof detected.bleedMilli === "number") {
      facts.push({
        id: "bleed",
        label: "Bleed",
        value: `${roundMm(detected.bleedMilli)} mm`,
        grade: gradeBleed(detected.bleedMilli, large),
      });
    }
  }

  if (raster && detected.pixelWidth && detected.pixelHeight) {
    facts.push({
      id: "pixels",
      label: "Pixels",
      value: `${detected.pixelWidth} × ${detected.pixelHeight}`,
      grade: "good",
    });
    const color = colorValue(detected);
    if (color && detected.colorMode) {
      facts.push({
        id: "color",
        label: "Colour mode",
        value: color,
        grade: gradeColor(detected.colorMode, Boolean(detected.hasAlpha), large),
      });
    }
    const dpi = effectiveDpi(
      { width: detected.pixelWidth, height: detected.pixelHeight },
      ordered,
    );
    if (dpi != null && ordered) {
      const target = dpiTarget(ordered);
      facts.push({
        id: "dpi",
        label: "Effective DPI",
        value: `${dpi} DPI at the ordered size (target ${target})`,
        grade: gradeDpi(dpi, target),
      });
    }
  }

  return facts;
}

function orderedPageCount(order: Pick<Order, "productionItems">): number | null {
  for (const item of order.productionItems || []) {
    if (item.measurement?.pages && item.measurement.pages > 0) return item.measurement.pages;
    if (item.documentPages?.printed && item.documentPages.printed > 0) return item.documentPages.printed;
  }
  return null;
}

function orderedSizeLabel(order: Pick<Order, "size" | "productionItems">): string {
  const named = text(order.size) || specText(order, "size");
  const size = orderedSizeMilli(order);
  if (named && size) return `${named} (${roundMm(Math.min(size.width, size.height))} × ${roundMm(Math.max(size.width, size.height))} mm)`;
  if (size) return `${roundMm(size.width)} × ${roundMm(size.height)} mm`;
  return named || "Not on the order";
}

function carries(order: Pick<Order, "productionItems">, keys: string[]): string | null {
  const spec = specOf(order);
  for (const key of keys) {
    const value = text(spec[key]);
    if (value) return value;
  }
  return null;
}

export function specComparison(
  order: Pick<Order, "size" | "material" | "finish" | "productionItems" | "specialInstructions" | "notes">,
  files: readonly StoredFile[],
): { rows: CompareRow[]; instructions: string | null } {
  const detected = primaryDetected(files);
  const ordered = orderedSizeMilli(order);
  const fileSize = fileSizeMilli(detected);
  const sizeMatch: CompareMatch = !fileSize || !ordered
    ? "Check by eye"
    : sizesMatch(fileSize, ordered)
      ? "Match"
      : "Different";
  const orderedOrientation = orientationOf(ordered);
  const fileOrientation = detected?.orientation ?? null;
  const orientationMatch: CompareMatch = !orderedOrientation || !fileOrientation
    ? "Check by eye"
    : orderedOrientation === fileOrientation
      ? "Match"
      : "Different";
  const orderedPages = orderedPageCount(order);
  const filePages = detected?.pageCount ?? null;
  const pageMatch: CompareMatch = orderedPages == null || filePages == null
    ? "Check by eye"
    : orderedPages === filePages
      ? "Match"
      : "Different";

  const rows: CompareRow[] = [
    {
      item: "Size",
      ordered: orderedSizeLabel(order),
      file: detected ? pageSizeValue(detected) : "Not in the file",
      match: sizeMatch,
    },
    {
      item: "Orientation",
      ordered: orientationLabel(orderedOrientation),
      file: orientationLabel(fileOrientation),
      match: orientationMatch,
    },
    {
      item: "Pages",
      ordered: orderedPages == null ? "Not on the order" : String(orderedPages),
      file: filePages == null ? "Not in the file" : String(filePages),
      match: pageMatch,
    },
    {
      item: "Paper",
      ordered: text(order.material) || specText(order, "material") || "Not on the order",
      file: "Check by eye",
      match: "Check by eye",
    },
    {
      item: "Finish",
      ordered: text(order.finish) || specText(order, "finish") || "Not on the order",
      file: "Check by eye",
      match: "Check by eye",
    },
    {
      item: "Binding",
      ordered: carries(order, ["binding"]) || bindingOption(order) || "Not on the order",
      file: "Check by eye",
      match: "Check by eye",
    },
  ];

  const optional: { item: string; keys: string[] }[] = [
    { item: "Colour mode", keys: ["colorMode", "colourMode"] },
    { item: "Sides", keys: ["sides"] },
    { item: "Bleed", keys: ["bleed"] },
    { item: "Layout", keys: ["layout"] },
  ];
  for (const row of optional) {
    const orderedValue = carries(order, row.keys);
    if (!orderedValue) continue;
    rows.push({
      item: row.item,
      ordered: orderedValue,
      file: "Check by eye",
      match: "Check by eye",
    });
  }

  return { rows, instructions: specialInstructions(order) };
}

function bindingOption(order: Pick<Order, "productionItems">): string | null {
  for (const item of order.productionItems || []) {
    const option = item.options?.find((entry) => /binding/i.test(entry.groupName || ""));
    if (option?.label) return option.label;
  }
  return null;
}

function specialInstructions(
  order: Pick<Order, "productionItems" | "specialInstructions" | "notes">,
): string | null {
  const parts = [
    text(order.specialInstructions),
    text(order.notes),
    specText(order, "specialInstructions"),
    specText(order, "instructions"),
    specText(order, "notes"),
  ].filter((part): part is string => Boolean(part));
  const unique = [...new Set(parts)];
  return unique.length ? unique.join("\n") : null;
}

export type QuantityFacts = {
  quantity: string;
  unitPrice: string;
  total: string;
};

export function quantityFacts(
  order: Pick<Order, "quantity" | "unit" | "subtotalMinor" | "totalMinor" | "productionItems">,
): QuantityFacts {
  const count = typeof order.quantity === "number" && Number.isFinite(order.quantity)
    ? order.quantity
    : null;
  const line = order.productionItems?.find((item) => typeof item.effectiveUnitPriceMinor === "number");
  let unitMinor: number | null = line?.effectiveUnitPriceMinor ?? null;
  if (unitMinor == null && count && count > 0 && typeof order.subtotalMinor === "number") {
    if (order.subtotalMinor % count === 0) unitMinor = order.subtotalMinor / count;
  }
  return {
    quantity: count == null ? "Not on the order" : describeQuantity(count, order.unit),
    unitPrice: unitMinor == null ? "Not on the order" : formatPhp(unitMinor),
    total: typeof order.totalMinor === "number" ? formatPhp(order.totalMinor) : "Not on the order",
  };
}

export type AddressFacts = {
  address: string;
  zone: string | null;
  distance: string | null;
  landmark: string | null;
  pin: { lat: number; lng: number; label: string } | null;
  pinStatus: string | null;
  warning: string | null;
};

export function addressFacts(order: Order): AddressFacts {
  return {
    address: text(order.address) || "No address on the order",
    zone: text(order.zone),
    distance: formatDistance(order.deliveryDistanceMeters),
    landmark: landmarkOf(order),
    pin: latestPin(order),
    pinStatus: pinStatus(order),
    warning: pinWarning(order),
  };
}

function formatDistance(meters: number | null | undefined): string | null {
  if (typeof meters !== "number" || !Number.isFinite(meters) || meters < 0) return null;
  if (meters < 1000) return `${Math.round(meters)} m from the shop`;
  const km = meters / 1000;
  const rounded = Math.round(km * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} km from the shop`;
}

function landmarkOf(order: Order): string | null {
  const direct = text(order.landmark);
  if (direct) return direct;
  const match = text(order.address)?.match(/\(([^)]*)\)\s*$/);
  return match?.[1]?.trim() || null;
}

function latestPin(order: Order): { lat: number; lng: number; label: string } | null {
  const confirmation = order.dropoffConfirmation;
  const candidates = [
    confirmation?.status === "confirmed" ? confirmation.point : null,
    confirmation?.requestedPoint,
    confirmation?.point,
    order.dropoff,
    order.requestFulfillment?.dropoff,
  ];
  for (const point of candidates) {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
    return { lat: point.lat, lng: point.lng, label: point.label || "" };
  }
  return null;
}

function pinStatus(order: Order): string | null {
  const status = order.dropoffConfirmation?.status;
  if (!status) return null;
  if (status === "confirmed") return "Pin confirmed";
  if (status === "pending") return "Pin not confirmed yet";
  if (status === "needs_review") return "Pin change needs review";
  return status;
}

function pinWarning(order: Order): string | null {
  const written = text(order.pinWarning) || text(order.dropoffConfirmation?.warning);
  if (written) return written;
  if (
    order.pinFarFromAddress ||
    order.outsideDeliveryArea ||
    order.dropoffConfirmation?.farFromAddress ||
    order.dropoffConfirmation?.outsideArea
  ) {
    return "The pin is far from the address or outside the area.";
  }
  return null;
}

export function hasProblem(
  facts: readonly GradedFact[],
  rows: readonly CompareRow[],
): boolean {
  if (facts.some((fact) => fact.grade === "problem")) return true;
  return rows.some((row) => row.match === "Different" && ["Size", "Orientation", "Pages"].includes(row.item));
}
