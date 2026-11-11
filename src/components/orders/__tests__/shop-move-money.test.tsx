// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { OrderMoneyLines } from "@/components/orders/OrderMoneyLines";
import type { Order } from "@/lib/api/types";

vi.stubGlobal("React", React);
afterEach(cleanup);

const base = {
  id: "order1",
  supplierSubtotalMinor: 10000,
  serviceFeeRateBps: 1000,
  serviceFeeMinor: 1000,
  deliveryFeeMinor: 5000,
  totalMinor: 16000,
  supplierSettlement: { totalSupplierEarningsMinor: 10000 },
  platformRevenue: { grossServiceFeeMinor: 1000, organizationDiscountMinor: 0, netServiceFeeMinor: 1000 },
} as unknown as Order;

function view(order: Order) {
  render(
    <dl>
      <OrderMoneyLines order={order} />
    </dl>,
  );
}

it("adds a dearer move's lines after the total, with the fee GRIDGO keeps after its cover", () => {
  view({
    ...base,
    supplierSettlement: { totalSupplierEarningsMinor: 11000, shopMovePriceAdjustmentMinor: 500 },
    platformRevenue: {
      grossServiceFeeMinor: 1000,
      organizationDiscountMinor: 0,
      netServiceFeeMinor: 500,
      shopMoveCoverMinor: 500,
      shopMoveClientRefundMinor: 0,
      shopMoveClientTopUpMinor: 500,
    },
  } as Order);
  // Committed money is untouched.
  expect(screen.getByText("Shop price").nextSibling).toHaveTextContent("₱100.00");
  expect(screen.getByText("Client total").nextSibling).toHaveTextContent("₱160.00");
  expect(screen.getByTestId("shop-move-price-adjustment")).toHaveTextContent("+₱5.00");
  expect(screen.getByText("GRIDGO's cover, from its fee").nextSibling).toHaveTextContent("₱5.00");
  expect(screen.getByTestId("shop-move-client-top-up")).toHaveTextContent("₱5.00");
  expect(screen.queryByTestId("shop-move-client-refund")).toBeNull();
  expect(screen.getByText("Fee GRIDGO keeps, after the cover").nextSibling).toHaveTextContent("₱5.00");
});

it("shows a cheaper move as a lower shop pay and money back to the client", () => {
  view({
    ...base,
    supplierSettlement: { totalSupplierEarningsMinor: 9000, shopMovePriceAdjustmentMinor: -1000 },
    platformRevenue: {
      grossServiceFeeMinor: 1000,
      organizationDiscountMinor: 0,
      netServiceFeeMinor: 1000,
      shopMoveCoverMinor: 0,
      shopMoveClientRefundMinor: 1000,
      shopMoveClientTopUpMinor: 0,
    },
  } as Order);
  expect(screen.getByTestId("shop-move-price-adjustment")).toHaveTextContent("−₱10.00");
  expect(screen.getByTestId("shop-move-cover")).toHaveTextContent("₱0.00");
  expect(screen.getByTestId("shop-move-client-refund")).toHaveTextContent("₱10.00");
  expect(screen.queryByTestId("shop-move-client-top-up")).toBeNull();
});

it("leaves the panel as it was on an order that never moved", () => {
  view(base);
  expect(screen.queryByText(/Shop move/)).toBeNull();
  expect(screen.queryByText("GRIDGO's cover, from its fee")).toBeNull();
  expect(screen.queryByText("Fee GRIDGO keeps, after the cover")).toBeNull();
});
