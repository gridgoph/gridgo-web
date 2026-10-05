/**
 * The organization discount (gridgo-client#166, contract
 * `gridgo-api/docs/ORGANIZATION_MONEY_API.md`).
 *
 * An approved organization pays a discount on the shop price, funded entirely
 * out of GRIDGO's service fee: the shop's price, the delivery fee and the
 * rider's share never move. Since gridgo-api#155 an order's `serviceFeeMinor`
 * is the fee GRIDGO keeps (net); the gross fee and the discount ride beside
 * it. The settings rule is the same both ways: the fee rate may never be set
 * below the discount rate (`400 organization_discount_exceeds_service_fee`).
 *
 * Pure functions, unit tested.
 */

import type { Order } from "@/lib/api/types";
import { applyRateBps, formatRatePercent } from "@/components/settings/service-fee";

export type OrderFeeSplit = {
  /** The fee at the order's rate, before the discount. */
  grossMinor: number;
  /** Given to the organization out of that fee. */
  discountMinor: number;
  /** What GRIDGO keeps. Always `grossMinor - discountMinor`. */
  netMinor: number;
  /** The fee rate the order was priced at, when the API sent it. */
  feeRateBps: number | null;
  /** The discount rate snapshotted at checkout, when the API sent it. */
  discountRateBps: number | null;
};

type FeeFields = Pick<
  Order,
  | "serviceFeeMinor"
  | "serviceFeeRateBps"
  | "grossServiceFeeMinor"
  | "organizationDiscountMinor"
  | "organizationDiscountRateBps"
  | "platformRevenue"
>;

/** The discount on this order in pesos; 0 when there is none. */
export function organizationDiscountOf(order: Partial<FeeFields>): number {
  return Math.max(
    0,
    order.organizationDiscountMinor ??
      order.platformRevenue?.organizationDiscountMinor ??
      0,
  );
}

/**
 * The fee on an organization order, gross, discount and net. Null when the
 * order carries no discount (every non-organization order), so its money
 * card keeps the single "Service fee" line it has always had.
 */
export function orderFeeSplit(order: Partial<FeeFields>): OrderFeeSplit | null {
  const discountMinor = organizationDiscountOf(order);
  if (discountMinor <= 0) return null;
  const netMinor =
    order.serviceFeeMinor ?? order.platformRevenue?.netServiceFeeMinor ?? null;
  const grossMinor =
    order.grossServiceFeeMinor ??
    order.platformRevenue?.grossServiceFeeMinor ??
    (netMinor !== null ? netMinor + discountMinor : null);
  if (grossMinor === null) return null;
  return {
    grossMinor,
    discountMinor,
    netMinor: netMinor ?? grossMinor - discountMinor,
    feeRateBps: order.serviceFeeRateBps ?? null,
    discountRateBps:
      order.organizationDiscountRateBps != null && order.organizationDiscountRateBps > 0
        ? order.organizationDiscountRateBps
        : null,
  };
}

/** "Organization discount (5%)" — the rate only when the order snapshotted one. */
export function discountLabel(rateBps: number | null): string {
  return rateBps
    ? `Organization discount (${formatRatePercent(rateBps)})`
    : "Organization discount";
}

/** "−₱5.00" with a true minus sign, so a discount never reads as a charge. */
export function asDeduction(formatted: string): string {
  return `−${formatted}`;
}

/**
 * Why a fee/discount pair cannot be saved, in the words the settings screen
 * prints under the field; null when it can. Mirrors the API's floor.
 */
export function discountRuleProblem(feeBps: number, discountBps: number): string | null {
  if (discountBps <= feeBps) return null;
  return `The organization discount comes out of the service fee, so it cannot be more than the fee. Set the discount to ${formatRatePercent(feeBps)} or less, or raise the service fee to at least ${formatRatePercent(discountBps)}.`;
}

export type OrganizationExample = {
  shopPriceMinor: number;
  grossFeeMinor: number;
  discountMinor: number;
  netFeeMinor: number;
  deliveryFeeMinor: number;
  /** Printing as the organization's checkout prints it: price plus the gross fee. */
  printingMinor: number;
  /** What the organization pays. */
  totalMinor: number;
};

/** One sample organization order, rounded the way the API rounds it. */
export function organizationExample(
  feeBps: number,
  discountBps: number,
  { shopPriceMinor = 100_000, deliveryFeeMinor = 5_000 } = {},
): OrganizationExample {
  const grossFeeMinor = applyRateBps(shopPriceMinor, feeBps);
  const discountMinor = applyRateBps(shopPriceMinor, discountBps);
  return {
    shopPriceMinor,
    grossFeeMinor,
    discountMinor,
    netFeeMinor: grossFeeMinor - discountMinor,
    deliveryFeeMinor,
    printingMinor: shopPriceMinor + grossFeeMinor,
    totalMinor: shopPriceMinor + grossFeeMinor - discountMinor + deliveryFeeMinor,
  };
}
