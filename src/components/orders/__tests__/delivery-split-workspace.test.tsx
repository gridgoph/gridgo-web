// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MoneyBreakdown } from "@/components/orders/MoneyBreakdown";
import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "order1" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/components/orders/EvidencePreview", () => ({
  EvidencePlate: () => null,
  EvidenceStrip: () => null,
}));
vi.mock("@/components/orders/ReceiptReferenceOcr", () => ({
  ReceiptReferenceOcr: () => null,
}));

const base: Order = {
  id: "order1",
  clientId: "client1",
  supplierId: "shop1",
  riderId: "rider1",
  state: "out_for_delivery",
  title: "Flyers",
  quantity: 2,
  size: "A4",
  material: "Paper",
  deadline: null,
  address: "Davao",
  supplierPriceMinor: 100000,
  supplierSubtotalMinor: 100000,
  serviceFeeRateBps: 1000,
  serviceFeeMinor: 10000,
  subtotalMinor: 110000,
  totalMinor: 112500,
  deliveryFeeMinor: 2500,
  paymentMethod: "qr_manual",
  paymentStatus: "unpaid",
  promisedDate: null,
  artworkName: null,
  createdAt: "2026-09-15T10:00:00Z",
  updatedAt: "2026-09-15T10:00:00Z",
  timeline: [],
};
const split = {
  riderCommissionBps: 8500,
  riderPayoutMinor: 2125,
  platformDeliveryShareMinor: 375,
};

let order: Order;
beforeEach(() => {
  vi.stubGlobal("React", React);
  order = base;
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ order }), {
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
});
afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});
const moneyRow = (label: string) =>
  screen.getByText(label, { selector: "dt" }).nextElementSibling;

it("shows the gross delivery fee with the rider's payout and GRIDGO's share on the workspace", async () => {
  order = { ...base, ...split };
  render(<OrderWorkspace queueHref="/ops/orders" />);
  await screen.findByText("Rider payout (85%)", { selector: "dt" });
  expect(moneyRow("Delivery")).toHaveTextContent("₱25.00");
  expect(moneyRow("Rider payout (85%)")).toHaveTextContent("₱21.25");
  expect(moneyRow("GRIDGO delivery share (15%)")).toHaveTextContent("₱3.75");
});

it("shows only the gross fee against an API without the split", async () => {
  render(<OrderWorkspace queueHref="/ops/orders" />);
  await screen.findByText("Delivery", { selector: "dt" });
  expect(moneyRow("Delivery")).toHaveTextContent("₱25.00");
  expect(screen.queryByText(/Rider payout/)).toBeNull();
  expect(screen.queryByText(/GRIDGO delivery share/)).toBeNull();
});

it("puts the same split in the full money breakdown", () => {
  render(<MoneyBreakdown order={{ ...base, ...split }} />);
  expect(screen.getByText("Rider payout (85%)").closest("div")).toHaveTextContent(
    "₱21.25",
  );
  expect(
    screen.getByText("GRIDGO delivery share (15%)").closest("div"),
  ).toHaveTextContent("₱3.75");
});

it("leaves the breakdown's delivery line whole when there is no split", () => {
  render(<MoneyBreakdown order={base} />);
  expect(screen.queryByText(/Rider payout/)).toBeNull();
});
