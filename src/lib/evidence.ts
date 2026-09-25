/**
 * File ids Operations should be able to look at on an order.
 * Artwork and mockup come from checkout lines; payment proof lives on each
 * installment (including live API `initial` / `final_online` keys).
 */

import type {
  DetectedArtwork,
  Order,
  OrderLineMeasurement,
  ProductionItem,
  StoredFile,
} from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { listedInstallments, paymentOf } from "@/lib/payments";
import { presentInstallment } from "@/lib/order-state";

export type EvidenceKind =
  | "artwork"
  | "mockup"
  | "payment_proof"
  | "pof"
  | "delivery"
  | "pickup"
  | "payout_receipt";

export type EvidenceItem = {
  fileId: string;
  kind: EvidenceKind;
  label: string;
  caption?: string | null;
  /** Catalog size label on the order or checkout line (`A5`, `3x6 ft`). */
  productSize?: string | null;
  /** Typed width × height when the listing is billed by area, not a size name. */
  productMeasurement?: OrderLineMeasurement | null;
};

function uniqueIds(ids: Array<string | null | undefined> | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids ?? []) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function specSize(spec: Record<string, unknown> | null | undefined): string | null {
  const value = spec?.size;
  return typeof value === "string" && value.trim() ? value : null;
}

function productionLineForArtwork(
  items: ProductionItem[] | null | undefined,
  fileId: string,
): ProductionItem | null {
  if (!items?.length) return null;
  return items.find((item) => item.artworkFileId === fileId) ?? items[0];
}

export function artworkEvidence(
  order: Pick<Order, "artworkFileIds" | "artworkName" | "size" | "productionItems">,
): EvidenceItem[] {
  return uniqueIds(order.artworkFileIds).map((fileId, index, all) => {
    const line = productionLineForArtwork(order.productionItems, fileId);
    return {
      fileId,
      kind: "artwork" as const,
      label: all.length > 1 ? `Artwork ${index + 1}` : "Artwork",
      caption: index === all.length - 1 ? order.artworkName : null,
      productSize: specSize(line?.structuredSpec) || order.size || null,
      productMeasurement: line?.measurement ?? null,
    };
  });
}

export function mockupEvidence(order: Pick<Order, "mockupFileIds">): EvidenceItem[] {
  return uniqueIds(order.mockupFileIds).map((fileId, index, all) => ({
    fileId,
    kind: "mockup",
    label: all.length > 1 ? `Mockup ${index + 1}` : "Mockup",
  }));
}

export function paymentProofEvidence(order: Pick<Order, "payments">): EvidenceItem[] {
  return listedInstallments(order).flatMap((code) => {
    const payment = paymentOf(order, code);
    const fileId = payment?.proofFileId;
    if (!fileId) return [];
    return [
      {
        fileId,
        kind: "payment_proof" as const,
        label: `${presentInstallment(code, order)} proof`,
        caption: payment.reference,
      },
    ];
  });
}

export function pofEvidence(order: Pick<Order, "payoutMilestones">): EvidenceItem[] {
  return (order.payoutMilestones ?? []).flatMap((milestone) =>
    uniqueIds(milestone.pofFileIds).map((fileId, index, all) => ({
      fileId,
      kind: "pof" as const,
      label:
        all.length > 1
          ? `${milestone.code} proof ${index + 1}`
          : `${milestone.code} proof`,
    })),
  );
}

export function deliveryEvidenceItems(
  order: Pick<Order, "deliveryEvidence" | "deliveryPhotoFileIds">,
): EvidenceItem[] {
  return uniqueIds([
    order.deliveryEvidence?.fileId,
    ...(order.deliveryPhotoFileIds ?? []),
  ]).map((fileId, index, all) => ({
    fileId,
    kind: "delivery" as const,
    label: all.length > 1 ? `Delivery photo ${index + 1}` : "Delivery photo",
  }));
}

export function pickupEvidence(order: Pick<Order, "pickupChecklist">): EvidenceItem[] {
  return uniqueIds(order.pickupChecklist?.evidenceFileIds).map((fileId, index, all) => ({
    fileId,
    kind: "pickup" as const,
    label: all.length > 1 ? `Pickup photo ${index + 1}` : "Pickup photo",
  }));
}

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

export function fileLooksLikeImage(file: {
  declaredContentType?: string | null;
  detectedContentType?: string | null;
  originalFilename?: string | null;
}): boolean {
  const type = (file.detectedContentType || file.declaredContentType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (IMAGE_TYPES.has(type) || type.startsWith("image/")) return true;
  return IMAGE_EXT.test(file.originalFilename || "");
}

/** File size for the plate under artwork — "3 MB", "420 KB". */
export function formatFileBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const format = (value: number, unit: string) => {
    const label =
      value >= 10 || Number.isInteger(value) ? String(Math.round(value)) : value.toFixed(1);
    return `${label} ${unit}`;
  };
  if (bytes < 1024 * 1024) return format(bytes / 1024, "KB");
  return format(bytes / (1024 * 1024), "MB");
}

/** Millimetres from the thousandths the platform stores. */
function mmFromMilli(milli: number): number {
  return Math.round(milli / 100) / 10;
}

/**
 * Print-desk size line: named paper first, then mm, then pixels, plus DPI.
 * Null when the file said nothing — do not show an empty confident sentence.
 */
export function detectedPrintSummary(
  detected: DetectedArtwork | null | undefined,
): string | null {
  if (!detected) return null;

  const parts: string[] = [];
  if (detected.pageSize) {
    parts.push(
      detected.orientation === "landscape"
        ? `${detected.pageSize} landscape`
        : detected.pageSize,
    );
  } else if (detected.widthMilli && detected.heightMilli) {
    parts.push(
      `${mmFromMilli(detected.widthMilli)} × ${mmFromMilli(detected.heightMilli)} mm`,
    );
  } else if (detected.pixelWidth && detected.pixelHeight) {
    parts.push(`${detected.pixelWidth} × ${detected.pixelHeight} px`);
  }

  if (detected.dpi && detected.dpi > 0) {
    parts.push(`${detected.dpi} DPI`);
  }
  if (detected.pageCount && detected.pageCount > 1) {
    parts.push(`${detected.pageCount} pages`);
  }

  return parts.length ? parts.join(" · ") : null;
}

/**
 * Facts under an artwork plate: print size / DPI, file size, date created.
 */
export function artworkFileFacts(file: Pick<StoredFile, "size" | "createdAt" | "detected">): string[] {
  const facts: string[] = [];
  const print = detectedPrintSummary(file.detected);
  if (print) facts.push(print);
  if (typeof file.size === "number") facts.push(formatFileBytes(file.size));
  if (file.createdAt) facts.push(formatDateTime(file.createdAt));
  return facts;
}

export const ARTWORK_SIZE_MISMATCH = "File size not match on the product size";

/**
 * Named paper the size lists offer, portrait, in whole millimetres.
 * Same names the API and the client artwork step already share.
 */
const NAMED_PRINT_SIZES: Record<string, { widthMm: number; heightMm: number }> = {
  a3: { widthMm: 297, heightMm: 420 },
  a4: { widthMm: 210, heightMm: 297 },
  a5: { widthMm: 148, heightMm: 210 },
  a6: { widthMm: 105, heightMm: 148 },
  b5: { widthMm: 176, heightMm: 250 },
  dl: { widthMm: 99, heightMm: 210 },
  letter: { widthMm: 216, heightMm: 279 },
  legal: { widthMm: 216, heightMm: 356 },
  tabloid: { widthMm: 279, heightMm: 432 },
};

const NAMED_SIZE_RE = /\b(a[3-6]|b5|dl|letter|legal|tabloid)\b/i;
const PRINT_SIZE_TOLERANCE_MM = 2;

const UNIT_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  inch: 25.4,
  inches: 25.4,
  '"': 25.4,
  ft: 304.8,
  foot: 304.8,
  feet: 304.8,
};

type PrintSize = {
  name?: string;
  widthMm: number;
  heightMm: number;
};

/** Label and/or typed measurement — whatever the product actually ordered. */
export type ProductSizeHint = {
  label?: string | null;
  measurement?: OrderLineMeasurement | null;
};

function namedPrintSize(raw: string | null | undefined): PrintSize | null {
  if (!raw) return null;
  const text = raw.trim().toLowerCase();
  if (!text) return null;
  const first = text.split(/\s+/)[0];
  const fromFirst = NAMED_PRINT_SIZES[first];
  if (fromFirst) return { name: first, ...fromFirst };
  const match = text.match(NAMED_SIZE_RE);
  if (!match) return null;
  const key = match[1].toLowerCase();
  const size = NAMED_PRINT_SIZES[key];
  return size ? { name: key, ...size } : null;
}

/**
 * "90x50 mm", "3 × 6 ft", "24 x 36 in", "3.5x2 in".
 * A unit is required — "2x4" with no unit is not a size we will invent.
 */
function measuredPrintSize(raw: string | null | undefined): PrintSize | null {
  if (!raw) return null;
  const text = raw.trim().toLowerCase();
  const pair = text.match(
    /^(\d+(?:\.\d+)?)\s*([a-z"]*)\s*[x×]\s*(\d+(?:\.\d+)?)\s*([a-z"]*)/,
  );
  if (!pair) return null;
  const [, first, firstUnit, second, secondUnit] = pair;
  const unit = secondUnit || firstUnit;
  const scale = UNIT_MM[unit];
  if (!scale) return null;
  if (firstUnit && secondUnit && firstUnit !== secondUnit) return null;
  const widthMm = Number(first) * scale;
  const heightMm = Number(second) * scale;
  if (!(widthMm > 0) || !(heightMm > 0)) return null;
  return { widthMm, heightMm };
}

export function parseProductPrintSize(raw: string | null | undefined): PrintSize | null {
  return namedPrintSize(raw) ?? measuredPrintSize(raw);
}

/**
 * Checkout measurements are thousandths of the listing unit (`ft`, `mm`, …),
 * not millimetres — 3 ft is stored as 3000 with unit "ft".
 */
function printSizeFromMeasurement(
  measurement: OrderLineMeasurement | null | undefined,
): PrintSize | null {
  if (!measurement?.widthMilli || !measurement.heightMilli) return null;
  const scale = UNIT_MM[String(measurement.unit ?? "").toLowerCase()];
  if (!scale) return null;
  return {
    widthMm: (measurement.widthMilli / 1000) * scale,
    heightMm: (measurement.heightMilli / 1000) * scale,
  };
}

export function resolveProductPrintSize(
  hint: ProductSizeHint | string | null | undefined,
): PrintSize | null {
  if (hint == null) return null;
  if (typeof hint === "string") return parseProductPrintSize(hint);
  return parseProductPrintSize(hint.label) ?? printSizeFromMeasurement(hint.measurement);
}

function printSizeFromDetected(detected: DetectedArtwork | null | undefined): PrintSize | null {
  if (!detected) return null;
  const named = namedPrintSize(detected.pageSize);
  if (named) return named;
  if (detected.widthMilli && detected.heightMilli) {
    return {
      widthMm: detected.widthMilli / 1000,
      heightMm: detected.heightMilli / 1000,
    };
  }
  return null;
}

function printSidesMatch(left: PrintSize, right: PrintSize): boolean {
  if (left.name && right.name && left.name === right.name) return true;
  const a = [left.widthMm, left.heightMm].sort((x, y) => x - y);
  const b = [right.widthMm, right.heightMm].sort((x, y) => x - y);
  return (
    Math.abs(a[0] - b[0]) <= PRINT_SIZE_TOLERANCE_MM &&
    Math.abs(a[1] - b[1]) <= PRINT_SIZE_TOLERANCE_MM
  );
}

/** True when both sides can be measured and the sides are not the same. */
export function artworkSizeMismatchesProduct(
  detected: DetectedArtwork | null | undefined,
  product: ProductSizeHint | string | null | undefined,
): boolean {
  const ordered = resolveProductPrintSize(product);
  const file = printSizeFromDetected(detected);
  if (!ordered || !file) return false;
  return !printSidesMatch(ordered, file);
}

export function artworkSizeMismatchWarning(
  detected: DetectedArtwork | null | undefined,
  product: ProductSizeHint | string | null | undefined,
): string | null {
  return artworkSizeMismatchesProduct(detected, product) ? ARTWORK_SIZE_MISMATCH : null;
}
