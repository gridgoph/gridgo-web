/**
 * The four delivery distance zones exactly as `GET /settings` sends them
 * (gridgo-api#121, `docs/OPERATIONAL_MODEL_V2_API.md#delivery-distance-zones`),
 * at the API's first placeholder prices and default limits unless overridden.
 */

import type { DeliveryZoneBand } from "@/lib/delivery-zones";

type Prices = {
  nearby?: number;
  away?: number;
  long_distance?: number;
  baseFeeMinor?: number;
  perKmMinor?: number;
};

/** Upper limits in metres, Nearby → Long Distance; the API's 5 / 10 / 15 km unless overridden. */
type Limits = { nearby?: number; away?: number; long_distance?: number };

export function deliveryZones(prices: Prices = {}, limits: Limits = {}): DeliveryZoneBand[] {
  return [
    {
      zone: "nearby",
      label: "Nearby",
      maxDistanceMeters: limits.nearby ?? 5000,
      feeMinor: prices.nearby ?? 2500,
    },
    {
      zone: "away",
      label: "Away",
      maxDistanceMeters: limits.away ?? 10000,
      feeMinor: prices.away ?? 5000,
    },
    {
      zone: "long_distance",
      label: "Long Distance",
      maxDistanceMeters: limits.long_distance ?? 15000,
      feeMinor: prices.long_distance ?? 7500,
    },
    {
      zone: "out_of_zone",
      label: "Out of Zone",
      maxDistanceMeters: null,
      baseFeeMinor: prices.baseFeeMinor ?? 7500,
      perKmMinor: prices.perKmMinor ?? 1000,
    },
  ];
}
