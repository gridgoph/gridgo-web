// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Order } from "@/lib/api/types";

vi.stubGlobal("React", React);
const listOrders = vi.hoisted(() => vi.fn());
const getSettings = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => ({ value: "" }));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  listOrders,
  getSettings,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search.value),
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
const { default: OpsOrdersPage } = await import("@/app/ops/orders/page");

function order(
  id: string,
  title: string,
  state: string,
  extra: Partial<Order> = {},
): Order {
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

const payment = (submittedAt: string) =>
  ({
    payments: {
      downpayment: {
        status: "pending_confirmation",
        amountMinor: 10000,
        method: "qr_manual",
        reference: "REF",
        submittedAt,
        confirmedAt: null,
        confirmedBy: null,
        confirmationSource: null,
      },
    },
  }) as Partial<Order>;

function finished(id: string, title: string, at: string): Order {
  return order(id, title, "supplier_self_qc", {
    supplierId: "shop1",
    handoverFlow: "rider_packs",
    shopHandover: {
      finished: { at, by: "shop1", supplierId: "shop1", photoFileIds: ["file_a"] },
      review: null,
    },
  } as Partial<Order>);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-31T06:00:00Z") });
  search.value = "";
  getSettings.mockResolvedValue({});
  listOrders.mockResolvedValue([
    order("ord_rider", "Banner", "ready_for_dispatch", {
      updatedAt: "2026-10-30T01:00:00Z",
    }),
    order("ord_art", "Stickers", "needs_qa"),
    order("ord_pay_new", "Flyers", "initial_payment_review", payment("2026-10-31T05:00:00Z")),
    order("ord_late", "Posters", "production", { deadline: "2026-10-30T06:00:00Z" }),
    order("ord_pay_old", "Menus", "initial_payment_review", payment("2026-10-30T02:00:00Z")),
    order("ord_shop", "Mugs", "production"),
    order("ord_pin", "Pin cards", "ready_for_dispatch", {
      updatedAt: "2026-10-29T01:00:00Z",
      deliveryPin: {
        change: {
          status: "pending_confirmation",
          payment: {
            submittedAt: "2026-10-31T04:00:00Z",
            proofFileId: "file_p",
            reference: "PIN",
          },
        },
      },
    } as Partial<Order>),
    finished("ord_review", "Finished hats", "2026-10-29T00:00:00Z"),
  ]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  listOrders.mockReset();
});

function group(name: string) {
  return screen.getByRole("region", { name });
}

function titlesIn(region: HTMLElement): string[] {
  const table = within(region).getByRole("table");
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].querySelector("p")?.textContent ?? "");
}

it("opens on the action groups, oldest wait first, and leaves a late job out", async () => {
  render(<OpsOrdersPage />);

  expect(await screen.findByRole("heading", { name: "Confirm payment 3" })).toBeVisible();
  const paymentGroup = group("Confirm payment");
  const paymentTable = within(paymentGroup).getByRole("table", { name: "Confirm payment" });
  expect(titlesIn(paymentGroup)).toEqual(["Menus", "Pin cards", "Flyers"]);
  const pinRow = within(paymentTable).getByText("Pin cards").closest("tr")!;
  expect(pinRow).not.toHaveTextContent("Assign rider");
  expect(within(pinRow).queryByRole("button", { name: "Assign rider" })).not.toBeInTheDocument();

  const artwork = group("Check the artwork");
  expect(within(artwork).getByRole("heading", { name: "Check the artwork 1" })).toBeVisible();
  const files = within(artwork).getByRole("table", {
    name: "Files waiting on your check, oldest first",
  });
  expect(within(files).getByText("Stickers")).toBeInTheDocument();
  expect(within(files).getByRole("button", { name: "Pass" })).toBeInTheDocument();
  expect(within(files).getByRole("button", { name: "Send back" })).toBeInTheDocument();
  expect(screen.getAllByRole("table").filter((table) => within(table).queryByText("Stickers"))).toHaveLength(1);

  const review = group("Review finished work");
  expect(within(review).getByRole("heading", { name: "Review finished work 1" })).toBeVisible();
  expect(titlesIn(review)).toEqual(["Finished hats"]);
  expect(
    within(within(review).getByRole("table")).getByRole("button", { name: "Review" }),
  ).toHaveAttribute("href", "/ops/finished-work?order=ord_review");

  const rider = group("Assign rider");
  expect(within(rider).getByRole("heading", { name: "Assign rider 1" })).toBeVisible();
  expect(titlesIn(rider)).toEqual(["Banner"]);
  expect(
    within(within(rider).getByRole("table")).getByRole("button", { name: "Assign rider" }),
  ).toBeInTheDocument();

  const shop = screen.getByRole("table", { name: "Orders at With the shop" });
  expect(within(shop).getByText("Posters")).toBeInTheDocument();
  expect(within(shop).getByText("Mugs")).toBeInTheDocument();
  expect(within(shop).queryByText("Banner")).not.toBeInTheDocument();
  expect(within(shop).queryByText("Finished hats")).not.toBeInTheDocument();

  expect(screen.getByRole("button", { name: /Needs action/ })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: /Needs action/ })).toHaveTextContent("6");
});

it("still opens a stage when the link names one", async () => {
  search.value = "stage=payment";
  render(<OpsOrdersPage />);
  const table = await screen.findByRole("table", { name: "Orders at Payment" });
  expect(within(table).getByText("Menus")).toBeInTheDocument();
  expect(within(table).getByText("Flyers")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Confirm payment" })).not.toBeInTheDocument();
});
