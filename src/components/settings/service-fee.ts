/**
 * The service fee, as Operations types it and as the API stores it.
 *
 * The API holds the rate in basis points (1,000 = 10%) and adds it on top of
 * the shop's own price. A person sets it as a percentage, so this module owns
 * the conversion both ways and the worked example the settings screen shows
 * beside the field — the same half-up rounding the platform bills with, so the
 * example is what a real order would come to.
 *
 * The fee is folded into the client's total and never itemised for them; only
 * Operations and Super Admin see it as a line. Pure functions, unit tested.
 */

/** The API accepts 0 to 10,000 basis points — 0% to 100%. */
export const SERVICE_FEE_MAX_BPS = 10_000;

/** Half-up, the way `roundBps` rounds in gridgo-api. */
export function applyRateBps(amountMinor: number, rateBps: number): number {
  return Math.floor((amountMinor * rateBps + 5_000) / 10_000);
}

/** 1,250 bps → "12.5"; 1,000 → "10"; 1,275 → "12.75". No trailing zeros. */
export function bpsToPercentInput(bps: number): string {
  const percent = bps / 100;
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(2).replace(/0$/, "");
}

/**
 * "12.5" → 1,250. Null when the text is not a percentage the API can store:
 * blank, negative, more than two decimals, or above 100.
 */
export function percentInputToBps(input: string): number | null {
  const cleaned = input.trim().replace(/%$/, "").trim();
  if (!cleaned) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const bps = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > SERVICE_FEE_MAX_BPS) return null;
  return bps;
}

/** "10%" or "12.5%", for copy that names the rate in force. */
export function formatRatePercent(bps: number): string {
  return `${bpsToPercentInput(bps)}%`;
}

export type WorkedExample = {
  shopPriceMinor: number;
  serviceFeeMinor: number;
  deliveryFeeMinor: number;
  /** What the client is asked to pay: shop price + fee + delivery. */
  clientTotalMinor: number;
  /** What the client's receipt calls the work — the fee is inside it. */
  clientItemsMinor: number;
};

/**
 * One sample order priced at the given rate, so a change can be read as money
 * before it is saved. The shop price and delivery are fixed round figures; the
 * fee and totals move with the rate.
 */
export function workedExample(
  rateBps: number,
  { shopPriceMinor = 100_000, deliveryFeeMinor = 5_000 } = {},
): WorkedExample {
  const serviceFeeMinor = applyRateBps(shopPriceMinor, rateBps);
  return {
    shopPriceMinor,
    serviceFeeMinor,
    deliveryFeeMinor,
    clientTotalMinor: shopPriceMinor + serviceFeeMinor + deliveryFeeMinor,
    clientItemsMinor: shopPriceMinor + serviceFeeMinor,
  };
}
