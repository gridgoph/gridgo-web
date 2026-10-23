// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Order } from "@/lib/api/types";

const { getPickupChat, getRiderApproach, listCalls } = vi.hoisted(() => ({
  getPickupChat: vi.fn(),
  getRiderApproach: vi.fn(),
  listCalls: vi.fn(),
}));

vi.stubGlobal("React", React);

vi.mock("@/lib/osrm", () => ({
  fetchRoute: vi.fn(async () => ({
    routed: false,
    distanceMetres: 800,
    durationSeconds: 0,
    coordinates: [],
  })),
}));

vi.mock("@/lib/api/supplier-pickup", () => ({
  getPickupChat,
  getRiderApproach,
  listCalls,
  sendPickupMessage: vi.fn(),
  uploadPickupChatImage: vi.fn(),
  startCall: vi.fn(),
  getCall: vi.fn(),
  callAction: vi.fn(),
  sendCallSignal: vi.fn(),
  getCallSignals: vi.fn(),
  getCallIceServers: vi.fn(),
}));

import { ShopPickup } from "@/app/supplier/_components/ShopPickup";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function order(patch: Partial<Order>): Order {
  return {
    id: "job-1",
    clientId: "c1",
    supplierId: "shop",
    riderId: "rider-1",
    state: "rider_assigned",
    title: "Flyers",
    deadline: null,
    address: "Shop",
    createdAt: "2026-10-16T00:00:00.000Z",
    updatedAt: "2026-10-16T00:00:00.000Z",
    ...patch,
  } as Order;
}

describe("ShopPickup", () => {
  it("reports a failed first history load instead of claiming nobody wrote", async () => {
    getPickupChat.mockRejectedValue(new Error("offline"));
    render(
      <ShopPickup
        order={order({
          state: "delivered",
          pickupChat: { status: "read_only", riderFirstName: "Jun" },
        })}
        stopped={false}
        onJobChanged={vi.fn()}
      />,
    );
    expect(await screen.findByText(/Could not load your messages/)).toBeVisible();
    expect(
      screen.queryByText("Nobody wrote during this pickup."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("keeps a delivered conversation read-only and offers no call", async () => {
    getPickupChat.mockResolvedValue({
      chat: {
        status: "read_only",
        unread: 0,
        closesAt: null,
        retentionHours: 24,
        riderFirstName: "Jun",
      },
      messages: [],
    });
    render(
      <ShopPickup
        order={order({
          state: "delivered",
          pickupChat: { status: "read_only", riderFirstName: "Jun" },
        })}
        stopped={false}
        onJobChanged={vi.fn()}
      />,
    );
    expect(
      await screen.findByText("Nobody wrote during this pickup."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Message Jun")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Call Jun/ })).not.toBeInTheDocument();
    expect(getRiderApproach).not.toHaveBeenCalled();
  });

  it("lets an open pickup be written, and drops the approach when sharing stops", async () => {
    getPickupChat.mockResolvedValue({
      chat: {
        status: "open",
        unread: 0,
        closesAt: null,
        retentionHours: 24,
        riderFirstName: "Jun",
      },
      messages: [
        {
          id: "m1",
          senderRole: "rider",
          body: "At the gate",
          createdAt: "2026-10-16T03:00:00.000Z",
          mine: false,
        },
      ],
    });
    getRiderApproach.mockResolvedValue({ ping: null, shop: null, hidden: "picked_up" });
    listCalls.mockResolvedValue([]);
    render(
      <ShopPickup
        order={order({ pickupChat: { status: "open", riderFirstName: "Jun" } })}
        stopped={false}
        onJobChanged={vi.fn()}
      />,
    );
    expect(await screen.findByText("At the gate")).toBeInTheDocument();
    expect(screen.getByLabelText("Message Jun")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Call Jun over the internet" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("rider-approach")).not.toBeInTheDocument();
  });

  it("says a stale position is old, and a missing one has not been shared", async () => {
    getRiderApproach.mockResolvedValue({
      ping: {
        lat: 7.08,
        lng: 125.61,
        at: new Date(Date.now() - 10 * 60_000).toISOString(),
      },
      shop: { lat: 7.07, lng: 125.61 },
      hidden: null,
    });
    render(<ShopPickup order={order({})} stopped={false} onJobChanged={vi.fn()} />);
    expect(await screen.findByText(/was last seen/)).toBeInTheDocument();
    expect(screen.getByText(/stopped sending a location/)).toBeInTheDocument();
  });
});
