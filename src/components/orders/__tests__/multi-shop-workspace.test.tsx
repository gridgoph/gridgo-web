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

function named(source: Order, shopName: string): Order {
  return { ...source, supplierContact: { shopName, contactName: "Counter" } };
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  order = named(shopA, "North Press");
  basket = basketOf([order, named(shopB, "South Bindery")]);
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
      if (path === "/baskets/bsk_1/invoice")
        return json({
          invoice: {
            invoiceNumber: "TEST-DATES",
            issuedAt: "2026-10-06T01:00:00Z",
            totalMinor: basket.totalMinor,
            groups: basket.groups.map((group) => ({
              ...group,
              deadline: group.order.deadline,
              lines: [],
            })),
          },
        });
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
  expect(screen.getAllByText("Grouped order, 2 groups").length).toBeGreaterThan(0);
  expect(screen.getByText("This is Shop A")).toBeInTheDocument();

  const a = screen.getByTestId("group-Shop A");
  const b = screen.getByTestId("group-Shop B");
  const north = within(a).getByRole("link", { name: "North Press" });
  expect(north).toHaveAttribute("href", "/ops/shop-performance/shop1");
  expect(north).toHaveAttribute("target", "_blank");
  expect(north).toHaveAttribute("rel", "noopener noreferrer");
  expect(within(a).getByText("Shop A")).toBeInTheDocument();
  const south = within(b).getByRole("link", { name: "South Bindery" });
  expect(south).toHaveAttribute("href", "/ops/shop-performance/shop2");
  expect(south).toHaveAttribute("target", "_blank");
  expect(within(b).getByText("Shop B")).toBeInTheDocument();
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
    "₱688.00 for 2 groups",
  );
});

it("confirms the one transfer for every shop through the basket, never the group", async () => {
  render(<OrderWorkspace queueHref="/ops/orders" />);

  const confirm = await screen.findByRole("button", {
    name: "Confirm payment for all 2 groups",
  });
  expect(screen.getByTestId("basket-payment-amount")).toHaveTextContent("₱688.00");
  expect(
    screen.getByText("One payment of ₱688.00 for 2 groups is waiting on you."),
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

  await screen.findByRole("button", { name: "Confirm payment for all 2 groups" });
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
  expect(
    within(b).getByRole("link", { name: "Open Shop B's order to refund" }),
  ).toHaveAttribute("href", "/admin/orders/ord_b");
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
  order = {
    ...shopA,
    basketId: null,
    groupLabel: null,
    supplierContact: { shopName: "North Press", contactName: "Ana" },
  };
  render(<OrderWorkspace queueHref="/ops/orders" />);

  const shop = await screen.findByRole("link", { name: "North Press" });
  expect(shop).toHaveAttribute("href", "/ops/shop-performance/shop1");
  expect(shop).toHaveAttribute("target", "_blank");
  expect(shop).toHaveAttribute("rel", "noopener noreferrer");
  const rail = await screen.findByRole("complementary", { name: "Order details" });
  expect(
    await within(rail).findByText("Client total", { selector: "dt" }),
  ).toBeInTheDocument();
  expect(money(rail, "Client total")).toHaveTextContent("₱465.00");
  expect(screen.queryByText(/Grouped order/)).toBeNull();
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

it("shows the deadline on each same-shop group without claiming two shops", async () => {
  const contact = { shopName: "North Press", contactName: "Ana" };
  basket = basketOf(
    [
      { ...shopA, deadline: "2026-11-10T08:00:00.000Z", supplierContact: contact },
      {
        ...shopA,
        id: "ord_b",
        deadline: "2026-11-12T08:00:00.000Z",
        supplierContact: contact,
      },
    ],
    { deadline: null },
  );
  basket.groups.forEach((group) => {
    group.label = "Shop A";
  });
  render(<OrderWorkspace queueHref="/ops/orders" />);
  await screen.findByTestId("basket-total");
  const groups = screen.getAllByTestId("group-Shop A");
  expect(groups).toHaveLength(2);
  expect(within(groups[0]).getByRole("link", { name: "North Press" })).toHaveAttribute(
    "href",
    "/ops/shop-performance/shop1",
  );
  expect(within(groups[1]).getByRole("link", { name: "North Press" })).toHaveAttribute(
    "href",
    "/ops/shop-performance/shop1",
  );
  expect(within(groups[0]).getByText("Shop A")).toBeInTheDocument();
  expect(within(groups[1]).getByText("Shop A")).toBeInTheDocument();
  expect(within(groups[0]).getByText("Needed by").nextElementSibling).toHaveTextContent(
    "Nov 10",
  );
  expect(within(groups[1]).getByText("Needed by").nextElementSibling).toHaveTextContent(
    "Nov 12",
  );
  expect(screen.queryByText("One payment, 2 shops")).toBeNull();
  expect(screen.getByText("One payment, 2 groups")).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Show the combined receipt" }),
  );
  await screen.findByText("Receipt TEST-DATES");
  const sections = screen.getAllByRole("region", { name: "Shop A on the receipt" });
  expect(sections).toHaveLength(2);
  expect(sections[0]).toHaveTextContent("Needed by Nov 10");
  expect(sections[1]).toHaveTextContent("Needed by Nov 12");
  expect(sections[0]).not.toHaveTextContent("North Press");
});

it("opens the shop's performance page in the admin tree", async () => {
  render(<OrderWorkspace queueHref="/admin/orders" />);
  const south = await screen.findByRole("link", { name: "South Bindery" });
  expect(south).toHaveAttribute("href", "/admin/shop-performance/shop2");
  expect(south).toHaveAttribute("target", "_blank");
  expect(south).toHaveAttribute("rel", "noopener noreferrer");
});

it("uses the looked-up shop name when the projection's name is blank", async () => {
  order = { ...shopA, supplierContact: { shopName: "  ", contactName: null } };
  basket = basketOf([
    order,
    { ...shopB, supplierContact: { shopName: null, contactName: null } },
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path === "/users/shop1") {
        return json({ user: { id: "shop1", name: "Ana", supplierName: "North Press" } });
      }
      if (path === "/users/shop2") {
        return json({
          user: { id: "shop2", name: "Ben", supplierName: "South Bindery" },
        });
      }
      if (path === "/baskets/bsk_1") return json({ basket });
      return json({ order });
    }),
  );
  render(<OrderWorkspace queueHref="/ops/orders" />);
  const a = await screen.findByTestId("group-Shop A");
  expect(await within(a).findByRole("link", { name: "North Press" })).toHaveAttribute(
    "href",
    "/ops/shop-performance/shop1",
  );
  expect(
    within(screen.getByTestId("group-Shop B")).getByRole("link", {
      name: "South Bindery",
    }),
  ).toHaveAttribute("href", "/ops/shop-performance/shop2");
});

it("does not link a group that has no shop yet", async () => {
  basket = basketOf([
    named(shopA, "North Press"),
    { ...shopB, supplierId: null, supplierContact: null },
  ]);
  render(<OrderWorkspace queueHref="/ops/orders" />);
  const b = await screen.findByTestId("group-Shop B");
  expect(within(b).getByText("Shop not assigned yet")).toBeInTheDocument();
  expect(within(b).getByText("Shop B")).toBeInTheDocument();
  expect(
    within(b)
      .getAllByRole("link")
      .some((link) => link.getAttribute("href")?.includes("shop-performance")),
  ).toBe(false);
});

it("shows no trading name on a client or shop payload", async () => {
  const clientSeen = { ...shopA, supplierId: null, supplierContact: undefined };
  const shopSeen = { ...shopB, supplierContact: undefined };
  expect(clientSeen.supplierContact).toBeUndefined();
  expect(shopSeen.supplierContact).toBeUndefined();
  expect(JSON.stringify(clientSeen)).not.toContain("North Press");
  expect(JSON.stringify(shopSeen)).not.toContain("South Bindery");

  order = clientSeen;
  basket = basketOf([clientSeen, { ...shopSeen, supplierId: null }]);
  render(<OrderWorkspace queueHref="/ops/orders" />);
  expect(await screen.findAllByText("Shop not assigned yet")).toHaveLength(2);
  expect(screen.queryByRole("link", { name: "North Press" })).toBeNull();
  expect(screen.queryByRole("link", { name: "South Bindery" })).toBeNull();
  expect(screen.getByText("This is Shop A")).toBeInTheDocument();
  expect(screen.getByTestId("group-Shop B")).toHaveTextContent("Shop B");
});
