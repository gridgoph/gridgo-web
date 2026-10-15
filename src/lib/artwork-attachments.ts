/**
 * Several files and design links on one item (report C6625C57; contract
 * "Multiple artwork attachments" in `gridgo-api/docs/ORDER_MATCH_API.md`).
 *
 * A line's `artworkAttachments` is the client's own list: up to ten files and
 * links together, in the order the client put them, each with an optional
 * label ("Front", "Back", "Logo PDF"). The screens rest on three rules, the
 * same ones the shop app follows:
 *
 * - **The order is the client's.** Entries are drawn as they come; nothing
 *   here sorts files ahead of links.
 * - **The first file is the main file.** It is `artworkFileId`, the one GRIDGO
 *   counts pages from, so whoever prints is told which one it is.
 * - **An older order still reads.** A line without the array is its single
 *   file first, then its links: the same projection the API makes.
 */

import type {
  Order,
  OrderLineMeasurement,
  ProductionItem,
  StoredFile,
} from "@/lib/api/types";
import { formatFileBytes, type EvidenceItem } from "@/lib/evidence";
import { providerOf, safeLinkHref, type OrderDesignLink } from "@/lib/design-links";

export type AttachmentFile = {
  kind: "file";
  fileId: string;
  label: string | null;
  /** The first file on the line. */
  main: boolean;
  /** A signed link that came with the order, so a preview draws without asking. */
  downloadUrl?: string;
  downloadUrlExpiresAt?: string;
};

export type AttachmentLink = {
  kind: "link";
  link: OrderDesignLink;
  label: string | null;
};

export type AttachmentEntry = AttachmentFile | AttachmentLink;

export type AttachmentGroup = {
  itemId: string;
  itemName: string;
  entries: AttachmentEntry[];
  /** The line's ordered size, for the main file's print-size check. */
  productSize: string | null;
  productMeasurement: OrderLineMeasurement | null;
};

function cleanLabel(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function rawEntries(item: ProductionItem): unknown[] {
  if (Array.isArray(item.artworkAttachments)) return item.artworkAttachments;
  return [
    ...(item.artworkFileId ? [{ kind: "file", fileId: item.artworkFileId }] : []),
    ...(Array.isArray(item.artworkLinks)
      ? item.artworkLinks.map((link) => ({ ...link, kind: "link" }))
      : []),
  ];
}

/** One line's files and links, in the client's order, each file and address once. */
export function itemAttachments(item: ProductionItem): AttachmentEntry[] {
  const entries: AttachmentEntry[] = [];
  const seen = new Set<string>();
  let mainFound = false;
  for (const raw of rawEntries(item)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const label = cleanLabel(entry.label);
    if (entry.kind === "file") {
      const fileId = typeof entry.fileId === "string" ? entry.fileId.trim() : "";
      if (!fileId || seen.has(`file:${fileId}`)) continue;
      seen.add(`file:${fileId}`);
      entries.push({
        kind: "file",
        fileId,
        label,
        main: !mainFound,
        ...(typeof entry.downloadUrl === "string" ? { downloadUrl: entry.downloadUrl } : {}),
        ...(typeof entry.downloadUrlExpiresAt === "string"
          ? { downloadUrlExpiresAt: entry.downloadUrlExpiresAt }
          : {}),
      });
      mainFound = true;
    } else if (entry.kind === "link") {
      const url = typeof entry.url === "string" ? entry.url.trim() : "";
      if (!url || seen.has(`link:${url}`)) continue;
      seen.add(`link:${url}`);
      entries.push({
        kind: "link",
        label,
        link: {
          formatCode: typeof entry.formatCode === "string" ? entry.formatCode : "other_link",
          url,
          label,
          key: `${item.id}:${url}`,
          provider: providerOf(url),
          lineName: null,
        },
      });
    }
  }
  return entries;
}

/** Each line that has artwork, in the order's line order. */
export function attachmentGroups(
  order: Pick<Order, "productionItems"> & Partial<Pick<Order, "size">>,
): AttachmentGroup[] {
  return (order.productionItems ?? [])
    .map((item) => {
      const size = item.structuredSpec?.size;
      return {
        itemId: item.id,
        itemName: item.itemName?.trim() || "Item",
        entries: itemAttachments(item),
        productSize: (typeof size === "string" && size.trim() ? size : null) || order.size || null,
        productMeasurement: item.measurement ?? null,
      };
    })
    .filter((group) => group.entries.length > 0);
}

/**
 * Whether the order needs the attachment list rather than the file plates it
 * always had: a line with more than one entry, or a label worth reading. An
 * older order with one file per line keeps the screen it always had.
 */
export function showsAttachmentList(order: Pick<Order, "productionItems">): boolean {
  return attachmentGroups(order).some(
    (group) => group.entries.length > 1 || group.entries.some((entry) => entry.label),
  );
}

/** "3 files · 1 design link" for one line, or for the whole order. */
export function attachmentCountLine(entries: AttachmentEntry[]): string {
  const files = entries.filter((entry) => entry.kind === "file").length;
  const links = entries.length - files;
  return [
    files ? `${files} ${files === 1 ? "file" : "files"}` : null,
    links ? `${links} ${links === 1 ? "design link" : "design links"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The artwork QA tick when an item carries several entries: the GRIDGO Team
 * passes the order only after checking all of them (there is no verdict per
 * attachment in the API).
 */
export const ATTACHMENTS_QA_CHECK_LABEL =
  "Every file and design link opens, and the files to print from are high enough resolution";

/** Every entry on the order, every line together. */
export function allAttachments(order: Pick<Order, "productionItems">): AttachmentEntry[] {
  return attachmentGroups(order).flatMap((group) => group.entries);
}

/** Whether a link is one that may be opened (HTTPS only, as everywhere a link is drawn). */
export function attachmentLinkHref(entry: AttachmentLink): string | null {
  return safeLinkHref(entry.link.url);
}

/**
 * The signed link that came with the order, while it still has a moment to
 * run. Anything close to expiry is treated as gone so a preview never draws
 * from a link that dies mid-load.
 */
export function freshOrderLink(entry: AttachmentFile, nowMs = Date.now()): string | null {
  if (!entry.downloadUrl) return null;
  const expires = entry.downloadUrlExpiresAt ? Date.parse(entry.downloadUrlExpiresAt) : NaN;
  if (!Number.isFinite(expires) || expires - nowMs < 30_000) return null;
  return entry.downloadUrl;
}

const TYPE_NAMES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/jpg": "JPEG",
  "image/webp": "WebP",
  "image/gif": "GIF",
  "image/heic": "HEIC",
  "image/heif": "HEIF",
  "image/svg+xml": "SVG",
  "image/tiff": "TIFF",
  "application/postscript": "AI",
  "application/illustrator": "AI",
  "image/vnd.adobe.photoshop": "PSD",
  "application/zip": "ZIP",
};

/** "PDF", "PNG": the type a printer would call the file, by its contents first. */
export function fileTypeName(
  file: Pick<StoredFile, "detectedContentType" | "declaredContentType" | "originalFilename">,
): string {
  for (const raw of [file.detectedContentType, file.declaredContentType]) {
    const type = (raw ?? "").split(";")[0].trim().toLowerCase();
    if (TYPE_NAMES[type]) return TYPE_NAMES[type];
  }
  const ext = /\.([a-z0-9]{1,5})$/i.exec(file.originalFilename ?? "")?.[1];
  return ext ? ext.toUpperCase() : "File";
}

/** "PDF · 777 KB" under a file's name. */
export function describeAttachmentFile(
  file: Pick<
    StoredFile,
    "detectedContentType" | "declaredContentType" | "originalFilename" | "size"
  >,
): string {
  const parts = [fileTypeName(file)];
  if (typeof file.size === "number") parts.push(formatFileBytes(file.size));
  return parts.join(" · ");
}

/** A file the browser can show inline: a picture, or a PDF in a frame. */
export function previewKind(
  file: Pick<StoredFile, "detectedContentType" | "declaredContentType" | "originalFilename">,
): "image" | "pdf" | "none" {
  const name = fileTypeName(file);
  if (name === "PDF") return "pdf";
  if (["PNG", "JPEG", "JPG", "WebP", "WEBP", "GIF", "SVG"].includes(name)) return "image";
  return "none";
}

/** What to call a file in words: its label, else its name, else its place. */
export function attachmentTitle(
  entry: AttachmentFile,
  file: Pick<StoredFile, "originalFilename"> | null,
): string {
  return entry.label ?? file?.originalFilename ?? (entry.main ? "Main file" : "File");
}

/**
 * Every file on the shop's own lines as download choices, named by its label
 * and item ("Front · Printed T-shirt"); an unlabelled one is "Artwork". Only
 * the lines are read, never the order-wide ids, which on a two-shop order
 * carry the other shop's files too.
 */
export function attachmentFileEvidence(
  order: Pick<Order, "productionItems"> & Partial<Pick<Order, "size">>,
): EvidenceItem[] {
  const seen = new Set<string>();
  const out: EvidenceItem[] = [];
  for (const group of attachmentGroups(order)) {
    const files = group.entries.filter((entry): entry is AttachmentFile => entry.kind === "file");
    const unlabelled = files.filter((entry) => !entry.label).length;
    let n = 0;
    for (const entry of files) {
      if (seen.has(entry.fileId)) continue;
      seen.add(entry.fileId);
      const base = entry.label ?? (unlabelled > 1 ? `Artwork ${++n}` : "Artwork");
      out.push({
        fileId: entry.fileId,
        kind: "artwork",
        label: `${base} · ${group.itemName}`,
        productSize: group.productSize,
        productMeasurement: group.productMeasurement,
      });
    }
  }
  return out;
}
