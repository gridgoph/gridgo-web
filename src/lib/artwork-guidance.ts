/**
 * Artwork guidance (gridgo-client#242; contract gridgo-api
 * docs/ARTWORK_GUIDANCE_API.md).
 *
 * Two halves. Super Admin sets each product type's recommended resolution and
 * colour in `settings.artworkGuidance`; a product type without its own entry
 * uses the default. At checkout the API freezes, per order line, what each
 * uploaded file measured against that target and whether the client accepted
 * each warning. Nothing here blocks: a soft or RGB file is the client's call,
 * and the stored acceptance is the evidence the GRIDGO Team reads at the
 * quality check and when a claim comes in later.
 */

import type {
  ArtworkGuidanceRecord,
  ArtworkGuidanceSettings,
  ArtworkGuidanceTarget,
  ArtworkGuidanceWarning,
  Order,
  ProductionItem,
  Taxonomy,
} from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";

/** The API's bounds for `minimumDpi` (`400 invalid_artwork_guidance`). */
export const ARTWORK_DPI_MIN = 50;
export const ARTWORK_DPI_MAX = 1200;

// ---- Settings ----

export type GuidanceRow = {
  code: string;
  name: string;
  /** Retired in the catalogue; an entry it still has keeps applying to old listings. */
  retired: boolean;
};

export type GuidanceGroup = { code: string; name: string; rows: GuidanceRow[] };

/**
 * Every product type, grouped and named as the catalogue names them, in the
 * catalogue's order. Retired product types are listed only while they still
 * carry their own entry, so nothing stored is hidden. A stored code the
 * taxonomy no longer knows (the API refuses new ones) goes last under its code.
 */
export function guidanceGroups(
  taxonomy: Pick<Taxonomy, "categories" | "subcategories"> | null,
  stored: ArtworkGuidanceSettings | null | undefined,
): GuidanceGroup[] {
  const own = stored?.subcategories ?? {};
  const bySort = <T extends { sortOrder?: number; name: string }>(a: T, b: T) =>
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);
  const subcategories = (taxonomy?.subcategories ?? []).filter(
    (row) => row.active || Object.hasOwn(own, row.code),
  );
  const seen = new Set<string>();
  const groups: GuidanceGroup[] = [];
  for (const category of [...(taxonomy?.categories ?? [])].sort(bySort)) {
    const rows = subcategories
      .filter((row) => row.categoryCode === category.code)
      .sort(bySort)
      .map((row) => {
        seen.add(row.code);
        return { code: row.code, name: row.name, retired: !row.active };
      });
    if (rows.length) groups.push({ code: category.code, name: category.name, rows });
  }
  const orphans = subcategories
    .filter((row) => !seen.has(row.code))
    .map((row) => ({ code: row.code, name: row.name, retired: !row.active }));
  for (const code of Object.keys(own)) {
    if (!seen.has(code) && !orphans.some((row) => row.code === code)) {
      orphans.push({ code, name: code, retired: true });
    }
  }
  if (orphans.length) {
    groups.push({ code: "_other", name: "Other product types", rows: orphans });
  }
  return groups;
}

/** A target as typed: the number stays a string until it is saved. */
export type TargetDraft = { check: boolean; dpi: string; acceptsRgb: boolean };

/**
 * The whole editor. `own[code]` is the product type's own target; a code that
 * is absent uses the default, exactly as the API resolves it.
 */
export type GuidanceDraft = { base: TargetDraft; own: Record<string, TargetDraft> };

export function targetDraft(target: ArtworkGuidanceTarget): TargetDraft {
  return {
    check: target.minimumDpi !== null,
    dpi: target.minimumDpi === null ? "" : String(target.minimumDpi),
    acceptsRgb: target.acceptsRgb,
  };
}

export function guidanceDraft(stored: ArtworkGuidanceSettings): GuidanceDraft {
  return {
    base: targetDraft(stored.default),
    own: Object.fromEntries(
      Object.entries(stored.subcategories).map(([code, target]) => [code, targetDraft(target)]),
    ),
  };
}

export const DPI_INVALID = `Use a whole number from ${ARTWORK_DPI_MIN} to ${ARTWORK_DPI_MAX}, or turn the resolution check off.`;

/** The saved target, or null when the number is not one the API takes. */
export function parseTarget(draft: TargetDraft): ArtworkGuidanceTarget | null {
  if (!draft.check) return { minimumDpi: null, acceptsRgb: draft.acceptsRgb };
  const text = draft.dpi.trim();
  if (!/^\d+$/.test(text)) return null;
  const dpi = Number(text);
  if (dpi < ARTWORK_DPI_MIN || dpi > ARTWORK_DPI_MAX) return null;
  return { minimumDpi: dpi, acceptsRgb: draft.acceptsRgb };
}

/**
 * The complete value to send (the API replaces it whole), or the keys whose
 * number is out of range: `default` or a product type code.
 */
export function parseGuidanceDraft(
  draft: GuidanceDraft,
): { value: ArtworkGuidanceSettings; invalid: [] } | { value: null; invalid: string[] } {
  const invalid: string[] = [];
  const base = parseTarget(draft.base);
  if (!base) invalid.push("default");
  const subcategories: Record<string, ArtworkGuidanceTarget> = {};
  for (const [code, row] of Object.entries(draft.own)) {
    const target = parseTarget(row);
    if (target) subcategories[code] = target;
    else invalid.push(code);
  }
  if (!base || invalid.length) return { value: null, invalid };
  return { value: { version: 1, default: base, subcategories }, invalid: [] };
}

function sameTarget(a: ArtworkGuidanceTarget | undefined, b: ArtworkGuidanceTarget | undefined) {
  if (!a || !b) return a === b;
  return a.minimumDpi === b.minimumDpi && a.acceptsRgb === b.acceptsRgb;
}

/** "300 DPI, expects CMYK" — one target in words. */
export function targetLine(target: ArtworkGuidanceTarget): string {
  const resolution =
    target.minimumDpi === null ? "No resolution check" : `${target.minimumDpi} DPI`;
  return `${resolution}, ${target.acceptsRgb ? "RGB accepted" : "expects CMYK"}`;
}

/**
 * What a save changes, one line per entry, for the confirmation and the
 * audited reason. Empty when nothing changed.
 */
export function guidanceChanges(
  stored: ArtworkGuidanceSettings,
  next: ArtworkGuidanceSettings,
  nameOf: (code: string) => string,
): string[] {
  const lines: string[] = [];
  if (!sameTarget(stored.default, next.default)) {
    lines.push(`Default: ${targetLine(stored.default)} to ${targetLine(next.default)}`);
  }
  const codes = new Set([...Object.keys(stored.subcategories), ...Object.keys(next.subcategories)]);
  for (const code of codes) {
    const before = stored.subcategories[code];
    const after = next.subcategories[code];
    if (sameTarget(before, after)) continue;
    const from = before ? targetLine(before) : `default (${targetLine(stored.default)})`;
    const to = after ? targetLine(after) : `default (${targetLine(next.default)})`;
    lines.push(`${nameOf(code)}: ${from} to ${to}`);
  }
  return lines;
}

/** The audited reason: every change, kept inside the API's text limit. */
export function guidanceReason(changes: string[]): string {
  const reason = `Artwork guidance. ${changes.join("; ")}.`;
  return reason.length <= 1900 ? reason : `${reason.slice(0, 1890).trimEnd()}… (more)`;
}

// ---- The order line's record ----

const MM_PER_INCH = 25.4;
const MM_PER_FOOT = 304.8;

function trimNumber(value: number, digits: number): string {
  return String(Number(value.toFixed(digits)));
}

/**
 * The ordered size in the unit a person would say it in: feet for large
 * format, millimetres with inches beside them for paper.
 */
export function orderedSizeLabel(
  size: ArtworkGuidanceRecord["orderedSize"] | null | undefined,
): string | null {
  if (!size || !(size.widthMilli > 0) || !(size.heightMilli > 0)) return null;
  const w = size.widthMilli / 1000;
  const h = size.heightMilli / 1000;
  const mm = `${Math.round(w)} × ${Math.round(h)} mm`;
  if (Math.max(w, h) >= 600) {
    return `${trimNumber(w / MM_PER_FOOT, 1)} × ${trimNumber(h / MM_PER_FOOT, 1)} ft (${mm})`;
  }
  return `${mm} (${trimNumber(w / MM_PER_INCH, 1)} × ${trimNumber(h / MM_PER_INCH, 1)} in)`;
}

const COLOR_MODE_WORDS: Record<string, string> = {
  rgb: "RGB",
  cmyk: "CMYK",
  grayscale: "Greyscale",
  mixed: "RGB and CMYK mixed",
};

export function colorModeLabel(mode: string | null | undefined): string {
  if (!mode) return "Not stated in the file";
  return COLOR_MODE_WORDS[mode] ?? mode;
}

export function warningTitle(warning: ArtworkGuidanceWarning): string {
  return warning.code === "low_resolution" ? "Low resolution" : "Colour mode";
}

/** The figures the client was shown, in words. */
export function warningLine(warning: ArtworkGuidanceWarning): string {
  if (warning.code === "low_resolution") {
    return `Prints at ${warning.effectiveDpi} DPI at the ordered size; the target is ${warning.minimumDpi} DPI.`;
  }
  return `The file is ${colorModeLabel(warning.colorMode)}; this product type expects ${colorModeLabel(warning.expectedColorMode)}.`;
}

export function acceptanceLine(warning: Pick<ArtworkGuidanceWarning, "acceptedAt">): string {
  return warning.acceptedAt
    ? `Client accepted on ${formatDateTime(warning.acceptedAt)}`
    : "Not accepted by the client";
}

/** How far a file's resolution reaches toward the target, 0–1, for the gauge. */
export function dpiReach(effectiveDpi: number | null, minimumDpi: number | null): number | null {
  if (effectiveDpi === null || minimumDpi === null || minimumDpi <= 0) return null;
  return Math.max(0, Math.min(1, effectiveDpi / minimumDpi));
}

export type GuidanceCounts = { warnings: number; accepted: number; open: number };

export function recordCounts(record: ArtworkGuidanceRecord): GuidanceCounts {
  let warnings = 0;
  let accepted = 0;
  for (const file of record.files) {
    for (const warning of file.warnings) {
      warnings += 1;
      if (warning.acceptedAt) accepted += 1;
    }
  }
  return { warnings, accepted, open: warnings - accepted };
}

/** The order lines that carry a record, with the line they belong to. */
export function guidanceItems(
  order: Pick<Order, "productionItems">,
): Array<{ item: ProductionItem; record: ArtworkGuidanceRecord }> {
  return (order.productionItems ?? []).flatMap((item) =>
    item.artworkGuidance ? [{ item, record: item.artworkGuidance }] : [],
  );
}

/** Every warning on the order, for a queue row. Null when no line has a record. */
export function orderGuidanceCounts(order: Pick<Order, "productionItems">): GuidanceCounts | null {
  const items = guidanceItems(order);
  if (!items.length) return null;
  return items.reduce<GuidanceCounts>(
    (sum, { record }) => {
      const counts = recordCounts(record);
      return {
        warnings: sum.warnings + counts.warnings,
        accepted: sum.accepted + counts.accepted,
        open: sum.open + counts.open,
      };
    },
    { warnings: 0, accepted: 0, open: 0 },
  );
}

/** "2 artwork warnings, 1 accepted by the client" — the queue row's line. */
export function countsLine(counts: GuidanceCounts): string {
  if (!counts.warnings) return "Artwork meets its targets";
  const noun = counts.warnings === 1 ? "artwork warning" : "artwork warnings";
  if (counts.open === 0) {
    return `${counts.warnings} ${noun}, ${counts.warnings === 1 ? "accepted" : "all accepted"} by the client`;
  }
  if (counts.accepted === 0) {
    return `${counts.warnings} ${noun}, not accepted by the client`;
  }
  return `${counts.warnings} ${noun}, ${counts.accepted} accepted by the client`;
}
