/**
 * Super Admin view of every shop's listings.
 *
 * Status on a row is the shop's own `active` flag (`onTheBoard`). Listing
 * approval is not on the API yet, and this module does not invent one.
 */

import { formatDateTime, pesosToMinor } from "@/lib/format";
import { normalizeListing, priceLine, specs, type Listing } from "@/lib/listings";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

export type StaffShop = {
  supplierId: string;
  shopName: string | null;
};

export type StaffCatalogRow = {
  shop: StaffShop;
  listing: Listing;
};

export type StaffCatalogPage = {
  rows: StaffCatalogRow[];
  shops: StaffShop[];
  total: number;
  nextCursor: string | null;
};

export type StaffCatalogFilters = {
  q: string;
  subcategoryCode: string;
  supplierId: string;
  minPesos: string;
  maxPesos: string;
};

export type StaffCatalogRequest = {
  q?: string;
  subcategoryCode?: string;
  supplierId?: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  cursor?: string;
  limit?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readStaffShop(value: unknown): StaffShop | null {
  if (!isRecord(value)) return null;
  const supplierId = typeof value.supplierId === "string" ? value.supplierId.trim() : "";
  if (!supplierId) return null;
  const name = typeof value.shopName === "string" ? value.shopName.trim() : "";
  return { supplierId, shopName: name || null };
}

function readRow(value: unknown): StaffCatalogRow | null {
  if (!isRecord(value)) return null;
  const shop = readStaffShop(value.shop);
  const listing = normalizeListing(value.item);
  if (!shop || !listing) return null;
  return { shop, listing };
}

export function normalizeStaffCatalogPage(body: unknown): StaffCatalogPage {
  const raw = isRecord(body) ? body : {};
  const rows = Array.isArray(raw.items)
    ? raw.items.flatMap((entry) => {
        const row = readRow(entry);
        return row ? [row] : [];
      })
    : [];
  const shops = Array.isArray(raw.shops)
    ? raw.shops.flatMap((entry) => {
        const shop = readStaffShop(entry);
        return shop ? [shop] : [];
      })
    : [];
  return {
    rows,
    shops,
    total:
      typeof raw.total === "number" && Number.isFinite(raw.total)
        ? raw.total
        : rows.length,
    nextCursor:
      typeof raw.nextCursor === "string" && raw.nextCursor ? raw.nextCursor : null,
  };
}

export function normalizeStaffCatalogDetail(body: unknown): StaffCatalogRow | null {
  return readRow(body);
}

/** The name the shop published. Falls back to the supplier id when the profile has none. */
export function shopLabel(shop: StaffShop): string {
  return shop.shopName || shop.supplierId;
}

export type ListingBoardState = {
  label: "Taken down" | "On the board" | "Off the board";
  tone: StatusTone;
  icon: StatusIconName;
};

/**
 * Taken down is the Super Admin take-down (`suspendReason`); the shop reads it
 * as "Taken down by GRIDGO". On / off the board is the shop's own `active`
 * switch, which a restore leaves off until the shop turns it back on.
 */
export function listingBoardState(
  listing: Pick<Listing, "onTheBoard" | "suspendReason">,
): ListingBoardState {
  if (listing.suspendReason) {
    return { label: "Taken down", tone: "warning", icon: "triangle-alert" };
  }
  if (listing.onTheBoard) {
    return { label: "On the board", tone: "success", icon: "circle-check" };
  }
  return { label: "Off the board", tone: "neutral", icon: "circle-dashed" };
}

/** The API caps a take-down reason at 2,000 characters. */
export const TAKE_DOWN_REASON_MAX = 2000;

/** "Taken down 4 Oct 2026, 3:12 PM", or plain "Taken down" on an API without the time. */
export function takenDownLine(listing: Pick<Listing, "suspendedAt">): string {
  return listing.suspendedAt
    ? `Taken down ${formatDateTime(listing.suspendedAt)}`
    : "Taken down";
}

/**
 * The total the API counted for these filters, and how many are loaded:
 * "40 listings", "3 listings match", "Showing 50 of 120 listings".
 */
export function listingCountLine(
  shown: number,
  total: number,
  filtered: boolean,
): string {
  const noun = total === 1 ? "listing" : "listings";
  if (shown < total) {
    return `Showing ${shown} of ${total} ${noun}${filtered ? " that match" : ""}`;
  }
  if (!filtered) return `${total} ${noun}`;
  return `${total} ${noun} ${total === 1 ? "matches" : "match"}`;
}

export function specSummary(listing: Listing): string {
  const groups = specs(listing);
  if (!groups.length) return "No specs";
  return groups
    .map((group) => {
      const labels = group.options.map((option) => option.label).filter(Boolean);
      return labels.length ? `${group.name}: ${labels.join(", ")}` : group.name;
    })
    .join(" · ");
}

export function listingPriceLine(listing: Listing): string {
  return priceLine(listing);
}

export function staffCatalogRequest(
  filters: StaffCatalogFilters,
  options?: { cursor?: string | null; limit?: number },
): { query: StaffCatalogRequest } | { error: string } {
  const query: StaffCatalogRequest = { limit: options?.limit ?? 50 };
  const q = filters.q.trim();
  if (q) query.q = q;
  if (filters.subcategoryCode) query.subcategoryCode = filters.subcategoryCode;
  if (filters.supplierId) query.supplierId = filters.supplierId;

  if (filters.minPesos.trim()) {
    const minor = pesosToMinor(filters.minPesos);
    if (minor == null) return { error: "Lowest price needs a peso amount, like 25.00." };
    query.minPriceMinor = minor;
  }
  if (filters.maxPesos.trim()) {
    const minor = pesosToMinor(filters.maxPesos);
    if (minor == null) return { error: "Highest price needs a peso amount, like 80.00." };
    query.maxPriceMinor = minor;
  }
  if (
    query.minPriceMinor != null &&
    query.maxPriceMinor != null &&
    query.minPriceMinor > query.maxPriceMinor
  ) {
    return { error: "The lowest price has to sit at or below the highest." };
  }
  if (options?.cursor) query.cursor = options.cursor;
  return { query };
}

export function filtersFromSearchParams(params: {
  get(name: string): string | null;
}): StaffCatalogFilters {
  return {
    q: params.get("q") ?? "",
    subcategoryCode: params.get("type") ?? "",
    supplierId: params.get("shop") ?? "",
    minPesos: params.get("min") ?? "",
    maxPesos: params.get("max") ?? "",
  };
}

export function searchFromFilters(filters: StaffCatalogFilters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.subcategoryCode) params.set("type", filters.subcategoryCode);
  if (filters.supplierId) params.set("shop", filters.supplierId);
  if (filters.minPesos.trim()) params.set("min", filters.minPesos.trim());
  if (filters.maxPesos.trim()) params.set("max", filters.maxPesos.trim());
  const search = params.toString();
  return search ? `?${search}` : "";
}

export function filtersAreSet(filters: StaffCatalogFilters): boolean {
  return Boolean(
    filters.q.trim() ||
    filters.subcategoryCode ||
    filters.supplierId ||
    filters.minPesos.trim() ||
    filters.maxPesos.trim(),
  );
}
