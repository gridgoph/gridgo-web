// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import OpsDispatchPage from "@/app/ops/dispatch/page";
import { setTokenProvider } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";

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

const ready = {
  id: "ord_ready",
  clientId: "client1",
  supplierId: "shop1",
  riderId: null,
  state: "ready_for_dispatch",
  title: "Tarp ready",
  zone: "nearby",
  address: "Lanang",
  totalMinor: 100_000,
  timeline: [],
  updatedAt: "2026-10-31T02:00:00Z",
} as unknown as Order;

let mutations: { path: string; body: unknown }[];

beforeEach(() => {
  vi.stubGlobal("React", React);
  mutations = [];
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://localhost").pathname.replace(
        /^\/api\/gridgo/,
        "",
      );
      const reply = (value: unknown) =>
        new Response(JSON.stringify(value), {
          headers: { "Content-Type": "application/json" },
        });
      if (init?.method === "POST") {
        mutations.push({ path, body: JSON.parse(String(init.body)) });
        return reply({
          order: { ...ready, state: "rider_assigned", riderId: "rider_ana" },
        });
      }
      if (path === "/orders") return reply({ orders: [ready] });
      if (path === "/dispatch/offers") return reply({ offers: [] });
      if (path === "/users") {
        return reply({
          users: [
            {
              id: "rider_ana",
              name: "Ana Rider",
              role: "rider",
              verificationStatus: "approved",
            },
          ],
        });
      }
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    }),
  );
});

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

it("asks which approved rider to assign instead of sending a placeholder rider", async () => {
  render(<OpsDispatchPage />);
  const table = await screen.findByRole("table");
  const row = within(within(table).getByText("Tarp ready").closest("tr")!);
  await userEvent.click(row.getByRole("button", { name: "Assign rider" }));
  expect(mutations).toEqual([]);

  const dialog = await screen.findByRole("dialog", { name: "Assign a rider" });
  await userEvent.click(
    await within(dialog).findByRole("button", { name: "Assign Ana Rider" }),
  );
  expect(mutations).toEqual([
    {
      path: "/orders/ord_ready/transition",
      body: {
        state: "rider_assigned",
        riderId: "rider_ana",
        note: "Rider assigned for pickup",
      },
    },
  ]);
}, 20_000);
