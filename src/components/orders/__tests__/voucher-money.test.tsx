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

/** A launch voucher's whole-order line, as staff read it (gridgo-api#315). */
const launch = (voucher: Record<string, unknown>, money: Record<string, unknown>) =>
  ({
    id: "ord_launch",
    serviceFeeRateBps: 4500,
    riderCommissionBps: 8500,
    voucher: {
      label: "GRIDGO-funded voucher",
      fundedBy: "GRIDGO",
      coversOrderTotal: true,
      ...voucher,
    },
    ...money,
  }) as unknown as Order;

/** `ord_26566a652c28` from the live launch run: a Founding voucher covers all of it. */
const fullyCovered = launch(
  {
    id: "vch_41f4450bf94c",
    campaignId: "launch_founding_v4",
    amountMinor: 10350,
    deliveryMinor: 8900,
    supplierMinor: 1000,
    serviceFeeMinor: 450,
    gridgoRiderTopupMinor: 7565,
    gridgoSupplierTopupMinor: 1000,
  },
  {
    supplierSubtotalMinor: 1000,
    serviceFeeMinor: 450,
    deliveryFeeMinor: 8900,
    riderPayoutMinor: 7565,
    platformDeliveryShareMinor: 1335,
    totalMinor: 0,
  },
);

it("adds the shop price to a whole-order voucher, so its parts make the voucher", () => {
  view(fullyCovered);
  expect(screen.getByTestId("voucher-discount")).toHaveTextContent("−₱103.50");
  const parts = [
    screen.getByText("Off GRIDGO's service fee").nextSibling,
    screen.getByText("Off delivery, paid by GRIDGO").nextSibling,
    screen.getByTestId("voucher-supplier"),
  ].map((node) => node?.textContent);
  expect(parts).toEqual(["₱4.50", "₱89.00", "₱10.00"]);
  expect(screen.getByText("Client total").nextSibling).toHaveTextContent("₱0.00");
});

it("shows what GRIDGO pays the shop and rider apart from their gross pay", () => {
  view(fullyCovered);
  expect(screen.getByText("Shop price").nextSibling).toHaveTextContent("₱10.00");
  expect(screen.getByText(/^Rider payout/).nextSibling).toHaveTextContent("₱75.65");
  expect(screen.getByTestId("gridgo-supplier-topup")).toHaveTextContent("₱10.00");
  expect(screen.getByTestId("gridgo-rider-topup")).toHaveTextContent("₱75.65");
  expect(screen.getByText("GRIDGO's top-up to the shop")).toBeInTheDocument();
  expect(screen.getByText("GRIDGO's top-up to the rider")).toBeInTheDocument();
});

it("reads a part-cash launch order from the order's own funding fields", () => {
  // `ord_5ff8efce73fb`: a ₱100 Friend Pass on a ₱234 order; the client paid ₱134.
  view(
    launch(
      {
        id: "vch_3df90b5d8b9a",
        campaignId: "launch_friend_pass_v5",
        amountMinor: 10000,
        serviceFeeMinor: 4500,
        deliveryMinor: 5500,
      },
      {
        supplierSubtotalMinor: 10000,
        serviceFeeMinor: 4500,
        deliveryFeeMinor: 8900,
        riderPayoutMinor: 7565,
        platformDeliveryShareMinor: 1335,
        totalMinor: 13400,
        coversOrderTotal: true,
        voucherDiscountMinor: 10000,
        voucherServiceFeeMinor: 4500,
        voucherDeliveryMinor: 5500,
        voucherSupplierMinor: 0,
        gridgoSupplierTopupMinor: 0,
        gridgoRiderTopupMinor: 4165,
      },
    ),
  );
  expect(screen.getByTestId("voucher-discount")).toHaveTextContent("−₱100.00");
  expect(screen.queryByTestId("voucher-supplier")).toBeNull();
  expect(screen.getByText("Client total").nextSibling).toHaveTextContent("₱134.00");
  expect(screen.getByTestId("gridgo-supplier-topup")).toHaveTextContent("₱0.00");
  expect(screen.getByTestId("gridgo-rider-topup")).toHaveTextContent("₱41.65");
});

it("shows no top-up on an ordinary voucher, which never reaches the shop or rider", () => {
  view(order);
  expect(screen.queryByTestId("voucher-supplier")).toBeNull();
  expect(screen.queryByTestId("gridgo-supplier-topup")).toBeNull();
  expect(screen.queryByTestId("gridgo-rider-topup")).toBeNull();
});
