/**
 * Multi-shop fixtures, shaped like the dev API's `GET /baskets/:id` for
 * Operations (gridgo-api MULTI_SHOP_CHECKOUT_API.md): two shop groups, one
 * payment equal to the sum of the groups. Money in PHP minor units.
 */
import type { Basket, BasketGroup, Order } from "@/lib/api/types";

export function groupOrder(partial: Partial<Order> & Pick<Order, "id">): Order {
  return {
    clientId: "client1",
    supplierId: "shop1",
    riderId: null,
    state: "initial_payment_review",
    title: "Flyers",
    quantity: 1,
    deadline: null,
    address: "Davao",
    supplierSubtotalMinor: 40000,
    supplierPriceMinor: 40000,
    serviceFeeRateBps: 1000,
    serviceFeeMinor: 4000,
    deliveryFeeMinor: 2500,
    riderCommissionBps: 8500,
    riderPayoutMinor: 2125,
    platformDeliveryShareMinor: 375,
    totalMinor: 46500,
    downpaymentPercent: 100,
    paymentMethod: "qr_manual",
    paymentStatus: "initial_payment_pending",
    payments: {
      downpayment: {
        amountMinor: 46500,
        method: "qr_manual",
        status: "pending_confirmation",
        reference: "1098765432101",
        submittedAt: "2026-10-05T15:39:49.945Z",
        confirmedAt: null,
        confirmedBy: null,
        confirmationSource: null,
      },
    },
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-10-05T15:35:59.939Z",
    updatedAt: "2026-10-05T15:39:49.945Z",
    timeline: [],
    basketId: "bsk_1",
    ...partial,
  };
}

export const shopA = groupOrder({ id: "ord_a", groupLabel: "Shop A" });
export const shopB = groupOrder({
  id: "ord_b",
  groupLabel: "Shop B",
  supplierId: "shop2",
  title: "Custom apparel",
  supplierSubtotalMinor: 18000,
  supplierPriceMinor: 18000,
  serviceFeeMinor: 1800,
  totalMinor: 22300,
});

function group(order: Order, label: string): BasketGroup {
  return {
    orderId: order.id,
    label,
    state: order.state,
    clientItemSubtotalMinor:
      (order.supplierSubtotalMinor ?? 0) + (order.serviceFeeMinor ?? 0),
    itemSubtotalMinor: order.supplierSubtotalMinor,
    serviceFeeMinor: order.serviceFeeMinor,
    organizationDiscountMinor: order.organizationDiscountMinor ?? 0,
    deliveryFeeMinor: order.deliveryFeeMinor,
    totalMinor: order.totalMinor,
    order,
  };
}

export function basketOf(orders: Order[], overrides: Partial<Basket> = {}): Basket {
  const totalMinor = orders.reduce((sum, order) => sum + order.totalMinor, 0);
  return {
    id: "bsk_1",
    receiptOrderId: orders[0].id,
    totalMinor,
    deadline: "2026-10-26T08:00:00.000Z",
    fulfillmentMode: "delivery",
    payment: {
      label: "Full payment",
      method: "qr_manual",
      status: "pending_confirmation",
      amountMinor: totalMinor,
      reference: "1098765432101",
      proofFileId: null,
      submittedAt: "2026-10-05T15:39:49.945Z",
    },
    groups: orders.map((order, index) => group(order, `Shop ${"ABC"[index]}`)),
    ...overrides,
  };
}
