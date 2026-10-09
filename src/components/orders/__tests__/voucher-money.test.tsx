// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { OrderMoneyLines } from "@/components/orders/OrderMoneyLines";
import type { Order } from "@/lib/api/types";

vi.stubGlobal("React", React);
afterEach(cleanup);

const order = {
  id: "order1",
  supplierSubtotalMinor: 10000,
  serviceFeeRateBps: 1000,
  serviceFeeMinor: 1000,
  deliveryFeeMinor: 5000,
  riderCommissionBps: 8500,
  riderPayoutMinor: 4250,
  platformDeliveryShareMinor: 750,
  // ₱15: ₱10 off the fee, ₱5 off delivery; the total is already after it.
  totalMinor: 14500,
  voucher: {
    id: "vch_1",
    campaignId: "vcamp_1",
    label: "GRIDGO-funded voucher",
    fundedBy: "GRIDGO",
    amountMinor: 1500,
    serviceFeeMinor: 1000,
    deliveryMinor: 500,
  },
  voucherDiscountMinor: 1500,
  voucherServiceFeeMinor: 1000,
  voucherDeliveryMinor: 500,
} as unknown as Order;

function view(o: Order) {
  render(
    <dl>
      <OrderMoneyLines order={o} />
    </dl>,
  );
}

it("shows the GRIDGO-funded voucher with its sources and leaves shop and rider pay gross", () => {
  view(order);
  expect(screen.getByText("Voucher (GRIDGO-funded)")).toBeInTheDocument();
  expect(screen.getByTestId("voucher-discount")).toHaveTextContent("−₱15.00");
  expect(screen.getByText("Off GRIDGO's service fee").nextSibling).toHaveTextContent("₱10.00");
  expect(screen.getByText("Off delivery, paid by GRIDGO").nextSibling).toHaveTextContent("₱5.00");
  expect(screen.getByText("Shop price").nextSibling).toHaveTextContent("₱100.00");
  expect(screen.getByText(/^Rider payout/).nextSibling).toHaveTextContent("₱42.50");
  expect(screen.getByText("Client total").nextSibling).toHaveTextContent("₱145.00");
});

it("draws no voucher line on an order without one", () => {
  view({ ...order, voucher: undefined, voucherDiscountMinor: undefined } as Order);
  expect(screen.queryByText("Voucher (GRIDGO-funded)")).toBeNull();
});
