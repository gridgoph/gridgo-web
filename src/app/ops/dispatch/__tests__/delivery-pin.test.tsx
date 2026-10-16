// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OpsDispatchPage from "@/app/ops/dispatch/page";
import { setTokenProvider } from "@/lib/api/client";
import type { DeliveryPin, Order } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/components/riders/useRiderLocations", () => ({
  useRiderLocations: () => ({
    riders: [],
    error: null,
    loading: false,
    tracking: { refreshIntervalSeconds: 20, staleAfterSeconds: 120 },
    nowMs: Date.now(),
    view: () => ({}),
    reload: async () => {},
  }),
}));

const POINT = { lat: 7.1, lng: 125.62, label: "Lanang, blue gate" };

function pin(patch: Partial<DeliveryPin> = {}): DeliveryPin {
  return {
    version: 2,
    status: "confirmed",
    requestedAt: "2026-10-15T06:00:00.000Z",
    confirmedAt: "2026-10-15T06:05:00.000Z",
    point: POINT,
    zone: "nearby",
    notes: "Blue gate beside the pharmacy",
    receiverName: "Alex",
    changeUsed: false,
    canConfirm: true,
    canChange: true,
    original: POINT,
    change: null,
    ...patch,
  };
}

function order(id: string, deliveryPin: DeliveryPin | null): Order {
  return {
    id,
    clientId: "client1",
    supplierId: "shop1",
    riderId: null,
    state: "ready_for_dispatch",
    title: `Tarp ${id}`,
    zone: "nearby",
    address: POINT.label,
    deliveryFeeMinor: 5_000,
    totalMinor: 100_000,
    timeline: [],
    updatedAt: "2026-10-15T06:20:00Z",
    deliveryPin,
  } as unknown as Order;
}

let orders: Order[];

beforeEach(() => {
  vi.stubGlobal("React", React);
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), "http://localhost").pathname.replace(
        /^\/api\/gridgo/,
        "",
      );
      const reply = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (path === "/orders") return reply({ orders });
      if (path === "/dispatch/offers") return reply({ offers: [] });
      if (path === "/users") return reply({ users: [] });
      return reply({ error: "not_found" }, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

describe("the dispatch board's delivery pin", { timeout: 20_000 }, () => {
  it("shows the confirmation, receiver and notes, and holds dispatch while a pin payment waits", async () => {
    orders = [
      order("confirmed1", pin()),
      order(
        "held1",
        pin({
          status: "pending",
          confirmedAt: null,
          canChange: false,
          change: {
            id: "pin_1",
            status: "pending_confirmation",
            point: { lat: 7.13, lng: 125.6, label: "Main entrance" },
            zone: "away",
            distanceMeters: 7_400,
            deliveryFeeMinor: 11_000,
            feeDifferenceMinor: 6_000,
            createdAt: "2026-10-15T06:10:00.000Z",
            payment: {
              proofFileId: "file_p",
              reference: "WALLET-123",
              submittedAt: "2026-10-15T06:20:00.000Z",
            },
          },
        }),
      ),
      order("legacy1", null),
    ];
    render(<OpsDispatchPage />);

    const table = await screen.findByRole("table");
    const confirmedRow = within(table).getByText("Tarp confirmed1").closest("tr")!;
    expect(within(confirmedRow).getByText("Client confirmed")).toBeInTheDocument();
    expect(within(confirmedRow).getByText("Receiver: Alex")).toBeInTheDocument();
    expect(
      within(confirmedRow).getByText("Notes: Blue gate beside the pharmacy"),
    ).toBeInTheDocument();
    expect(within(confirmedRow).getByRole("button", { name: "Assign rider" })).toBeEnabled();

    const heldRow = within(table).getByText("Tarp held1").closest("tr")!;
    expect(within(heldRow).getByText("Payment to verify")).toBeInTheDocument();
    expect(
      within(heldRow).getByRole("link", { name: /Dispatch held/ }),
    ).toHaveAttribute("href", "/ops/orders/held1");
    expect(
      within(heldRow).getByRole("button", {
        name: "Assign rider (verify the pin payment first)",
      }),
    ).toBeDisabled();

    const legacyRow = within(table).getByText("Tarp legacy1").closest("tr")!;
    expect(within(legacyRow).getByText("No pin check")).toBeInTheDocument();
  });
});
