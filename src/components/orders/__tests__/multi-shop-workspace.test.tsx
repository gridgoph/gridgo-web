// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import type { Basket, Order } from "@/lib/api/types";
import { basketOf, shopA, shopB } from "@/test/baskets";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "ord_a" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/components/orders/EvidencePreview", () => ({
  EvidencePlate: () => null,
  EvidenceStrip: () => null,
}));
vi.mock("@/components/orders/ReceiptReferenceOcr", () => ({
  ReceiptReferenceOcr: () => null,
}));

let order: Order;
let basket: Basket;
let requests: { method: string; path: string; body: unknown }[];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  order = shopA;
  basket = basketOf([shopA, shopB]);
  requests = [];
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      requests.push({
        method,
        path,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (path === "/baskets/bsk_1/payment/confirm" && method === "POST") {
        const confirm = (o: Order): Order => ({
          ...o,
          state: "needs_qa",
          payments: {
            downpayment: { ...o.payments!.downpayment!, status: "confirmed" },
          },
        });
        order = confirm(order);
        basket = basketOf([confirm(shopA), confirm(shopB)], {
          payment: {
            ...basket.payment,
            status: "confirmed",
            confirmedAt: "2026-10-06T01:00:00Z",
          },
        });
        return json({ basket });
      }
      if (path === "/baskets/bsk_1") return json({ basket });
      if (path.startsWith("/orders/") && path.includes("/payments/")) {
        return json({ error: "basket_payment_required", basketId: "bsk_1" }, 409);
      }
      return json({ order });
    }),
  );
});
afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

const money = (scope: HTMLElement, label: string) =>
  within(scope).getByText(label, { selector: "dt" }).nextElementSibling;

it("shows one payment over every shop group, each with its own money", async () => {
  render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);

  expect(await screen.findByTestId("basket-total")).toHaveTextContent("₱688.00");
  expect(screen.getAllByText("Multi-Shop, 2 shops").length).toBeGreaterThan(0);
  expect(screen.getByText("This is Shop A")).toBeInTheDocument();

  const a = screen.getByTestId("group-Shop A");
  const b = screen.getByTestId("group-Shop B");
  expect(within(a).getByText("This order")).toBeInTheDocument();
  expect(money(a, "Shop price")).toHaveTextContent("₱400.00");
  expect(money(a, "Service fee (10%)")).toHaveTextContent("₱40.00");
  expect(money(a, "Delivery")).toHaveTextContent("₱25.00");
  expect(money(a, "Rider payout (85%)")).toHaveTextContent("₱21.25");
  expect(money(a, "GRIDGO delivery share (15%)")).toHaveTextContent("₱3.75");
  expect(money(a, "Shop A total")).toHaveTextContent("₱465.00");
  expect(money(b, "Shop price")).toHaveTextContent("₱180.00");
  expect(money(b, "Service fee (10%)")).toHaveTextContent("₱18.00");
  expect(money(b, "Shop B total")).toHaveTextContent("₱223.00");
  expect(within(b).getByRole("link", { name: "Open Shop B" })).toHaveAttribute(
    "href",
    "/ops/orders/ord_b",
  );
  expect(within(b).getByText("No refund")).toBeInTheDocument();
  expect(within(b).getByText("No rider yet")).toBeInTheDocument();

  // The groups add up to the client's one payment, in front of the reader.
  expect(screen.getByTestId("basket-reconciliation")).toHaveTextContent(
    "Shop A ₱465.00 + Shop B ₱223.00 = ₱688.00, the client's one payment.",
  );
  // The rail names this group's total and the whole payment separately.
  const rail = screen.getByRole("complementary", { name: "Order details" });
  expect(money(rail, "Shop A total")).toHaveTextContent("₱465.00");
  expect(money(rail, "Whole order, one payment")).toHaveTextContent(
    "₱688.00 for 2 shops",
  );
});

it("confirms the one transfer for every shop through the basket, never the group", async () => {
  render(<OrderWorkspace queueHref="/ops/orders" />);

  const confirm = await screen.findByRole("button", {
    name: "Confirm payment for all 2 shops",
  });
  expect(screen.getByTestId("basket-payment-amount")).toHaveTextContent("₱688.00");
  expect(
    screen.getByText("One payment of ₱688.00 for 2 shops is waiting on you."),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Confirm this payment" })).toBeNull();
  await userEvent.click(confirm);

  expect(await screen.findAllByText("Confirmed")).not.toHaveLength(0);
  const posts = requests.filter((request) => request.method === "POST");
  expect(posts).toEqual([
    { method: "POST", path: "/baskets/bsk_1/payment/confirm", body: {} },
  ]);
  expect(requests.some((request) => request.path.includes("/payments/"))).toBe(false);
});

it("says how much of the payment is a cancelled shop's, and where to refund it", async () => {
  basket = basketOf([shopA, { ...shopB, state: "cancelled" }]);
  render(<OrderWorkspace queueHref="/admin/orders" />);

  await screen.findByRole("button", { name: "Confirm payment for all 2 shops" });
  const note = screen.getAllByTestId("cancelled-share-Shop B")[0];
  expect(note).toHaveTextContent(
    "₱223.00 of this payment is for Shop B, which was cancelled. After confirming, refund it from Shop B's order.",
  );
  expect(within(note).getByRole("link", { name: "Open Shop B’s order" })).toHaveAttribute(
    "href",
    "/admin/orders/ord_b",
  );

  const b = screen.getByTestId("group-Shop B");
  expect(within(b).getByText("Owed after confirming")).toBeInTheDocument();
  expect(within(b).queryByText("No refund")).toBeNull();
  expect(screen.getByTestId("group-owed-Shop B")).toHaveTextContent(
    "₱223.00 of this payment is for Shop B, which was cancelled.",
  );
  expect(within(b).getByRole("link", { name: "Open Shop B's order to refund" })).toHaveAttribute(
    "href",
    "/admin/orders/ord_b",
  );
});

it("offers no payment action when the basket could not be read", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path === "/baskets/bsk_1") return json({ error: "server_error" }, 500);
      return json({ order });
    }),
  );
  render(<OrderWorkspace queueHref="/ops/orders" />);

  expect(await screen.findByText(/cannot be confirmed from here/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Confirm/ })).toBeNull();
  expect(screen.queryByTestId("basket-total")).toBeNull();
});

it("keeps a single-shop order's money card and asks for no basket", async () => {
  order = { ...shopA, basketId: null, groupLabel: null };
  render(<OrderWorkspace queueHref="/ops/orders" />);

  const rail = await screen.findByRole("complementary", { name: "Order details" });
  expect(
    await within(rail).findByText("Client total", { selector: "dt" }),
  ).toBeInTheDocument();
  expect(money(rail, "Client total")).toHaveTextContent("₱465.00");
  expect(screen.queryByText(/Multi-Shop/)).toBeNull();
  expect(screen.queryByTestId("basket-total")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Confirm this payment" }),
  ).toBeInTheDocument();
  expect(requests.some((request) => request.path.startsWith("/baskets"))).toBe(false);
});

it("shows an organization discount coming out of GRIDGO's fee, never the shop's price", async () => {
  order = {
    ...shopA,
    basketId: null,
    groupLabel: null,
    grossServiceFeeMinor: 4000,
    organizationDiscountRateBps: 500,
    organizationDiscountMinor: 2000,
    serviceFeeMinor: 2000,
    totalMinor: 44500,
  };
  render(<OrderWorkspace queueHref="/ops/orders" />);

  const rail = await screen.findByRole("complementary", { name: "Order details" });
  await within(rail).findByText("Organization discount (5%)", { selector: "dt" });
  expect(money(rail, "Shop price")).toHaveTextContent("₱400.00");
  expect(money(rail, "Service fee (10%)")).toHaveTextContent("₱40.00");
  expect(money(rail, "Organization discount (5%)")).toHaveTextContent("−₱20.00");
  expect(money(rail, "Fee GRIDGO keeps")).toHaveTextContent("₱20.00");
  expect(money(rail, "Rider payout (85%)")).toHaveTextContent("₱21.25");
  expect(money(rail, "Client total")).toHaveTextContent("₱445.00");
});
