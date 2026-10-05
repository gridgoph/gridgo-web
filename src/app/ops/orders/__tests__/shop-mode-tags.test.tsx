// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";

import { groupOrder, shopA, shopB } from "@/test/baskets";

vi.stubGlobal("React", React);
const listOrders = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  listOrders,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("stage=payment"),
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
const { default: OpsOrdersPage } = await import("@/app/ops/orders/page");

afterEach(() => {
  cleanup();
  listOrders.mockReset();
});

it("tags every order in the queue Single-Shop or Multi-Shop with its shop count", async () => {
  const single = groupOrder({ id: "ord_single", title: "Stickers", basketId: null });
  listOrders.mockResolvedValue([single, shopA, shopB]);
  render(<OpsOrdersPage />);

  const table = within(await screen.findByRole("table", { name: "Orders at Payment" }));
  const row = (title: string) => table.getByText(title).closest("tr")!;
  expect(within(row("Stickers")).getByText("Single-Shop")).toBeInTheDocument();
  expect(within(row("Flyers")).getByText("Multi-Shop, 2 shops")).toBeInTheDocument();
  expect(within(row("Flyers")).getByText(/Shop A of 2/)).toBeInTheDocument();
  expect(
    within(row("Custom apparel")).getByText("Multi-Shop, 2 shops"),
  ).toBeInTheDocument();
  expect(within(row("Custom apparel")).getByText(/Shop B of 2/)).toBeInTheDocument();
});
