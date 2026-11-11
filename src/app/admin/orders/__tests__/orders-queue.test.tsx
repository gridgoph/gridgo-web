// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Order } from "@/lib/api/types";

vi.stubGlobal("React", React);
const listOrders = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  listDispatchOffers: () => new Promise(() => {}),
  listOrders,
  getSettings: () => Promise.resolve({}),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
const { default: AdminOrdersPage } = await import("@/app/admin/orders/page");

function order(id: string, title: string, state: string, extra: Partial<Order> = {}): Order {
  return {
    id,
    title,
    state,
    clientId: "client1",
    quantity: 1,
    totalMinor: 10000,
    timeline: [],
    createdAt: "2026-10-30T00:00:00Z",
    updatedAt: "2026-10-30T00:00:00Z",
    ...extra,
  } as Order;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-31T06:00:00Z") });
  listOrders.mockResolvedValue([
    order("ord_art", "Stickers", "needs_qa"),
    order("ord_shop", "Mugs", "production"),
    order("ord_review", "Finished hats", "supplier_self_qc", {
      supplierId: "shop1",
      handoverFlow: "rider_packs",
      shopHandover: {
        finished: {
          at: "2026-10-29T00:00:00Z",
          by: "shop1",
          supplierId: "shop1",
          photoFileIds: ["file_a"],
        },
        review: null,
      },
    } as Partial<Order>),
  ]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  listOrders.mockReset();
  replace.mockReset();
});

it("shows Super Admin the Operations order queue with every link in /admin", async () => {
  const { container } = render(<AdminOrdersPage />);

  expect(await screen.findByRole("heading", { name: "Check the artwork 1" })).toBeVisible();
  const review = screen.getByRole("region", { name: "Review finished work" });
  expect(
    within(within(review).getByRole("table")).getByRole("button", { name: "Review" }),
  ).toHaveAttribute("href", "/admin/finished-work?order=ord_review");
  const shop = screen.getByRole("table", { name: "Orders at With the shop" });
  expect(within(shop).getByRole("button", { name: "Open" })).toHaveAttribute(
    "href",
    "/admin/orders/ord_shop",
  );

  const hrefs = [...container.querySelectorAll("[href]")].map((el) => el.getAttribute("href"));
  expect(hrefs.length).toBeGreaterThan(0);
  expect(hrefs.filter((href) => href?.startsWith("/ops"))).toEqual([]);

  await userEvent.setup().click(screen.getByRole("button", { name: /Payment/ }));
  expect(replace).toHaveBeenCalledWith("/admin/orders?stage=payment", { scroll: false });
});
