// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { OrderMoneyLines } from "@/components/orders/OrderMoneyLines";
import type { Order } from "@/lib/api/types";
import { bracketSchedule, serviceFeeFor, SHIPPED_BRACKETS } from "@/lib/service-fee-brackets";

vi.stubGlobal("React", React);
afterEach(cleanup);

const schedule = bracketSchedule(SHIPPED_BRACKETS);

/** A ₱5,000 shop price under the brackets, delivered for ₱50. */
const bracketOrder = {
  id: "order1",
  supplierSubtotalMinor: 500_000,
  serviceFeeRateBps: null,
  serviceFeeSchedule: schedule,
  serviceFeeWorking: serviceFeeFor(500_000, schedule).serviceFeeWorking,
  grossServiceFeeMinor: 165_000,
  serviceFeeMinor: 165_000,
  deliveryFeeMinor: 5_000,
  totalMinor: 670_000,
} as unknown as Order;

function view(order: Order) {
  render(
    <dl>
      <OrderMoneyLines order={order} />
    </dl>,
  );
}

it("shows the fee with its bracket working, without one whole-order rate", () => {
  view(bracketOrder);
  expect(screen.getByText("Shop price").nextSibling).toHaveTextContent("₱5,000.00");
  expect(screen.getByText("Service fee").nextSibling).toHaveTextContent("₱1,650.00");
  const working = screen.getAllByTestId("service-fee-working");
  expect(working.map((row) => row.previousSibling?.textContent)).toEqual([
    "₱2,000.00 × 45%",
    "₱3,000.00 × 25%",
  ]);
  expect(working.map((row) => row.textContent)).toEqual(["₱900.00", "₱750.00"]);
  expect(screen.getByTestId("service-fee-table")).toHaveTextContent(
    "45% to ₱2,000, 25% to ₱20,000, 15% above",
  );
  expect(screen.queryByText(/Service fee \(/)).toBeNull();
  expect(screen.getByText("Delivery").nextSibling).toHaveTextContent("₱50.00");
  expect(screen.getByText("Client total").nextSibling).toHaveTextContent("₱6,700.00");
});

it("keeps the working on the gross fee when an organization discount comes out of it", () => {
  view({
    ...bracketOrder,
    organizationDiscountRateBps: 500,
    organizationDiscountMinor: 25_000,
    serviceFeeMinor: 140_000,
    totalMinor: 645_000,
  } as Order);
  expect(screen.getByText("Service fee").nextSibling).toHaveTextContent("₱1,650.00");
  expect(screen.getAllByTestId("service-fee-working")).toHaveLength(2);
  expect(screen.getByTestId("organization-discount")).toHaveTextContent("−₱250.00");
  expect(screen.getByText("Fee GRIDGO keeps").nextSibling).toHaveTextContent("₱1,400.00");
});

it("explains a legacy order as one flat rate from before brackets", () => {
  view({
    id: "old",
    supplierSubtotalMinor: 100_000,
    serviceFeeRateBps: 1_000,
    serviceFeeMinor: 10_000,
    deliveryFeeMinor: 5_000,
    totalMinor: 115_000,
  } as unknown as Order);
  expect(screen.getByText("Service fee (10%)").nextSibling).toHaveTextContent("₱100.00");
  expect(screen.getByTestId("service-fee-table")).toHaveTextContent(
    "One flat rate on the whole shop price, from before brackets",
  );
  expect(screen.queryByTestId("service-fee-working")).toBeNull();
});
