/**
 * File ids Operations should be able to look at on an order.
 * Artwork and mockup come from checkout lines; payment proof lives on each
 * installment (including live API `initial` / `final_online` keys).
 */

import type { DetectedArtwork, Order, StoredFile } from "@/lib/api/types";
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

export function artworkEvidence(
  order: Pick<Order, "artworkFileIds" | "artworkName">,
): EvidenceItem[] {
  return uniqueIds(order.artworkFileIds).map((fileId, index, all) => ({
    fileId,
    kind: "artwork",
    label: all.length > 1 ? `Artwork ${index + 1}` : "Artwork",
    caption: index === all.length - 1 ? order.artworkName : null,
  }));
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
        label: `${presentInstallment(code)} proof`,
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
