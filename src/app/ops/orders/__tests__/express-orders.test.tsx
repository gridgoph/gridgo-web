// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";

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

afterEach(() => {
  cleanup();
  listOrders.mockReset();
});

function orders() {
  return [
    groupOrder({ id: "ord_express", title: "Same-day stickers", basketId: null, express: true }),
    groupOrder({ id: "ord_plain", title: "Calling cards", basketId: null, express: false }),
    // Placed before Express: no field at all, which reads as Standard.
    groupOrder({ id: "ord_old", title: "Old flyers", basketId: null }),
  ];
}

it("tags Express orders in the queue and leaves the rest Standard", async () => {
  listOrders.mockResolvedValue(orders());
  render(<OpsOrdersPage />);

  const table = within(await screen.findByRole("table", { name: "Orders at Payment" }));
  const row = (title: string) => table.getByText(title).closest("tr")!;
  expect(within(row("Same-day stickers")).getByText("Express")).toBeInTheDocument();
  expect(within(row("Calling cards")).getByText("Standard")).toBeInTheDocument();
  expect(within(row("Old flyers")).getByText("Standard")).toBeInTheDocument();
  expect(within(row("Calling cards")).queryByText("Express")).not.toBeInTheDocument();
});

it("filters the queue to Express orders", async () => {
  listOrders.mockResolvedValue(orders());
  render(<OpsOrdersPage />);
  const table = await screen.findByRole("table", { name: "Orders at Payment" });

  // The column header is a sort button with the same name; the filter opens a popover.
  const filter = screen
    .getAllByRole("button", { name: /^Speed/ })
    .find((button) => button.hasAttribute("aria-haspopup"))!;
  fireEvent.click(filter);
  fireEvent.click(await screen.findByRole("button", { name: /^Express\s*1$/ }));

  expect(within(table).getByText("Same-day stickers")).toBeInTheDocument();
  expect(within(table).queryByText("Calling cards")).not.toBeInTheDocument();
  expect(within(table).queryByText("Old flyers")).not.toBeInTheDocument();
});
