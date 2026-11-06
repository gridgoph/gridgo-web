// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";

import { groupOrder } from "@/test/baskets";

vi.stubGlobal("React", React);
const listOrders = vi.hoisted(() => vi.fn());
let search = new URLSearchParams("stage=payment");
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  listOrders,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => search,
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
const { default: OpsOrdersPage } = await import("@/app/ops/orders/page");

afterEach(() => {
  cleanup();
  listOrders.mockReset();
  search = new URLSearchParams("stage=payment");
});

it("tags a sample and a batch from a sample in the Orders queue", async () => {
  listOrders.mockResolvedValue([
    groupOrder({ id: "ord_sample", title: "Flyers sample", basketId: null, orderTags: ["sample"] }),
    groupOrder({ id: "ord_batch", title: "Flyers batch", basketId: null, orderTags: ["batch_from_sample"] }),
    groupOrder({ id: "ord_plain", title: "Stickers", basketId: null }),
  ]);
  render(<OpsOrdersPage />);
  const table = within(await screen.findByRole("table", { name: "Orders at Payment" }));
  const row = (title: string) => table.getByText(title).closest("tr")!;
  expect(within(row("Flyers sample")).getByText("Sample")).toBeInTheDocument();
  expect(within(row("Flyers batch")).getByText("Batch from sample")).toBeInTheDocument();
  expect(within(row("Stickers")).queryByText(/Sample|sample/)).toBeNull();
});

it("opens Needs action for a stage it does not know, never 'Nothing at undefined'", async () => {
  search = new URLSearchParams("stage=all");
  listOrders.mockResolvedValue([]);
  render(<OpsOrdersPage />);
  expect(await screen.findByRole("button", { name: /Needs action/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.queryByText(/undefined/)).toBeNull();
});
