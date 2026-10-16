/**
 * Featured Prints: the products GRIDGO puts on the client's Home row
 * (gridgo-client#239). Contract: gridgo-api docs/FEATURED_PRINTS_API.md.
 *
 * A card is anonymous on purpose. It carries the product, GRIDGO's starting
 * price and one sample photo, and nothing that names the shop. This setting
 * draws only those fields, even though staff could read more elsewhere.
 */

import { isApiError } from "@/lib/api/client";
import { formatPhp } from "@/lib/format";

/** The API holds at most 20 products in the row. */
export const FEATURED_PRINTS_MAX = 20;

/** The save reason is required, 1 to 2,000 characters once trimmed. */
export const FEATURED_PRINTS_REASON_MAX = 2000;

/** The client's heading and the line under it (contract "Follow-up acceptance"). */
export const FEATURED_PRINTS_TITLE = "FEATURED PRINTS";
export const FEATURED_PRINTS_GREETING = "Choose what you need and GRIDGO finds the printer.";

/** What an empty row shows the client, when the API does not say. */
export const FEATURED_PRINTS_EMPTY_MESSAGE = "Explore print products to start your first print.";

export type FeaturedPhoto = {
  fileId: string;
  /** Signed image link. Absent while signing is unavailable: draw a placeholder. */
  downloadUrl: string | null;
  downloadUrlExpiresAt: string | null;
};

/** The anonymous Home card, the same allowlist the client reads. */
export type FeaturedCard = {
  id: string;
  name: string;
  subcategoryCode: string | null;
  clientFromPriceMinor: number;
  pricingUnit: string;
  packageQty: number | null;
  measureUnit: string | null;
  photo: FeaturedPhoto | null;
};

/**
 * One position in the row. `card` is null when the product is not available
 * now (hidden, taken down, shop closed, no approved sample); the ID stays so
 * staff can see and remove it.
 */
export type FeaturedEntry = {
  catalogItemId: string;
  card: FeaturedCard | null;
};

export type FeaturedPrints = {
  version: number;
  entries: FeaturedEntry[];
};

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function readPhoto(value: unknown): FeaturedPhoto | null {
  if (!Array.isArray(value)) return null;
  const sorted = value
    .filter(isRecord)
    .slice()
    .sort((a, b) => (int(a.sortOrder) ?? 0) - (int(b.sortOrder) ?? 0));
  const first = sorted[0];
  const fileId = first ? str(first.fileId) : null;
  if (!first || !fileId) return null;
  return {
    fileId,
    downloadUrl: str(first.downloadUrl),
    downloadUrlExpiresAt: str(first.downloadUrlExpiresAt),
  };
}

/**
 * Reads a card from the Featured Prints response or from the approved catalogue
 * item (`GET /ops/catalog/items/:id`, `{ item }`). Only the allowlisted fields
 * are kept, so a shop name or a shop's own price never reaches the screen.
 * A product without GRIDGO's starting price cannot be featured, so it reads null.
 */
export function readFeaturedCard(body: unknown): FeaturedCard | null {
  const raw = isRecord(body) && isRecord(body.item) ? body.item : body;
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const name = str(raw.name);
  const price = int(raw.clientFromPriceMinor);
  if (!id || !name || price == null) return null;
  return {
    id,
    name,
    subcategoryCode: str(raw.subcategoryCode),
    clientFromPriceMinor: price,
    pricingUnit: str(raw.pricingUnit) ?? "per_unit",
    packageQty: int(raw.packageQty),
    measureUnit: str(raw.measureUnit),
    photo: readPhoto(raw.photos),
  };
}

/** `GET`/`PUT /admin/featured-prints`. A missing setting is version 1, empty. */
export function normalizeFeaturedPrints(body: unknown): FeaturedPrints {
  const raw = isRecord(body) ? body : {};
  const version = int(raw.version);
  const rows = Array.isArray(raw.items) ? raw.items.filter(isRecord) : [];
  const byId = new Map<string, FeaturedEntry>();
  for (const row of rows) {
    const catalogItemId = str(row.catalogItemId);
    if (!catalogItemId) continue;
    byId.set(catalogItemId, {
      catalogItemId,
      card: row.available === false ? null : readFeaturedCard(row.item),
    });
  }
  // `catalogItemIds` is the stored order; `items` follows it, but an ID the
  // rows left out still has to show so it can be removed.
  const ids = Array.isArray(raw.catalogItemIds)
    ? raw.catalogItemIds.flatMap((value) => (str(value) ? [str(value) as string] : []))
    : [...byId.keys()];
  return {
    version: version != null && version >= 1 ? version : 1,
    entries: ids.map((catalogItemId) => byId.get(catalogItemId) ?? { catalogItemId, card: null }),
  };
}

/** The client's unit words, mirroring gridgo-client `lib/listing.ts` `unitLine`. */
const UNIT_WORDS: Record<string, { one: string; square: string }> = {
  mm: { one: "mm", square: "sq mm" },
  cm: { one: "cm", square: "sq cm" },
  in: { one: "inch", square: "sq in" },
  ft: { one: "foot", square: "sq ft" },
  m: { one: "metre", square: "sq m" },
};

export function clientUnitLine(
  card: Pick<FeaturedCard, "pricingUnit" | "packageQty" | "measureUnit">,
): string {
  const words = card.measureUnit ? UNIT_WORDS[card.measureUnit] : undefined;
  switch (card.pricingUnit) {
    case "per_package":
      return card.packageQty ? `per pack of ${card.packageQty}` : "per pack";
    case "per_page":
      return "per page";
    case "per_area":
      return `per ${words?.square || "square"}`;
    case "per_length":
      return `per ${words?.one || "length"}`;
    case "whole_job":
      return "for the job";
    default:
      return "each";
  }
}

/** "From ₱11.00", GRIDGO's figure with its service fee already in it. */
export function clientPriceLine(card: Pick<FeaturedCard, "clientFromPriceMinor">): string {
  return `From ${formatPhp(card.clientFromPriceMinor)}`;
}

export function idsOf(entries: readonly FeaturedEntry[]): string[] {
  return entries.map((entry) => entry.catalogItemId);
}

export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Moves one entry by `by` places, clamped to the row. */
export function moveEntry<T>(list: readonly T[], from: number, by: number): T[] {
  const to = Math.min(list.length - 1, Math.max(0, from + by));
  if (from < 0 || from >= list.length || to === from) return [...list];
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Why Save is not pressable yet, or null. */
export function saveBlocker(input: {
  entries: readonly FeaturedEntry[];
  unavailableIds: ReadonlySet<string>;
  reason: string;
}): string | null {
  const blocked = input.entries.filter(
    (entry) => !entry.card || input.unavailableIds.has(entry.catalogItemId),
  ).length;
  if (blocked === 1) return "Remove the product that is no longer available before saving.";
  if (blocked > 1) return `Remove the ${blocked} products that are no longer available before saving.`;
  if (input.entries.length > FEATURED_PRINTS_MAX) {
    return `Home shows at most ${FEATURED_PRINTS_MAX} products.`;
  }
  const reason = input.reason.trim();
  if (!reason) return "Say why you are changing Featured Prints.";
  if (reason.length > FEATURED_PRINTS_REASON_MAX) {
    return `Keep the reason to ${FEATURED_PRINTS_REASON_MAX.toLocaleString("en-PH")} characters.`;
  }
  return null;
}

/** IDs the API refused on save (`409 featured_prints_item_unavailable`). */
export function unavailableIdsFrom(err: unknown): string[] {
  if (!isApiError(err) || err.code !== "featured_prints_item_unavailable") return [];
  const ids = err.detail<unknown>("catalogItemIds");
  return Array.isArray(ids) ? ids.filter((value): value is string => typeof value === "string") : [];
}

/** Plain recovery copy for a failed save or read. */
export function featuredPrintsErrorMessage(err: unknown, fallback: string): string {
  if (!isApiError(err)) return fallback;
  switch (err.code) {
    case "featured_prints_version_conflict":
      return "Someone else saved Featured Prints after you opened it.";
    case "featured_prints_version_required":
      return "Featured Prints did not load properly. Reload the page and try again.";
    case "featured_prints_item_unavailable":
      return "Some products can no longer be featured. They are marked below; remove them and save again.";
    case "invalid_featured_prints":
      return `Choose up to ${FEATURED_PRINTS_MAX} different products.`;
    case "featured_prints_reason_required":
      return `Say why you are changing Featured Prints, in up to ${FEATURED_PRINTS_REASON_MAX.toLocaleString("en-PH")} characters.`;
    default:
      break;
  }
  switch (err.kind) {
    case "unauthorized":
      return "Your session expired. Sign in again.";
    case "forbidden":
      return "Only Operations and Super Admin can change Featured Prints.";
    case "server":
      return "GRIDGO could not finish that just now. Try again in a moment.";
    default:
      return fallback;
  }
}

/**
 * A few of the approved listing's spec choices ("A5, A4, Matte"), so two
 * products with the same name can be told apart without naming their shops.
 */
export function approvedSpecLine(body: unknown, limit = 4): string | null {
  const raw = isRecord(body) && isRecord(body.item) ? body.item : body;
  if (!isRecord(raw) || !Array.isArray(raw.optionGroups ?? raw.groups)) return null;
  const groups = (raw.optionGroups ?? raw.groups) as unknown[];
  const labels = groups
    .filter(isRecord)
    .filter((group) => (str(group.kind) ?? "spec") === "spec")
    .flatMap((group) =>
      Array.isArray(group.options)
        ? group.options.filter(isRecord).flatMap((option) => (str(option.label) ? [str(option.label) as string] : []))
        : [],
    );
  if (!labels.length) return null;
  const shown = labels.slice(0, limit).join(", ");
  return labels.length > limit ? `${shown} and ${labels.length - limit} more` : shown;
}
