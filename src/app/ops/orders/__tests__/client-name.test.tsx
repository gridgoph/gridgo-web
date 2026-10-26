// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { groupOrder } from "@/test/baskets";

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

const mina = groupOrder({
  id: "ord_mina",
  title: "Stickers",
  basketId: null,
  clientName: "Mina Cruz",
});
const missing = groupOrder({
  id: "ord_missing",
  title: "Banners",
  basketId: null,
  clientName: null,
});

beforeEach(() => {
  listOrders.mockResolvedValue([mina, missing]);
});

afterEach(() => {
  cleanup();
  listOrders.mockReset();
});

const table = async () =>
  within(await screen.findByRole("table", { name: "Orders at Payment" }));

it("shows the client's name on the order row, and says when it is missing", async () => {
  render(<OpsOrdersPage />);
  const rows = await table();
  const named = rows.getByText("Stickers").closest("tr")!;
  const unnamed = rows.getByText("Banners").closest("tr")!;
  expect(within(named).getByText("Mina Cruz")).toBeInTheDocument();
  expect(within(named).getByText("Order ord_mina")).toBeInTheDocument();
  expect(within(unnamed).getByText("Unavailable")).toBeInTheDocument();
  expect(within(unnamed).queryByText("Mina Cruz")).toBeNull();
});

it("finds an order by the client's name with the existing search", async () => {
  render(<OpsOrdersPage />);
  await table();
  fireEvent.change(screen.getByRole("searchbox", { name: "Filter orders…" }), {
    target: { value: "mina" },
  });
  const rows = await table();
  expect(rows.getByText("Stickers")).toBeInTheDocument();
  expect(rows.queryByText("Banners")).toBeNull();
  expect(rows.getByText("Mina Cruz")).toBeInTheDocument();
});
