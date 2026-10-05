/**
 * The four delivery distance zones: one table for the distance word a client
 * sees and for the delivery fee (gridgo-api#121, editable limits gridgo-api#140;
 * contract "Delivery distance zones" in `gridgo-api/docs/OPERATIONAL_MODEL_V2_API.md`).
 *
 * Keys, labels and order are fixed by the API, which refuses any other table
 * (`400 invalid_delivery_fee_bands`). Operations and Super Admin edit the upper
 * limit of Nearby, Away and Long Distance (whole metres, 1 to 100 km, strictly
 * increasing, inclusive) and the prices: one flat fee on each of those three,
 * and a base fee plus a per-kilometre fee on Out of Zone, which starts above
 * the Long Distance limit and is charged on the **whole** distance rounded up
 * to the next kilometre, not only the part past that limit.
 *
 * Older prices the API shipped are placeholders, not anyone's decision. Until
 * a price is changed from that figure the screen marks it so.
 */

import { isApiError } from "@/lib/api/client";
import type {
  DeliveryFeeBand,
  DeliveryZoneKey,
  FlatDeliveryZoneBand,
  OutOfZoneDeliveryBand,
} from "@/lib/api/types";
import { formatPhp, minorToPesosInput, pesosToMinor } from "@/lib/format";

export type DeliveryZoneBand = FlatDeliveryZoneBand | OutOfZoneDeliveryBand;

type FlatZoneKey = FlatDeliveryZoneBand["zone"];

/** The fixed zones, in API order, with the API's default limits (inclusive metres). */
export const DELIVERY_ZONES: ReadonlyArray<{
  zone: DeliveryZoneKey;
  label: string;
  defaultMaxDistanceMeters: number | null;
}> = [
  { zone: "nearby", label: "Nearby", defaultMaxDistanceMeters: 5_000 },
  { zone: "away", label: "Away", defaultMaxDistanceMeters: 10_000 },
  { zone: "long_distance", label: "Long Distance", defaultMaxDistanceMeters: 15_000 },
  { zone: "out_of_zone", label: "Out of Zone", defaultMaxDistanceMeters: null },
];

/** The farthest a zone limit may reach: 100 km, as the API enforces. */
export const ZONE_LIMIT_MAX_METERS = 100_000;

/** The API's first shipped prices. Placeholders until someone sets real ones. */
export const PLACEHOLDER_ZONE_PRICES = {
  nearby: 2_500,
  away: 5_000,
  long_distance: 7_500,
  outOfZoneBase: 7_500,
  outOfZonePerKm: 1_000,
} as const;

function isZoneLimit(meters: unknown): meters is number {
  return Number.isInteger(meters) && (meters as number) > 0 && (meters as number) <= ZONE_LIMIT_MAX_METERS;
}

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
      if (band.zone !== fixed.zone) return false;
      if (band.zone === "out_of_zone") {
        return (
          band.maxDistanceMeters === null &&
          Number.isSafeInteger(band.baseFeeMinor) &&
          Number.isSafeInteger(band.perKmMinor)
        );
      }
      const previous = index === 0 ? 0 : bands[index - 1].maxDistanceMeters;
      return (
        isZoneLimit(band.maxDistanceMeters) &&
        typeof previous === "number" &&
        band.maxDistanceMeters > previous &&
        Number.isSafeInteger(band.feeMinor)
      );
    })
  );
}

/** Metres as kilometres for reading: 5000 → "5", 12345 → "12.345". */
export function km(meters: number): string {
  return (meters / 1000).toLocaleString("en-PH", { maximumFractionDigits: 3 });
}

/** The three upper limits, Nearby → Long Distance, in metres. */
export type ZoneLimits = readonly [number, number, number];

export function zoneLimitsOf(bands: DeliveryZoneBand[]): ZoneLimits {
  const flat = bands.filter((band): band is FlatDeliveryZoneBand => band.zone !== "out_of_zone");
  return [flat[0].maxDistanceMeters, flat[1].maxDistanceMeters, flat[2].maxDistanceMeters];
}

const ZONE_INDEX: Record<DeliveryZoneKey, number> = {
  nearby: 0,
  away: 1,
  long_distance: 2,
  out_of_zone: 3,
};

/** "0–5 km", "5–10 km", "10–15 km", "Over 15 km", for the given limits. */
export function zoneRange(zone: DeliveryZoneKey, limits: ZoneLimits): string {
  const index = ZONE_INDEX[zone];
  if (index === 3) return `Over ${km(limits[2])} km`;
  const from = index === 0 ? 0 : limits[index - 1];
  return `${km(from)}–${km(limits[index])} km`;
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

/**
 * The Out of Zone example's distance: just past the Long Distance limit and
 * past a whole kilometre, so the rounding shows (15 km → 16.2 km).
 */
export function outOfZoneExampleMeters(longDistanceLimitMeters: number): number {
  return Math.ceil(longDistanceLimitMeters / 1000) * 1000 + 1_200;
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
  distanceMeters: number = outOfZoneExampleMeters(15_000),
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

/** The same price, short, for the preview: "₱89", "₱40 + ₱15 per km". */
export function zonePriceShort(band: DeliveryZoneBand): string {
  return band.zone === "out_of_zone"
    ? `${pesosShort(band.baseFeeMinor)} + ${pesosShort(band.perKmMinor)} per km`
    : pesosShort(band.feeMinor);
}

/** The limits and prices as typed. Text, so a half-typed number is not lost. */
export type ZoneDraft = {
  nearbyKm: string;
  awayKm: string;
  longDistanceKm: string;
  nearby: string;
  away: string;
  long_distance: string;
  outOfZoneBase: string;
  outOfZonePerKm: string;
};

export type ZoneField = keyof ZoneDraft;
export type ZonePriceField = "nearby" | "away" | "long_distance" | "outOfZoneBase" | "outOfZonePerKm";
export type ZoneLimitField = "nearbyKm" | "awayKm" | "longDistanceKm";

/** Each flat zone's limit field, in table order. */
export const LIMIT_FIELD: Record<FlatZoneKey, ZoneLimitField> = {
  nearby: "nearbyKm",
  away: "awayKm",
  long_distance: "longDistanceKm",
};

const LIMIT_FIELDS: readonly ZoneLimitField[] = ["nearbyKm", "awayKm", "longDistanceKm"];
const LIMIT_LABEL: Record<ZoneLimitField, string> = {
  nearbyKm: "Nearby",
  awayKm: "Away",
  longDistanceKm: "Long Distance",
};

/** Metres → kilometres as typed: 5000 → "5", 3500 → "3.5". */
export function metersToKmInput(meters: number): string {
  return String(meters / 1000);
}

export function zoneDraft(bands: DeliveryZoneBand[]): ZoneDraft {
  const draft: ZoneDraft = {
    nearbyKm: "",
    awayKm: "",
    longDistanceKm: "",
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
      draft[LIMIT_FIELD[band.zone]] = metersToKmInput(band.maxDistanceMeters);
    }
  }
  return draft;
}

/** Pesos as typed → minor units the API accepts, or null. */
export function readPrice(typed: string): number | null {
  const minor = pesosToMinor(typed);
  return minor !== null && Number.isSafeInteger(minor) ? minor : null;
}

/**
 * Kilometres as typed → whole metres, or null. Up to three decimals, because
 * the API stores whole metres; a sign, comma or exponent is not a distance.
 */
export function readKm(typed: string): number | null {
  const cleaned = typed.trim();
  if (!/^\d+(\.\d{0,3})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const meters = Number(whole) * 1000 + Number((frac + "000").slice(0, 3));
  return Number.isSafeInteger(meters) ? meters : null;
}

const PRICE_PROBLEM: Record<ZonePriceField, string> = {
  nearby: "Nearby needs a fee in pesos, like 89.00.",
  away: "Away needs a fee in pesos, like 149.00.",
  long_distance: "Long Distance needs a fee in pesos, like 229.00.",
  outOfZoneBase: "Out of Zone needs a base fee in pesos, like 40.00.",
  outOfZonePerKm: "Out of Zone needs a fee per kilometre in pesos, like 15.00.",
};

const PRICE_FIELDS = Object.keys(PRICE_PROBLEM) as ZonePriceField[];

/** Why a typed price cannot be saved, or null when it can. */
export function zonePriceProblem(field: ZonePriceField, typed: string): string | null {
  return readPrice(typed) === null ? PRICE_PROBLEM[field] : null;
}

const LIMIT_EXAMPLE: Record<ZoneLimitField, string> = {
  nearbyKm: "5",
  awayKm: "10",
  longDistanceKm: "15",
};

/**
 * Why a typed limit cannot be saved, or null when it can. The same rules the
 * API applies: more than 0, at most 100 km, whole metres, and each zone ending
 * beyond the one before it. An earlier limit that cannot be read is not held
 * against this one; that field carries its own message.
 */
export function zoneLimitProblem(field: ZoneLimitField, draft: ZoneDraft): string | null {
  const name = LIMIT_LABEL[field];
  const typed = draft[field].trim();
  const meters = readKm(typed);
  if (meters === null) {
    return /^\d+\.\d{4,}$/.test(typed)
      ? `${name} goes to the metre at most: use up to three decimals, like 4.75.`
      : `${name} needs an upper limit in kilometres, like ${LIMIT_EXAMPLE[field]}.`;
  }
  if (meters <= 0) return `${name} has to end above 0 km.`;
  if (meters > ZONE_LIMIT_MAX_METERS) {
    return `${name} can reach at most ${km(ZONE_LIMIT_MAX_METERS)} km.`;
  }
  const index = LIMIT_FIELDS.indexOf(field);
  if (index > 0) {
    const before = LIMIT_FIELDS[index - 1];
    const beforeMeters = readKm(draft[before]);
    if (beforeMeters !== null && meters <= beforeMeters) {
      return `${name} has to end beyond ${LIMIT_LABEL[before]}'s ${km(beforeMeters)} km.`;
    }
  }
  return null;
}

/** The typed limits when all three can be saved, else null. */
export function draftLimits(draft: ZoneDraft): ZoneLimits | null {
  if (LIMIT_FIELDS.some((field) => zoneLimitProblem(field, draft))) return null;
  return [readKm(draft.nearbyKm)!, readKm(draft.awayKm)!, readKm(draft.longDistanceKm)!];
}

/**
 * The stored table with the typed limits and prices in place. Keys and labels
 * are copied from what the API sent, so the PATCH never reshapes the table.
 */
export function applyZoneDraft(
  stored: DeliveryZoneBand[],
  draft: ZoneDraft,
): { bands: DeliveryZoneBand[] } | { problem: string } {
  for (const field of LIMIT_FIELDS) {
    const problem = zoneLimitProblem(field, draft);
    if (problem) return { problem };
  }
  for (const field of PRICE_FIELDS) {
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
        : {
            ...band,
            maxDistanceMeters: readKm(draft[LIMIT_FIELD[band.zone]])!,
            feeMinor: readPrice(draft[band.zone])!,
          },
    ),
  };
}

/**
 * The table the draft would save, for the preview: typed limits (null while
 * any of them cannot be saved) and typed prices, each unreadable price falling
 * back to the one in force so the preview never goes blank mid-edit.
 */
export function previewBands(
  stored: DeliveryZoneBand[],
  draft: ZoneDraft,
): DeliveryZoneBand[] | null {
  const limits = draftLimits(draft);
  if (!limits) return null;
  return stored.map((band) =>
    band.zone === "out_of_zone"
      ? {
          ...band,
          baseFeeMinor: readPrice(draft.outOfZoneBase) ?? band.baseFeeMinor,
          perKmMinor: readPrice(draft.outOfZonePerKm) ?? band.perKmMinor,
        }
      : {
          ...band,
          maxDistanceMeters: limits[ZONE_INDEX[band.zone]],
          feeMinor: readPrice(draft[band.zone]) ?? band.feeMinor,
        },
  );
}

/** One preview line per zone: "Nearby", "0–5 km", "₱89". */
export function zoneSummary(
  bands: DeliveryZoneBand[],
): Array<{ zone: DeliveryZoneKey; label: string; range: string; price: string }> {
  const limits = zoneLimitsOf(bands);
  return bands.map((band) => ({
    zone: band.zone,
    label: band.label,
    range: zoneRange(band.zone, limits),
    price: zonePriceShort(band),
  }));
}

/**
 * True while a stored zone price is still the API's first shipped figure. Out
 * of Zone counts as a placeholder until both of its prices have been set.
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
 * The limits and prices that moved, for the audit reason: "Nearby limit 5 km
 * to 3 km", "Nearby ₱25.00 to ₱30.00". Empty when nothing changed.
 */
export function zoneChanges(from: DeliveryZoneBand[], to: DeliveryZoneBand[]): string[] {
  return to.flatMap((band, index) => {
    const before = from[index];
    if (!before || before.zone !== band.zone) return [];
    const changes: string[] = [];
    if (
      band.maxDistanceMeters !== null &&
      before.maxDistanceMeters !== null &&
      band.maxDistanceMeters !== before.maxDistanceMeters
    ) {
      changes.push(
        `${band.label} limit ${km(before.maxDistanceMeters)} km to ${km(band.maxDistanceMeters)} km`,
      );
    }
    const was = zonePrice(before);
    const now = zonePrice(band);
    if (was !== now) changes.push(`${band.label} ${was} to ${now}`);
    return changes;
  });
}

/** True when the two tables put the zone limits in different places. */
export function limitsMoved(from: DeliveryZoneBand[], to: DeliveryZoneBand[]): boolean {
  return zoneLimitsOf(from).some((meters, index) => meters !== zoneLimitsOf(to)[index]);
}

/**
 * The API's refusal of a zone limit, named by zone ("Away has to end beyond
 * Nearby."), or null when the error is about something else. The API names the
 * band in `field`: `deliveryFeeBands[1].maxDistanceMeters`.
 */
export function zoneLimitErrorMessage(err: unknown): string | null {
  if (!isApiError(err)) return null;
  if (err.code !== "invalid_delivery_zone_limit" && err.code !== "delivery_zone_limits_not_increasing") {
    return null;
  }
  const field = err.detail<string>("field");
  const index = typeof field === "string" ? Number(/^deliveryFeeBands\[(\d)\]/.exec(field)?.[1]) : NaN;
  const name = LIMIT_FIELDS[index] ? LIMIT_LABEL[LIMIT_FIELDS[index]] : null;
  if (err.code === "invalid_delivery_zone_limit") {
    return `The API refused ${name ? `the ${name} limit` : "a zone limit"}: each limit has to be more than 0 km and at most ${km(ZONE_LIMIT_MAX_METERS)} km, to the metre.`;
  }
  const before = index > 0 && LIMIT_FIELDS[index - 1] ? LIMIT_LABEL[LIMIT_FIELDS[index - 1]] : null;
  return name && before
    ? `The API refused the limits: ${name} has to end beyond ${before}.`
    : "The API refused the limits: Nearby, Away and Long Distance each have to end beyond the zone before.";
}

/**
 * A reload under a draft: each field the person changed stays as typed, and
 * every untouched field moves to what the API now holds. So saving after
 * someone else's change never quietly puts back a value they set.
 */
export function mergeZoneDrafts(
  current: ZoneDraft | null,
  previous: ZoneDraft | null,
  next: ZoneDraft | null,
): ZoneDraft | null {
  if (!current || !previous || !next) return next;
  const merged = { ...next };
  for (const field of Object.keys(next) as ZoneField[]) {
    if (current[field] !== previous[field]) merged[field] = current[field];
  }
  return merged;
}
