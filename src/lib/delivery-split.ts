/**
 * How a delivery fee divides between the rider who carried the order and
 * GRIDGO.
 *
 * The API holds the rider's share in basis points (`riderCommissionBps`,
 * 8,500 = the rider keeps 85%) and snapshots it on every order when the
 * delivery fee is set, so a settings change never reprices an order already
 * placed. The rider's amount rounds half-up and GRIDGO gets the exact
 * remainder — the same arithmetic as `deliverySplit` in gridgo-api, so an
 * example on the settings screen is what a real order would come to.
 *
 * The split is internal: Operations, Super Admin and the rider see it; the
 * client is only ever shown the gross delivery fee. An API that predates the
 * split sends none of these fields, and every reader here falls back to the
 * gross fee rather than guessing a share.
 */

import { applyRateBps, formatRatePercent } from "@/components/settings/service-fee";
import type { Order } from "@/lib/api/types";

/** The API's seed: 85% to the rider, 15% to GRIDGO. */
export const DEFAULT_RIDER_COMMISSION_BPS = 8_500;

/** 0 to 10,000 basis points — the rider keeps none of it, or all of it. */
export const RIDER_COMMISSION_MAX_BPS = 10_000;

/** Why a rider share was refused, on the screen and from `400 invalid_rider_commission_rate`. */
export const RIDER_SHARE_INVALID =
  "The rider share is a percentage from 0 to 100 with up to two decimals, like 85 or 87.5.";

/** The settings screen's sample fee: the first shipped distance band. */
export const RIDER_SHARE_EXAMPLE_FEE_MINOR = 2_500;

export type DeliverySplit = {
  /** Gross fee the client pays for delivery. */
  deliveryFeeMinor: number;
  /** The rider's share rate, or null when the API sent amounts without it. */
  riderCommissionBps: number | null;
  riderPayoutMinor: number;
  platformDeliveryShareMinor: number;
};

/** The rider rounds half-up; GRIDGO owns exactly the remaining centavos. */
export function splitDeliveryFee(
  deliveryFeeMinor: number,
  riderCommissionBps: number,
): DeliverySplit {
  const riderPayoutMinor = applyRateBps(deliveryFeeMinor, riderCommissionBps);
  return {
    deliveryFeeMinor,
    riderCommissionBps,
    riderPayoutMinor,
    platformDeliveryShareMinor: deliveryFeeMinor - riderPayoutMinor,
  };
}

/** GRIDGO's side of a rider rate: 8,500 → 1,500. */
export function platformShareBps(riderCommissionBps: number): number {
  return RIDER_COMMISSION_MAX_BPS - riderCommissionBps;
}

/** "Rider keeps 85% · GRIDGO keeps 15%". */
export function riderShareSummary(riderCommissionBps: number): string {
  return `Rider keeps ${formatRatePercent(riderCommissionBps)} · GRIDGO keeps ${formatRatePercent(
    platformShareBps(riderCommissionBps),
  )}`;
}

function isMinor(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/**
 * The split on one order, read from the fields the API projects for
 * Operations and Super Admin. The server's own amounts win; a rate without
 * amounts is split here with the same arithmetic. Null when the API sent
 * neither — the caller then shows the gross fee alone.
 */
export function orderDeliverySplit(
  order: Pick<
    Order,
    | "deliveryFeeMinor"
    | "riderCommissionBps"
    | "riderPayoutMinor"
    | "platformDeliveryShareMinor"
  >,
): DeliverySplit | null {
  const fee = order.deliveryFeeMinor;
  if (!isMinor(fee)) return null;
  const rate = isMinor(order.riderCommissionBps) ? order.riderCommissionBps : null;
  if (isMinor(order.riderPayoutMinor) && isMinor(order.platformDeliveryShareMinor)) {
    return {
      deliveryFeeMinor: fee,
      riderCommissionBps: rate,
      riderPayoutMinor: order.riderPayoutMinor,
      platformDeliveryShareMinor: order.platformDeliveryShareMinor,
    };
  }
  return rate === null ? null : splitDeliveryFee(fee, rate);
}
