// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OrderMeta } from "@/components/orders/OrderMeta";
import capturedTiming from "./fixtures/client-promise-ord_85170002308f.json";
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
// Timing fields captured read-only from GET /orders/ord_85170002308f on
// 2026-10-30 (gg-full-order-1030/run-steps.json); no sign-in or live mutation.
const captured: Partial<Order> = capturedTiming;
let order: Order;
const DateTimeFormat = Intl.DateTimeFormat;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
    (locale, options) =>
      new DateTimeFormat(locale, { ...options, timeZone: "Asia/Manila" }),
  );
  order = { ...base, ...captured };
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["/ops/orders", "/admin/orders"])(
  "renders the captured order's client promise and separate shop deadline in %s",
  async (queueHref) => {
    render(<OrderWorkspace queueHref={queueHref} />);
    const promise = await screen.findByText("Client was promised Nov 2, 2026, 10:00 AM");
    const delivery = promise.closest("section")!;
    expect(
      within(delivery).getByText("Shop ready by Oct 31, 2026, 9:00 AM"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Client was promised Oct 31, 2026, 9:00 AM"),
    ).not.toBeInTheDocument();
  },
);

it.each([undefined, null])(
  "keeps readyBy honestly labelled when promiseBy is %s",
  async (promiseBy) => {
    order = { ...order, promiseBy };
    render(<OrderWorkspace queueHref="/ops/orders" />);
    await screen.findByText("Shop ready by Oct 31, 2026, 9:00 AM");
    expect(screen.queryByText(/Client was promised/)).not.toBeInTheDocument();
  },
);

it("uses the client promise in staff metadata and names the internal deadline separately", () => {
  render(<OrderMeta order={order} />);
  expect(screen.getByText("Client was promised").parentElement).toHaveTextContent(
    "Nov 2, 2026, 10:00 AM",
  );
  expect(screen.getByText("Shop ready by").parentElement).toHaveTextContent(
    "Oct 31, 2026, 9:00 AM",
  );
});

it("never presents jobDetails.promisedDate as a client promise on the shop surface", () => {
  render(
    <OrderMeta
      order={{ ...order, promiseBy: undefined, readyBy: undefined }}
      fromJobDetails
    />,
  );
  expect(screen.getByText("Shop ready by").parentElement).toHaveTextContent(
    "Oct 31, 2026, 9:00 AM",
  );
  expect(screen.queryByText(/Promised|Client was promised/)).not.toBeInTheDocument();
});

it("retains an honestly named legacy metadata date without promiseBy or readyBy", () => {
  render(
    <OrderMeta
      order={{
        ...order,
        promiseBy: undefined,
        readyBy: undefined,
        promisedDate: capturedTiming.readyBy,
      }}
    />,
  );
  expect(screen.getByText("Scheduled date (legacy)").parentElement).toHaveTextContent(
    "Oct 31, 2026, 9:00 AM",
  );
  expect(screen.queryByText(/Client was promised/)).not.toBeInTheDocument();
});
