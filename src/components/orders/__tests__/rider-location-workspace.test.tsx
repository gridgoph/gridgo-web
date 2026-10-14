// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import type { LocationDiagnostics, Order } from "@/lib/api/types";

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
  createdAt: "2026-10-15T07:00:00Z",
  updatedAt: "2026-10-15T07:00:00Z",
  timeline: [],
};

const NOW = Date.now();
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

function diagnosticsFor(ageSeconds: number, stale: boolean): LocationDiagnostics {
  return {
    orderId: "order1",
    riderId: "rider1",
    lastUpdatedAt: ago(ageSeconds),
    ageSeconds,
    stale,
    sampleLimit: 100,
    sampleCount: 3,
    maxReceiveGapSeconds: 200,
    secondsSinceLastReceived: ageSeconds,
    samples: [
      { at: ago(500), receivedAt: ago(499), processedAt: null, receiveGapSeconds: null, sourceDelaySeconds: 1 },
      { at: ago(485), receivedAt: ago(484), processedAt: null, receiveGapSeconds: 15, sourceDelaySeconds: 1 },
      { at: ago(ageSeconds + 1), receivedAt: ago(ageSeconds), processedAt: null, receiveGapSeconds: 200, sourceDelaySeconds: 1 },
    ],
  };
}

let order: Order;
let diagnostics: LocationDiagnostics;
const calls: string[] = [];

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  order = base;
  calls.length = 0;
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/location-diagnostics")) return json(diagnostics);
      if (url.endsWith("/settings")) {
        return json({ version: 3, riderLocationRefreshIntervalSeconds: 20, riderLocationStaleAfterSeconds: 120 });
      }
      if (url.includes("/users/rider1")) {
        return json({ user: { id: "rider1", name: "Ramon", role: "rider", email: "r@x", phone: "09175550101" } });
      }
      return json({ order });
    }),
  );
});
afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

it("flags a stale rider on the order, opens the row, and offers Call and Message", async () => {
  diagnostics = diagnosticsFor(300, true);
  render(<OrderWorkspace queueHref="/ops/orders" />);
  const heading = await screen.findByText("Rider location");
  const row = heading.closest("section")!;
  await waitFor(() =>
    expect(row).toHaveTextContent("No update for 5 min. Contact the rider."),
  );
  // Opened on its own: the panel is showing.
  expect(await within(row).findByText(/Rider location temporarily unavailable/)).toBeInTheDocument();
  expect(within(row).getByText("Your call")).toBeInTheDocument();
  await waitFor(() =>
    expect(within(row).getByRole("link", { name: /Call Ramon/ })).toHaveAttribute(
      "href",
      "tel:09175550101",
    ),
  );
  expect(within(row).getByRole("link", { name: "Message Ramon" })).toHaveAttribute(
    "href",
    "/ops/chat?with=rider1&role=rider",
  );
  // The gaps, with the long one counted against the 2-minute threshold.
  expect(within(row).getByText("Gaps over 2 minutes").nextElementSibling).toHaveTextContent("1");
  expect(within(row).getByText("Longest gap").nextElementSibling).toHaveTextContent("3 min");
  expect(within(row).getByTestId("gap-strip").children).toHaveLength(3);
  expect(calls.some((url) => url.endsWith("/ops/orders/order1/location-diagnostics"))).toBe(true);
});

it("reads live without asking anyone to call", async () => {
  diagnostics = diagnosticsFor(10, false);
  render(<OrderWorkspace queueHref="/admin/orders" />);
  const heading = await screen.findByText("Rider location");
  const row = heading.closest("section")!;
  await waitFor(() => expect(row).toHaveTextContent(/Live, last update/));
  expect(within(row).queryByText("Your call")).toBeNull();
  fireEvent.click(heading);
  expect(await within(row).findByRole("link", { name: "Message Ramon" })).toHaveAttribute(
    "href",
    "/admin/chat?with=rider1&role=rider",
  );
});

it("keeps the gaps to look back on after delivery, without contact actions", async () => {
  order = { ...base, state: "issue_window_open" };
  diagnostics = diagnosticsFor(4000, true);
  render(<OrderWorkspace queueHref="/ops/orders" />);
  const heading = await screen.findByText("Rider location");
  const row = heading.closest("section")!;
  await waitFor(() =>
    expect(row).toHaveTextContent("Tracking ended. 3 locations received, longest gap 3 min."),
  );
  fireEvent.click(heading);
  await within(row).findByText("Location gaps");
  expect(within(row).queryByRole("link", { name: /Message/ })).toBeNull();
});

it("shows no row for an order without a rider", async () => {
  order = { ...base, riderId: null, state: "ready_for_dispatch" } as unknown as Order;
  diagnostics = diagnosticsFor(10, false);
  render(<OrderWorkspace queueHref="/ops/orders" />);
  await screen.findByText("Flyers", { selector: "h1" });
  expect(screen.queryByText("Rider location")).toBeNull();
  expect(calls.some((url) => url.includes("location-diagnostics"))).toBe(false);
});
