/**
 * Catalogue money, pack size, and minimum order, as the catalogue API stores
 * them (`moneyMinor` and `integer` in gridgo-api `catalog-routes.js`).
 *
 * A price is a safe integer of centavos from 0 up. ₱0.00 and ₱0.50 are
 * amounts. There is no ₱1 floor and no ₱1,000,000 ceiling. A pack is a whole
 * number of at least 2, with no separate ceiling of 5,000. A minimum order is
 * a whole number of at least 1, or none, with no ceiling of 1,000.
 */

export const CATALOG_MONEY_MAX_MINOR = Number.MAX_SAFE_INTEGER;

export const CATALOG_MONEY_INVALID = "Enter an amount in pesos, for example 1200.00.";
export const CATALOG_MONEY_OVER =
  "That amount is above the largest whole-centavo price a listing can store.";

export const CATALOG_PACK_MIN = 2;
export const CATALOG_PACK_INVALID = "A pack must be a whole number of at least 2.";
export const CATALOG_PACK_OVER =
  "That pack size is above the largest whole number a listing can store.";

export const CATALOG_MIN_ORDER_INVALID =
  "A minimum order is a whole number of at least 1, or 0 for none.";
export const CATALOG_MIN_ORDER_OVER =
  "That minimum order is above the largest whole number a listing can store.";

export const DUPLICATE_BULK_BREAK = "Two bulk breaks cannot start at the same quantity.";
export const BULK_BREAK_CAP = "A listing can have at most eight bulk breaks.";
export const SPEED_CAP = "A listing can offer at most six speeds.";

export const MAX_BULK_BREAKS = 8;
export const MAX_SPEEDS = 6;

/** Largest whole number a pack or a minimum order can store. */
export const CATALOG_COUNT_MAX = Number.MAX_SAFE_INTEGER;

export type CatalogMoney =
  | { ok: true; minor: number | null }
  | { ok: false; error: string };

/**
 * Pesos as typed → centavos. Empty is "nothing entered". A third decimal is
 * refused so the centavos that are stored are the centavos that were typed.
 * Above the catalogue's safe integer is the over-limit explanation.
 */
export function parseCatalogMoney(value: string): CatalogMoney {
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed) return { ok: true, minor: null };
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) {
    return { ok: false, error: CATALOG_MONEY_INVALID };
  }
  const [whole, frac = ""] = trimmed.split(".");
  const cents = (frac + "00").slice(0, 2);
  let minor: bigint;
  try {
    minor = BigInt(whole) * BigInt(100) + BigInt(cents);
  } catch {
    return { ok: false, error: CATALOG_MONEY_INVALID };
  }
  if (minor > BigInt(CATALOG_MONEY_MAX_MINOR)) {
    return { ok: false, error: CATALOG_MONEY_OVER };
  }
  return { ok: true, minor: Number(minor) };
}

/** Whole number the catalogue can store, or why it cannot. */
function countProblem(
  value: number,
  tooSmall: string,
  tooBig: string,
  min: number,
): string | null {
  if (!Number.isFinite(value)) return tooSmall;
  if (value > CATALOG_COUNT_MAX) return tooBig;
  if (!Number.isSafeInteger(value) || value < min) return tooSmall;
  return null;
}

/** Null when this unit has no pack, or the pack is one the API will store. */
export function packProblem(pricingUnit: string, quantity: number | null): string | null {
  if (pricingUnit !== "per_package") return null;
  return countProblem(quantity ?? 100, CATALOG_PACK_INVALID, CATALOG_PACK_OVER, CATALOG_PACK_MIN);
}

/**
 * Null when this unit asks no quantity, the shop left the minimum empty, or
 * the number is one the API will store. 0 is none.
 */
export function minimumOrderProblem(
  pricingUnit: string,
  quantity: number | null,
  asksQuantity: boolean,
): string | null {
  if (!asksQuantity || quantity == null || quantity === 0) return null;
  return countProblem(quantity, CATALOG_MIN_ORDER_INVALID, CATALOG_MIN_ORDER_OVER, 1);
}
