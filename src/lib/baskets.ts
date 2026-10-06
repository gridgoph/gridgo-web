/**
 * Multi-shop checkout, as Operations reads it (gridgo-api#150, contract
 * `gridgo-api/docs/MULTI_SHOP_CHECKOUT_API.md`).
 *
 * A basket is one client payment over several shop groups. Each group is an
 * ordinary order with its own job, rider, payout stages and refunds; only the
 * payment is shared. An order without a `basketId` is a single-shop order.
 *
 * Groups are named "Shop A", "Shop B", … on every screen here, never by the
 * shop's trading name. Pure functions, unit tested.
 */

import type { Basket, BasketGroup, Order } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";

export type ShopMode = { kind: "single" } | { kind: "multi"; shops: number };

/**
 * How many shop groups each basket has, counted from the orders a queue
 * already holds: Operations lists every group order, cancelled ones included.
 */
export function basketShopCounts(
  orders: readonly Pick<Order, "basketId">[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const order of orders) {
    if (order.basketId) counts.set(order.basketId, (counts.get(order.basketId) ?? 0) + 1);
  }
  return counts;
}

/** Single-Shop unless the order belongs to a basket. */
export function shopModeOf(
  order: Pick<Order, "basketId">,
  counts?: ReadonlyMap<string, number>,
): ShopMode {
  if (!order.basketId) return { kind: "single" };
  // A basket always has at least two groups; a queue that somehow holds only
  // one of them still says Multi-Shop rather than undercounting it as one.
  return { kind: "multi", shops: Math.max(2, counts?.get(order.basketId) ?? 2) };
}

/** A group count includes separate dates at the same shop. */
export function shopModeLabel(mode: ShopMode): string {
  return mode.kind === "single" ? "Single-Shop" : `Grouped order, ${mode.shops} groups`;
}

/** The anonymous shop label and number of independently fulfilled groups. */
export function groupPositionLabel(
  order: Pick<Order, "groupLabel" | "basketId">,
  counts?: ReadonlyMap<string, number>,
): string | null {
  if (!order.basketId || !order.groupLabel) return null;
  const mode = shopModeOf(order, counts);
  return mode.kind === "multi"
    ? `${order.groupLabel} · ${mode.shops} groups`
    : order.groupLabel;
}

/** One group's money, part by part, as the workspace prints it. */
export type GroupMoney = {
  shopPriceMinor: number | null;
  /** What GRIDGO keeps: net of the organization discount. */
  serviceFeeMinor: number | null;
  organizationDiscountMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
};

export function groupMoney(group: BasketGroup): GroupMoney {
  return {
    shopPriceMinor: group.itemSubtotalMinor ?? group.order.supplierSubtotalMinor ?? null,
    serviceFeeMinor: group.serviceFeeMinor ?? group.order.serviceFeeMinor ?? null,
    organizationDiscountMinor:
      group.organizationDiscountMinor ?? group.order.organizationDiscountMinor ?? 0,
    deliveryFeeMinor: group.deliveryFeeMinor,
    totalMinor: group.totalMinor,
  };
}

export type BasketReconciliation = {
  /** Every group's total added together. */
  groupsMinor: number;
  /** The one payment the client was asked for. */
  paidMinor: number;
  balanced: boolean;
  /** Each group's total, in group order, for the printed sum. */
  parts: { label: string; totalMinor: number }[];
};

/**
 * The check that makes a multi-shop order readable: the groups add up to the
 * client's one payment. The API enforces it in the database; the screen
 * shows it so nobody has to add three numbers in their head.
 */
export function reconcileBasket(
  basket: Pick<Basket, "groups" | "totalMinor" | "payment">,
): BasketReconciliation {
  const parts = basket.groups.map((group) => ({
    label: group.label,
    totalMinor: group.totalMinor,
  }));
  const groupsMinor = parts.reduce((sum, part) => sum + part.totalMinor, 0);
  const paidMinor = basket.payment?.amountMinor ?? basket.totalMinor;
  return { groupsMinor, paidMinor, balanced: groupsMinor === paidMinor, parts };
}

/** The group this workspace is open on, else null. */
export function currentGroup(basket: Basket, orderId: string): BasketGroup | null {
  return basket.groups.find((group) => group.orderId === orderId) ?? null;
}

/** The basket payment is waiting on Operations. */
export function basketPaymentPending(basket: Pick<Basket, "payment">): boolean {
  return basket.payment?.status === "pending_confirmation";
}

export type GroupRefundState = {
  label: string;
  tone: "neutral" | "warning" | "success";
  icon: "circle-dot" | "clock" | "circle-check";
};

/**
 * Where one group's refund stands, from fields its order already carries.
 * Settling a group's refund never touches its siblings.
 */
export function groupRefundState(
  order: Pick<Order, "refundHold" | "refundDisposition" | "refundFinance">,
): GroupRefundState {
  if (order.refundHold)
    return { label: "Refund in progress", tone: "warning", icon: "clock" };
  if (order.refundDisposition || (order.refundFinance?.paidMinor ?? 0) > 0) {
    return { label: "Refund settled", tone: "success", icon: "circle-check" };
  }
  return { label: "No refund", tone: "neutral", icon: "circle-dot" };
}

/** States where the group's job is waiting for a rider to be sent. */
export function groupAwaitsDispatch(order: Pick<Order, "state">): boolean {
  return order.state === "ready_for_dispatch";
}

/** The group was cancelled; its money is still inside the one basket payment. */
export function groupIsCancelled(group: Pick<BasketGroup, "state" | "order">): boolean {
  return (group.order.state ?? group.state) === "cancelled";
}

export type CancelledShare = {
  label: string;
  orderId: string;
  amountMinor: number;
  /** The basket payment is confirmed, so this money is held and owed back now. */
  paid: boolean;
  /** One sentence for Operations: how much, for whom, and where it is refunded. */
  sentence: string;
};

/**
 * What a cancelled group's part of the one payment means for Operations
 * (MULTI_SHOP_CHECKOUT_API.md, "Fulfillment, payouts, and refunds"). The
 * basket is confirmed whole, so confirming takes the cancelled group's money
 * too; the client gets it back through that group's own refund request. Null
 * for a live group, once its refund is under way or settled, and while no
 * payment is waiting or confirmed.
 */
export function cancelledShare(
  basket: Pick<Basket, "payment">,
  group: BasketGroup,
): CancelledShare | null {
  if (!groupIsCancelled(group)) return null;
  if (groupRefundState(group.order).label !== "No refund") return null;
  const status = basket.payment?.status;
  const paid = status === "confirmed" || status === "legacy_confirmed";
  if (!paid && status !== "pending_confirmation") return null;
  const amount = formatPhp(group.totalMinor);
  return {
    label: group.label,
    orderId: group.orderId,
    amountMinor: group.totalMinor,
    paid,
    sentence: paid
      ? `${amount} of the client's payment is for ${group.label}, which was cancelled. Refund it from ${group.label}'s order.`
      : `${amount} of this payment is for ${group.label}, which was cancelled. After confirming, refund it from ${group.label}'s order.`,
  };
}

/** Every cancelled group whose money is still owed back, in group order. */
export function cancelledShares(
  basket: Pick<Basket, "payment" | "groups">,
): CancelledShare[] {
  return basket.groups.flatMap((group) => {
    const share = cancelledShare(basket, group);
    return share ? [share] : [];
  });
}
