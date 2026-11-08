// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Order } from "@/lib/api/types";
import { LiveContext } from "@/lib/live/LiveProvider";
import { NavCountsProvider, useNavCounts } from "@/lib/live/useNavCounts";

/**
 * Review of gridgo-web#294: across GRIDGO's opening and closing, the page's
 * Needs action total and the rail's Orders count move together on one clock,
 * with a connected live stream that sends nothing, and the orders list is not
 * refetched for the clock.
 */

vi.stubGlobal("React", React);
const listOrders = vi.hoisted(() => vi.fn());
const getSettings = vi.hoisted(() => vi.fn());
const listDispatchOffers = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  listOrders,
  getSettings,
  listDispatchOffers,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/ops/orders",
}));
const { default: OpsOrdersPage } = await import("@/app/ops/orders/page");

// Tuesday 10 November 2026: GRIDGO opens 08:00 and closes 17:00 Manila.
const OPENS = Date.parse("2026-11-10T00:00:00Z");
const CLOSES = Date.parse("2026-11-10T09:00:00Z");

const snapshotted = {
  id: "ord_clock",
  title: "Clock banner",
  state: "ready_for_dispatch",
  clientId: "client1",
  quantity: 1,
  totalMinor: 10000,
  timeline: [],
  createdAt: "2026-11-09T00:00:00Z",
  updatedAt: "2026-11-09T00:00:00Z",
} as unknown as Order;

// A stream that is connected and quiet: no invalidation, no fallback polling.
const connected = { live: true, subscribe: () => () => {} } as unknown as React.ContextType<
  typeof LiveContext
>;

function RailProbe() {
  const counts = useNavCounts();
  return <output aria-label="rail">{counts["orders-waiting"] ?? "—"}</output>;
}

function needsAction() {
  return screen.getByRole("button", { name: /Needs action/ }).textContent?.replace(/\D/g, "");
}
function rail() {
  return screen.getByRole("status", { name: "rail" }).textContent;
}

beforeEach(() => {
  vi.useFakeTimers({ now: OPENS - 90_000, shouldAdvanceTime: true });
  listOrders.mockResolvedValue([snapshotted]);
  getSettings.mockResolvedValue({
    operatingHours: {
      timeZone: "Asia/Manila",
      schedule: {
        utcOffsetMinutes: 480,
        week: [1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          opensMinute: 480,
          closesMinute: 1020,
        })),
        closures: [],
      },
      artworkReviewMinutes: 60,
    },
  });
  // The API offers the order only while GRIDGO is open: it snapshots the hours.
  listDispatchOffers.mockImplementation(async () =>
    Date.now() >= OPENS && Date.now() < CLOSES ? [snapshotted] : [],
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("moves the page and the rail together across opening and closing", async () => {
  render(
    <LiveContext.Provider value={connected}>
      <NavCountsProvider sources={["orders-waiting"]} pathname="/ops/orders">
        <RailProbe />
        <OpsOrdersPage />
      </NavCountsProvider>
    </LiveContext.Provider>,
  );

  expect(await screen.findByRole("heading", { name: "Assign rider 0" })).toBeVisible();
  await vi.waitFor(() => expect(rail()).toBe("0"));
  expect(needsAction()).toBe("0");
  expect(screen.getAllByText("Dispatch today, 8:00 AM").length).toBeGreaterThan(0);
  const ordersReads = listOrders.mock.calls.length;

  // GRIDGO opens. Only the offers are read again.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2 * 60_000);
  });
  await vi.waitFor(() => expect(rail()).toBe("1"));
  expect(screen.getByRole("heading", { name: "Assign rider 1" })).toBeVisible();
  expect(needsAction()).toBe("1");

  // GRIDGO closes.
  await act(async () => {
    vi.setSystemTime(CLOSES - 30_000);
    await vi.advanceTimersByTimeAsync(60_000);
  });
  await vi.waitFor(() => expect(rail()).toBe("0"));
  expect(screen.getByRole("heading", { name: "Assign rider 0" })).toBeVisible();
  expect(needsAction()).toBe("0");

  expect(listOrders.mock.calls.length).toBe(ordersReads);
});

it("follows a shop's own dispatch hours inside GRIDGO's, with no order changing", async () => {
  // GRIDGO is open all day. The shop's weekday override closes dispatch from
  // 10:00 to 11:00 Manila; the API's offers say so, nothing else does.
  const shopCloses = OPENS + 2 * 3_600_000;
  const shopOpens = shopCloses + 3_600_000;
  vi.setSystemTime(shopCloses - 90_000);
  listDispatchOffers.mockImplementation(async () =>
    Date.now() >= shopCloses && Date.now() < shopOpens ? [] : [snapshotted],
  );
  listOrders.mockResolvedValue([snapshotted]);

  render(
    <LiveContext.Provider value={connected}>
      <NavCountsProvider sources={["orders-waiting"]} pathname="/ops/orders">
        <RailProbe />
        <OpsOrdersPage />
      </NavCountsProvider>
    </LiveContext.Provider>,
  );
  expect(await screen.findByRole("heading", { name: "Assign rider 1" })).toBeVisible();
  await vi.waitFor(() => expect(rail()).toBe("1"));
  const ordersReads = listOrders.mock.calls.length;

  // The shop closes: out of the group, the stage's waiting count and the rail.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2 * 60_000);
  });
  await vi.waitFor(() => expect(rail()).toBe("0"));
  expect(screen.getByRole("heading", { name: "Assign rider 0" })).toBeVisible();
  expect(needsAction()).toBe("0");
  expect(screen.getByRole("button", { name: /With the shop/ }).textContent).toBe("With the shop1");
  expect(screen.getAllByText("Dispatch when the shop opens").length).toBeGreaterThan(0);

  // The shop opens again.
  await act(async () => {
    vi.setSystemTime(shopOpens - 30_000);
    await vi.advanceTimersByTimeAsync(60_000);
  });
  await vi.waitFor(() => expect(rail()).toBe("1"));
  expect(screen.getByRole("heading", { name: "Assign rider 1" })).toBeVisible();
  expect(listOrders.mock.calls.length).toBe(ordersReads);
});

it("keeps a night-time order the API offers assignable", async () => {
  vi.setSystemTime(OPENS - 4 * 3_600_000); // 04:00 Manila, GRIDGO closed
  listDispatchOffers.mockResolvedValue([snapshotted]); // no hours snapshot: offered
  render(
    <LiveContext.Provider value={connected}>
      <NavCountsProvider sources={["orders-waiting"]} pathname="/ops/orders">
        <RailProbe />
        <OpsOrdersPage />
      </NavCountsProvider>
    </LiveContext.Provider>,
  );
  expect(await screen.findByRole("heading", { name: "Assign rider 1" })).toBeVisible();
  await vi.waitFor(() => expect(rail()).toBe("1"));
});
