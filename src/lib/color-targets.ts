/**
 * Exact colours (gridgo-client#249, contract gridgo-api `docs/EXACT_COLOURS_API.md`).
 *
 * A client can name up to eight colours on an item (a Pantone code, CMYK
 * percentages or a hex value, each with a label) and checkout freezes them on
 * the order line as agreed spec. GRIDGO also reads the colours each uploaded
 * file uses, so the shop and the GRIDGO Team see the two side by side. This
 * module is the only place either becomes words on the portal; the wording is
 * the shop app's (gridgo-supplier `lib/colorTargets.ts`), so a shop reads the
 * same lines on the website and on its phone.
 *
 * Three rules it holds. Pantone is text: GRIDGO ships no Pantone colour data,
 * so a Pantone has a swatch only when the client gave an approximate hex, and
 * nothing here converts a code to a colour. A swatch says what it may claim:
 * a hex is a screen colour, CMYK and a client's Pantone hex are approximate.
 * And a file whose colours could not be read says so in a sentence, never as
 * an empty palette.
 *
 * Every field is read defensively: an older API sends neither list, and an
 * order without colours draws exactly what it drew before.
 */

import type {
  ArtworkColorRecord,
  ArtworkColorsRead,
  CmykValues,
  ColorTargetRecord,
  Order,
  ProductionItem,
} from "@/lib/api/types";
import { itemAttachments } from "@/lib/artwork-attachments";

export type ColorTarget = ColorTargetRecord;
export type ArtworkColor = ArtworkColorRecord;
export type ArtworkColorsEntry = { fileId: string; colors: ArtworkColorsRead | null };

// ---- reading the payload ----

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hexOf(value: unknown): string | null {
  const raw = text(value);
  return raw && /^#[0-9a-f]{6}$/i.test(raw) ? raw.toUpperCase() : null;
}

function numberOf(raw: Record<string, unknown>, key: string): number | null {
  const value = raw[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cmykOf(value: unknown): CmykValues | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const [c, m, y, k] = ["c", "m", "y", "k"].map((key) => numberOf(raw, key));
  return c != null && m != null && y != null && k != null ? { c, m, y, k } : null;
}

function toColorTarget(value: unknown): ColorTarget | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const label = text(raw.label);
  const shown = text(raw.value);
  const format = text(raw.format);
  if (!label || !shown || !format) return null;
  const swatchHex = hexOf(raw.swatchHex);
  return {
    label,
    format,
    value: shown,
    cmyk: cmykOf(raw.cmyk),
    hex: hexOf(raw.hex),
    swatchHex,
    swatchApproximate: swatchHex ? raw.swatchApproximate !== false : null,
  };
}

/** The agreed colours on one item; `[]` on an older API or a line without any. */
export function colorTargetsOf(item: Pick<ProductionItem, "colorTargets">): ColorTarget[] {
  if (!Array.isArray(item.colorTargets)) return [];
  return item.colorTargets
    .map(toColorTarget)
    .filter((target): target is ColorTarget => target !== null);
}

function toArtworkColor(value: unknown): ArtworkColor | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const kind = text(raw.kind);
  if (!kind) return null;
  return {
    kind,
    name: text(raw.name),
    space: text(raw.space),
    cmyk: cmykOf(raw.cmyk),
    hex: hexOf(raw.hex),
    uses: numberOf(raw, "uses"),
    shareBps: numberOf(raw, "shareBps"),
  };
}

function toColorsRead(value: unknown): ArtworkColorsRead | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  return {
    status: text(raw.status) ?? "unknown",
    reasons: Array.isArray(raw.reasons)
      ? raw.reasons.filter((code): code is string => typeof code === "string")
      : [],
    colors: Array.isArray(raw.colors)
      ? raw.colors.map(toArtworkColor).filter((color): color is ArtworkColor => color !== null)
      : [],
  };
}

/** The colours GRIDGO read from each of the item's uploaded files. Design links have no entry. */
export function artworkColorsOf(item: Pick<ProductionItem, "artworkColors">): ArtworkColorsEntry[] {
  if (!Array.isArray(item.artworkColors)) return [];
  const entries: ArtworkColorsEntry[] = [];
  for (const value of item.artworkColors as unknown[]) {
    if (!value || typeof value !== "object") continue;
    const raw = value as Record<string, unknown>;
    const fileId = text(raw.fileId);
    if (fileId && !entries.some((entry) => entry.fileId === fileId)) {
      entries.push({ fileId, colors: toColorsRead(raw.colors) });
    }
  }
  return entries;
}

/** The order's items that carry colours, in line order. */
export function itemsWithColours(
  order: Pick<Order, "productionItems">,
): Array<{ item: ProductionItem; targets: ColorTarget[]; read: ArtworkColorsEntry[] }> {
  return (order.productionItems ?? []).flatMap((item) => {
    const targets = colorTargetsOf(item);
    return targets.length ? [{ item, targets, read: artworkColorsOf(item) }] : [];
  });
}

/** How many colours the client named across the order. */
export function exactColourCount(order: Pick<Order, "productionItems">): number {
  return (order.productionItems ?? []).reduce((sum, item) => sum + colorTargetsOf(item).length, 0);
}

export function exactColourCountLine(count: number): string {
  return count === 1 ? "1 exact colour" : `${count} exact colours`;
}

// ---- what a swatch may claim ----

export type SwatchKind = "exact" | "approximate" | "none";

export function swatchKind(target: Pick<ColorTarget, "swatchHex" | "swatchApproximate">): SwatchKind {
  if (!target.swatchHex) return "none";
  return target.swatchApproximate === false ? "exact" : "approximate";
}

/** The words beside a swatch, so the swatch is never the only thing that says it. */
export function swatchNote(
  target: Pick<ColorTarget, "format" | "swatchHex" | "swatchApproximate">,
): string {
  const kind = swatchKind(target);
  if (kind === "none") return "Pantone code only, no swatch";
  if (kind === "exact") return "Screen colour";
  return target.format === "pantone" ? "Client's approximate swatch" : "Approximate on screen";
}

/** The format strip under a chip, as a swatch book prints it. */
export function swatchStrip(target: Pick<ColorTarget, "format" | "swatchHex" | "swatchApproximate">): string {
  const strip = ({ pantone: "PMS", cmyk: "CMYK", hex: "HEX" } as Record<string, string>)[target.format] ?? "";
  return swatchKind(target) === "approximate" ? `≈ ${strip}` : strip;
}

export type ColourAudience = "shop" | "staff";

/** Said beside the colours on every surface; the shop works from them, the team checks them. */
export function screenPrintNote(audience: ColourAudience): string {
  return audience === "shop"
    ? "Screens and printers show colour differently. Swatches here are a guide on your screen, not a printed match. Work from the codes and values the client named."
    : "Screens and printers show colour differently. Swatches here are a guide on your screen, not a printed match. Check the file against the codes and values the client named.";
}

// ---- the colours GRIDGO read from a file ----

const READ_REASON_COPY: Record<string, string> = {
  not_read_for_this_file_type: "GRIDGO does not read colours from this file type.",
  not_read_at_upload: "This file was uploaded before GRIDGO read colours.",
  embedded_images_not_read: "Pictures placed in the PDF were not read.",
  colour_space_not_read: "Some colours, such as gradients, patterns or Lab colours, were not read.",
  stream_filter_not_supported: "Part of the file is stored in a way GRIDGO does not read.",
  content_not_readable: "GRIDGO could not decode the file's colour data.",
  file_larger_than_inspection_window: "Only the first part of this large file was read.",
  inspection_limit: "GRIDGO stopped reading partway through this large file.",
  more_colours_than_listed: "The file uses more colours than are listed here.",
  no_colours_declared: "The file sets no colours GRIDGO can read.",
  no_opaque_pixels: "The image has no visible pixels.",
  no_dominant_colours: "No colour covers enough of the image to list.",
};

export const UNREAD_HEADLINE = "We could not read the colours in this file";

export type ArtworkColorsView =
  | { kind: "unknown"; headline: string; notes: string[] }
  | { kind: "read"; colors: ArtworkColor[]; notes: string[] };

/** How one file's colour read is drawn. `unknown` is a sentence, never an empty palette. */
export function artworkColorsView(read: ArtworkColorsRead | null | undefined): ArtworkColorsView {
  const reasons = read?.reasons ?? [];
  const notes = reasons
    .map((code) => READ_REASON_COPY[code])
    .filter((line): line is string => Boolean(line));
  const colors = read?.colors ?? [];
  if (!read || read.status === "unknown" || !colors.length) {
    return {
      kind: "unknown",
      headline: UNREAD_HEADLINE,
      notes: notes.length ? notes : ["GRIDGO could not find colours to list in this file."],
    };
  }
  return { kind: "read", colors, notes };
}

export function formatCmyk({ c, m, y, k }: CmykValues): string {
  return `C${c} M${m} Y${y} K${k}`;
}

/** A read colour's own words: the spot name, else its CMYK or hex. */
export function artworkColorLabel(color: ArtworkColor): string {
  if (color.kind === "spot" && color.name) return color.name;
  if (color.space === "cmyk" && color.cmyk) return formatCmyk(color.cmyk);
  return color.hex ?? color.name ?? "Unnamed colour";
}

/** The second line under a read colour: what kind it is, and how much. */
export function artworkColorDetail(color: ArtworkColor): string {
  if (color.kind === "spot") return color.uses === 0 ? "Spot colour, not used" : "Spot colour";
  if (color.kind === "pixels" && color.shareBps != null) {
    const share = color.shareBps / 100;
    return `${share < 1 ? "Under 1" : Math.round(share)}% of the image`;
  }
  if (color.space === "gray") return "Grey";
  if (color.space === "rgb") return "RGB";
  if (color.space === "cmyk") return "CMYK";
  return "Colour";
}

// ---- which file states a target ----

const PANTONE_SUFFIXES = new Set([
  "C", "U", "M", "CP", "UP", "XGC", "TCX", "TPX", "TPG", "TN", "TSX", "HC", "Q",
]);

/**
 * `pms 201c` → `PANTONE 201 C`, the way gridgo-api normalises a code, so a
 * file's spot colour name can be compared with the client's target. Shape
 * only: there is no Pantone list to look a code up in.
 */
export function normalisePantone(value: string): string | null {
  if (value.length > 80) return null;
  let body = value.normalize("NFKC").replace(/[®™]/g, " ").trim().replace(/\s+/g, " ");
  body = body.replace(/^(?:pantone|pms)(?![a-z])\.?\s*/i, "");
  if (!body || body.length > 40 || !/^[A-Za-z0-9][A-Za-z0-9 \-./]*$/.test(body)) return null;
  body = body.replace(/^(\d[\d-]*)([A-Za-z]+)$/, "$1 $2");
  const words = body.split(" ").map((word) => {
    if (PANTONE_SUFFIXES.has(word.toUpperCase())) return word.toUpperCase();
    if (/^[A-Za-z]+$/.test(word)) return word[0].toUpperCase() + word.slice(1).toLowerCase();
    return word.toUpperCase();
  });
  return `PANTONE ${words.join(" ")}`;
}

/**
 * Which files state this exact colour: a spot colour of the same Pantone
 * code, the same CMYK values, or the same screen hex. Exact matches only: a
 * near colour is for a person's eye, and "close enough" here would read as a
 * promise about the print. A file that was not fully read proves nothing
 * either way, so a colour not found is simply not marked.
 */
export function targetFoundIn(
  target: ColorTarget,
  entries: readonly ArtworkColorsEntry[],
): string[] {
  const pantone = target.format === "pantone" ? normalisePantone(target.value) : null;
  return entries
    .filter((entry) =>
      (entry.colors?.colors ?? []).some((color) => {
        if (pantone) {
          return color.kind === "spot" && color.name != null && normalisePantone(color.name) === pantone;
        }
        if (target.format === "cmyk" && target.cmyk && color.cmyk) {
          return (["c", "m", "y", "k"] as const).every((key) => color.cmyk?.[key] === target.cmyk?.[key]);
        }
        if (target.format === "hex" && target.hex && color.space !== "cmyk" && color.kind !== "spot") {
          return color.hex === target.hex;
        }
        return false;
      }),
    )
    .map((entry) => entry.fileId);
}

/**
 * How a file is named beside its colours: the client's own label for it, the
 * name it was uploaded with, else its place among the item's files.
 */
export function colorFileNamer(
  files: readonly { fileId: string; label: string | null }[],
  uploadedName: (fileId: string) => string | null | undefined,
): (fileId: string) => string {
  return (fileId) => {
    const at = files.findIndex((entry) => entry.fileId === fileId);
    const label = at >= 0 ? files[at].label : null;
    return (
      label ||
      uploadedName(fileId)?.trim() ||
      (files.length > 1 && at >= 0 ? `File ${at + 1}` : "The client's file")
    );
  };
}

/** The "In shirt-front.pdf" line under a target, or null when no file states it. */
export function foundLine(fileIds: readonly string[], name: (fileId: string) => string): string | null {
  return fileIds.length ? `In ${fileIds.map(name).join(", ")}` : null;
}

// ---- the comparison table ----

export type ColourCompareRow = {
  item: string;
  ordered: string;
  file: string;
  /** Exact matches only; anything else is for a person's eye, never "Different". */
  match: "Match" | "Check by eye";
  target: ColorTarget;
};

/**
 * One row per agreed colour for the GRIDGO Team's file comparison: the value
 * as ordered, and whether a file states it exactly. A colour no file states
 * is never "Different": a file read in part, or a near colour, proves nothing.
 */
export function colourComparisonRows(
  order: Pick<Order, "productionItems">,
  uploadedName: (fileId: string) => string | null | undefined,
): ColourCompareRow[] {
  const items = itemsWithColours(order);
  const named = (order.productionItems ?? []).length > 1;
  return items.flatMap(({ item, targets, read }) => {
    const name = colorFileNamer(fileLabels(item), uploadedName);
    const anyRead = read.some((entry) => artworkColorsView(entry.colors).kind === "read");
    return targets.map((target) => {
      const found = targetFoundIn(target, read);
      return {
        item: named ? `Colour: ${target.label}, ${item.itemName}` : `Colour: ${target.label}`,
        ordered: target.value,
        file: found.length
          ? (foundLine(found, name) as string)
          : !read.length
            ? "No uploaded file to read"
            : anyRead
              ? "Not stated exactly in the file"
              : "Colours not read from the file",
        match: found.length ? "Match" : "Check by eye",
        target,
      };
    });
  });
}

/** The item's uploaded files with the client's labels, in the client's order. */
export function fileLabels(item: ProductionItem): { fileId: string; label: string | null }[] {
  return itemAttachments(item).flatMap((entry) =>
    entry.kind === "file" ? [{ fileId: entry.fileId, label: entry.label }] : [],
  );
}
