// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
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
  useSearchParams: () => new URLSearchParams("stage=production"),
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
const { default: OpsOrdersPage } = await import("@/app/ops/orders/page");

afterEach(() => {
  cleanup();
  listOrders.mockReset();
});

it("marks each order's receipt scan attached or missing", async () => {
  const inProduction = { basketId: null, state: "production", paymentStatus: "initial_payment_confirmed" };
  listOrders.mockResolvedValue([
    groupOrder({
      id: "ord_scanned",
      title: "Stickers",
      ...inProduction,
      receiptScan: {
        attached: true,
        fileIds: ["file_a"],
        latestFileId: "file_a",
        latestUploadedAt: "2026-11-02T03:00:00.000Z",
      },
    }),
    groupOrder({
      id: "ord_missing",
      title: "Banners",
      ...inProduction,
      receiptScan: { attached: false, fileIds: [], latestFileId: null, latestUploadedAt: null },
    }),
  ]);
  render(<OpsOrdersPage />);

  const table = within(await screen.findByRole("table", { name: "Orders at With the shop" }));
  expect(table.getByRole("columnheader", { name: /Receipt scan/ })).toBeInTheDocument();
  const row = (title: string) => within(table.getByText(title).closest("tr")!);
  expect(row("Stickers").getByLabelText("Receipt scan: attached")).toHaveTextContent("Attached");
  expect(row("Banners").getByLabelText("Receipt scan: missing")).toHaveTextContent("Missing");
});
