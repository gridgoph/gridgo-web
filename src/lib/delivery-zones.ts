/**
 * The four delivery distance zones: one table for the distance word a client
 * sees and for the delivery fee (gridgo-api#121; contract "Delivery distance
 * zones" in `gridgo-api/docs/OPERATIONAL_MODEL_V2_API.md`).
 *
 * Keys, labels, order and limits are fixed by the API, which refuses any other
 * table (`400 invalid_delivery_fee_bands`). Operations and Super Admin edit
 * only the prices: one flat fee on Nearby, Away and Long Distance, and a base
 * fee plus a per-kilometre fee on Out of Zone, charged on the **whole**
 * distance rounded up to the next kilometre, not only the part past 15 km.
 *
 * The prices the API ships are placeholders, not anyone's decision. Until a
 * price is changed from its shipped figure the screen marks it so.
 */

import type {
  DeliveryFeeBand,
  DeliveryZoneKey,
  FlatDeliveryZoneBand,
  OutOfZoneDeliveryBand,
} from "@/lib/api/types";
import { formatPhp, minorToPesosInput, pesosToMinor } from "@/lib/format";

export type DeliveryZoneBand = FlatDeliveryZoneBand | OutOfZoneDeliveryBand;

/** The fixed table, in API order. Limits are inclusive metres. */
export const DELIVERY_ZONES: ReadonlyArray<{
  zone: DeliveryZoneKey;
  label: string;
  maxDistanceMeters: number | null;
  /** Where the zone starts, for its range words. */
  fromMeters: number;
}> = [
  { zone: "nearby", label: "Nearby", fromMeters: 0, maxDistanceMeters: 5_000 },
  { zone: "away", label: "Away", fromMeters: 5_000, maxDistanceMeters: 10_000 },
  { zone: "long_distance", label: "Long Distance", fromMeters: 10_000, maxDistanceMeters: 15_000 },
  { zone: "out_of_zone", label: "Out of Zone", fromMeters: 15_000, maxDistanceMeters: null },
];

/** The API's shipped prices. Placeholders until someone sets real ones. */
export const PLACEHOLDER_ZONE_PRICES = {
  nearby: 2_500,
  away: 5_000,
  long_distance: 7_500,
  outOfZoneBase: 7_500,
  outOfZonePerKm: 1_000,
} as const;

/** The Out of Zone example's distance: past a whole kilometre, so the rounding shows. */
export const OUT_OF_ZONE_EXAMPLE_METERS = 16_200;

/**
 * True when the API holds the four fixed zones. An API from before the zones
 * sends unnamed bands; the screen then shows them without offering edits that
 * the API would not understand.
 */
export function isZonedTable(bands: DeliveryFeeBand[]): bands is DeliveryZoneBand[] {
  return (
    bands.length === DELIVERY_ZONES.length &&
    DELIVERY_ZONES.every((fixed, index) => {
      const band = bands[index];
      if (band.zone !== fixed.zone || band.maxDistanceMeters !== fixed.maxDistanceMeters) {
        return false;
      }
      return band.zone === "out_of_zone"
        ? Number.isSafeInteger(band.baseFeeMinor) && Number.isSafeInteger(band.perKmMinor)
        : Number.isSafeInteger(band.feeMinor);
    })
  );
}

function km(meters: number): string {
  return (meters / 1000).toLocaleString("en-PH");
}

/** "0–5 km", "5–10 km", "10–15 km", "Over 15 km". */
export function zoneRange(zone: DeliveryZoneKey): string {
  const fixed = DELIVERY_ZONES.find((entry) => entry.zone === zone);
  if (!fixed) return "";
  if (fixed.maxDistanceMeters === null) return `Over ${km(fixed.fromMeters)} km`;
  return `${km(fixed.fromMeters)}–${km(fixed.maxDistanceMeters)} km`;
}

/** Kilometres charged for an Out of Zone delivery: the whole distance, rounded up. */
export function chargedKilometres(distanceMeters: number): number {
  return Math.ceil(distanceMeters / 1000);
}

/** `baseFeeMinor + perKmMinor × ceil(distanceMeters / 1000)`, as the API prices it. */
export function outOfZoneFeeMinor(
  distanceMeters: number,
  baseFeeMinor: number,
  perKmMinor: number,
): number {
  return baseFeeMinor + perKmMinor * chargedKilometres(distanceMeters);
}

/** "₱75" for whole pesos, "₱75.50" otherwise: short enough to sit in a sum. */
export function pesosShort(minor: number): string {
  return minor % 100 === 0 ? formatPhp(minor).replace(/\.00$/, "") : formatPhp(minor);
}

/**
 * The worked example under Out of Zone, e.g. "16.2 km counts as 17 km:
 * ₱75 + 17 × ₱10 = ₱245".
 */
export function outOfZoneExample(
  baseFeeMinor: number,
  perKmMinor: number,
  distanceMeters: number = OUT_OF_ZONE_EXAMPLE_METERS,
): string {
  const charged = chargedKilometres(distanceMeters);
  const distance = (distanceMeters / 1000).toLocaleString("en-PH", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const total = outOfZoneFeeMinor(distanceMeters, baseFeeMinor, perKmMinor);
  return `${distance} km counts as ${charged} km: ${pesosShort(baseFeeMinor)} + ${charged} × ${pesosShort(perKmMinor)} = ${pesosShort(total)}`;
}

/** The price a zone holds, in words, for the "in force" list and the audit reason. */
export function zonePrice(band: DeliveryZoneBand): string {
  return band.zone === "out_of_zone"
    ? `${formatPhp(band.baseFeeMinor)} + ${formatPhp(band.perKmMinor)} per km`
    : formatPhp(band.feeMinor);
}

/** The prices as typed. Text, so a half-typed number is not lost. */
export type ZonePriceDraft = {
  nearby: string;
  away: string;
  long_distance: string;
  outOfZoneBase: string;
  outOfZonePerKm: string;
};

export type ZonePriceField = keyof ZonePriceDraft;

export function zonePriceDraft(bands: DeliveryZoneBand[]): ZonePriceDraft {
  const draft: ZonePriceDraft = {
    nearby: "",
    away: "",
    long_distance: "",
    outOfZoneBase: "",
    outOfZonePerKm: "",
  };
  for (const band of bands) {
    if (band.zone === "out_of_zone") {
      draft.outOfZoneBase = minorToPesosInput(band.baseFeeMinor);
      draft.outOfZonePerKm = minorToPesosInput(band.perKmMinor);
    } else {
      draft[band.zone] = minorToPesosInput(band.feeMinor);
    }
  }
  return draft;
}

/** Pesos as typed → minor units the API accepts, or null. */
export function readPrice(typed: string): number | null {
  const minor = pesosToMinor(typed);
  return minor !== null && Number.isSafeInteger(minor) ? minor : null;
}

const PRICE_PROBLEM: Record<ZonePriceField, string> = {
  nearby: "Nearby needs a fee in pesos, like 25.00.",
  away: "Away needs a fee in pesos, like 50.00.",
  long_distance: "Long Distance needs a fee in pesos, like 75.00.",
  outOfZoneBase: "Out of Zone needs a base fee in pesos, like 75.00.",
  outOfZonePerKm: "Out of Zone needs a fee per kilometre in pesos, like 10.00.",
};

/** Why a typed price cannot be saved, or null when it can. */
export function zonePriceProblem(field: ZonePriceField, typed: string): string | null {
  return readPrice(typed) === null ? PRICE_PROBLEM[field] : null;
}

/**
 * The stored table with the typed prices in place. Keys, labels and limits are
 * copied from what the API sent, so the PATCH can only ever change prices.
 */
export function applyZonePrices(
  stored: DeliveryZoneBand[],
  draft: ZonePriceDraft,
): { bands: DeliveryZoneBand[] } | { problem: string } {
  for (const field of Object.keys(PRICE_PROBLEM) as ZonePriceField[]) {
    const problem = zonePriceProblem(field, draft[field]);
    if (problem) return { problem };
  }
  return {
    bands: stored.map((band) =>
      band.zone === "out_of_zone"
        ? {
            ...band,
            baseFeeMinor: readPrice(draft.outOfZoneBase)!,
            perKmMinor: readPrice(draft.outOfZonePerKm)!,
          }
        : { ...band, feeMinor: readPrice(draft[band.zone])! },
    ),
  };
}

/**
 * True while a stored zone price is still the API's shipped figure. Out of
 * Zone counts as a placeholder until both of its prices have been set.
 */
export function isPlaceholder(band: DeliveryZoneBand): boolean {
  if (band.zone === "out_of_zone") {
    return (
      band.baseFeeMinor === PLACEHOLDER_ZONE_PRICES.outOfZoneBase ||
      band.perKmMinor === PLACEHOLDER_ZONE_PRICES.outOfZonePerKm
    );
  }
  return band.feeMinor === PLACEHOLDER_ZONE_PRICES[band.zone];
}

/**
 * The zone prices that moved, for the audit reason: "Nearby ₱25.00 to
 * ₱30.00". Empty when nothing changed.
 */
export function zonePriceChanges(from: DeliveryZoneBand[], to: DeliveryZoneBand[]): string[] {
  return to.flatMap((band, index) => {
    const before = from[index];
    if (!before || before.zone !== band.zone) return [];
    const was = zonePrice(before);
    const now = zonePrice(band);
    return was === now ? [] : [`${band.label} ${was} to ${now}`];
  });
}

/**
 * A reload under a draft: each price the person changed stays as typed, and
 * every untouched price moves to what the API now holds. So saving after
 * someone else's change never quietly puts back a price they set.
 */
export function mergeZoneDrafts(
  current: ZonePriceDraft | null,
  previous: ZonePriceDraft | null,
  next: ZonePriceDraft | null,
): ZonePriceDraft | null {
  if (!current || !previous || !next) return next;
  const merged = { ...next };
  for (const field of Object.keys(next) as ZonePriceField[]) {
    if (current[field] !== previous[field]) merged[field] = current[field];
  }
  return merged;
}
