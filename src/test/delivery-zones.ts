/**
 * The four delivery distance zones exactly as `GET /settings` sends them
 * (gridgo-api#121, `docs/OPERATIONAL_MODEL_V2_API.md#delivery-distance-zones`),
 * at the API's shipped placeholder prices unless overridden.
 */

import type { DeliveryZoneBand } from "@/lib/delivery-zones";

type Prices = {
  nearby?: number;
  away?: number;
  long_distance?: number;
  baseFeeMinor?: number;
  perKmMinor?: number;
};

export function deliveryZones(prices: Prices = {}): DeliveryZoneBand[] {
  return [
    { zone: "nearby", label: "Nearby", maxDistanceMeters: 5000, feeMinor: prices.nearby ?? 2500 },
    { zone: "away", label: "Away", maxDistanceMeters: 10000, feeMinor: prices.away ?? 5000 },
    {
      zone: "long_distance",
      label: "Long Distance",
      maxDistanceMeters: 15000,
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
