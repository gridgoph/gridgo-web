// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-31T06:00:00Z") });
  search.value = "";
  getSettings.mockResolvedValue({});
  listOrders.mockResolvedValue([
    order("ord_rider", "Banner", "ready_for_dispatch", {
      readyAt: "2026-10-31T01:00:00Z",
    }),
    order("ord_art", "Stickers", "needs_qa", {
      fileCheck: { status: "pending", requestedAt: "2026-10-31T03:00:00Z" },
    } as Partial<Order>),
    order(
      "ord_pay_new",
      "Flyers",
      "initial_payment_review",
      payment("2026-10-31T05:00:00Z"),
    ),
    order("ord_late", "Posters", "production", { deadline: "2026-10-30T06:00:00Z" }),
    order(
      "ord_pay_old",
      "Menus",
      "initial_payment_review",
      payment("2026-10-31T02:00:00Z"),
    ),
    order("ord_shop", "Mugs", "production"),
  ]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  listOrders.mockReset();
});

it("opens on the orders waiting on you, grouped by the action and oldest first", async () => {
  render(<OpsOrdersPage />);

  const table = await screen.findByRole("table", { name: "Orders waiting on you" });
  const titles = within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[1].querySelector("p")?.textContent);
  expect(titles).toEqual(["Menus", "Flyers", "Stickers", "Banner", "Posters"]);

  const actions = within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
  expect(actions).toEqual([
    "Confirm payment",
    "Confirm payment",
    "Check artwork",
    "Assign rider",
    "Late",
  ]);
  // An order with the shop and on time owes nothing.
  expect(within(table).queryByText("Mugs")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Needs action/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("counts each action at the top", async () => {
  render(<OpsOrdersPage />);
  const counts = within(await screen.findByRole("region", { name: "Waiting on you" }));
  const figure = (label: string) =>
    counts.getByText(label).parentElement?.querySelector("[data-slot=stat-value]")
      ?.textContent;
  expect(figure("Confirm payment")).toBe("2");
  expect(figure("Check artwork")).toBe("1");
  expect(figure("Assign rider")).toBe("1");
  expect(figure("Late")).toBe("1");
  // The rail chip carries the total.
  expect(screen.getByRole("button", { name: /Needs action/ })).toHaveTextContent("5");
});

it("still opens a stage when the link names one", async () => {
  search.value = "stage=payment";
  render(<OpsOrdersPage />);
  expect(
    await screen.findByRole("table", { name: "Orders at Payment" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("table", { name: "Orders waiting on you" }),
  ).not.toBeInTheDocument();
});

it("keeps the tab total, the counts and the rows on one clock as a deadline passes", async () => {
  vi.useRealTimers();
  vi.useFakeTimers({
    toFake: ["Date", "setInterval", "clearInterval"],
    now: new Date("2026-10-31T06:00:00Z"),
  });
  listOrders.mockResolvedValue([
    order("ord_soon", "Posters", "production", { deadline: "2026-10-31T06:00:10Z" }),
  ]);
  render(<OpsOrdersPage />);
  const tab = await screen.findByRole("button", { name: /Needs action/ });
  expect(tab).toHaveTextContent("0");

  await act(async () => {
    vi.advanceTimersByTime(30_000);
  });

  const counts = within(screen.getByRole("region", { name: "Waiting on you" }));
  expect(
    counts.getByText("Late").parentElement?.querySelector("[data-slot=stat-value]")
      ?.textContent,
  ).toBe("1");
  const table = screen.getByRole("table", { name: "Orders waiting on you" });
  expect(within(table).getByText("Posters")).toBeInTheDocument();
  expect(tab).toHaveTextContent("1");
});
