// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import React, { StrictMode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import AdminOverviewPage from "@/app/admin/overview/page";
import { setTokenProvider } from "@/lib/api/client";
import { NavCountsProvider, useNavCounts } from "@/lib/live/useNavCounts";
import { LiveContext, type LiveContextValue } from "@/lib/live/LiveProvider";
import type { InvalidatePing } from "@/lib/api/types";

vi.stubGlobal("React", React);

const ok = (body: unknown) => new Response(JSON.stringify(body));
const order = (clientId: string, id = clientId) => ({
  id,
  clientId,
  state: "completed",
  supplierId: "shop",
  riderId: "rider",
});

function Badges() {
  const counts = useNavCounts();
  return <span>Signups: {counts["signups-waiting"]}</span>;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/admin/overview");
  setTokenProvider(() => "account-a");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
  vi.stubGlobal("React", React);
});

it.each([true, false])("shares each live/fallback refresh batch (connected: %s)", async (connected) => {
  vi.useFakeTimers();
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = new URL(url, window.location.origin).pathname;
    calls.push(path);
    if (path.endsWith("/orders")) return ok({ orders: [] });
    if (path.endsWith("/users")) return ok({ users: [] });
    if (path.endsWith("/settings")) return ok({});
    if (path.endsWith("/dispatch/offers")) return ok({ orders: [] });
    throw new Error(`Unexpected request: ${url}`);
  }));
  const listeners = new Set<(ping: InvalidatePing) => void>();
  const live: LiveContextValue = {
    live: connected, notifications: [], unreadCount: 0, snapshot: null,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    markRead: async () => {}, markAllRead: async () => {}, remove: async () => {}, refreshInbox: async () => {},
  };
  await act(async () => {
    render(<LiveContext.Provider value={live}>
      <NavCountsProvider sources={["orders-waiting"]} pathname="/admin/overview">
        <AdminOverviewPage />
      </NavCountsProvider>
    </LiveContext.Provider>);
  });
  expect(calls.filter((path) => path.endsWith("/orders"))).toHaveLength(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  if (connected) {
    const ping: InvalidatePing = { resource: "orders" };
    for (const listener of listeners) { listener(ping); listener(ping); }
    await act(async () => { await vi.advanceTimersByTimeAsync(299); });
    expect(calls.filter((path) => path.endsWith("/orders"))).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  } else {
    await act(async () => { await vi.advanceTimersByTimeAsync(29_998); });
    expect(calls.filter((path) => path.endsWith("/orders"))).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  }
  expect(calls.filter((path) => path.endsWith("/orders"))).toHaveLength(2);
  expect(screen.getByText("No orders in the store.")).toBeInTheDocument();
});

it("shares orders and role-filtered directories between the badges and overview on mount", async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const parsed = new URL(url, window.location.origin);
      const pathname = parsed.pathname.replace(/^\/api\/gridgo/, "");
      const search = parsed.search;
      calls.push(pathname + search);
      if (pathname === "/orders") return ok({ orders: [order("client")] });
      if (pathname === "/users") return ok({ users: [] });
      if (pathname === "/approval-cases") return ok({ approvalCases: [] });
      if (pathname === "/credits/balance")
        return ok({ clientId: "client", balanceMinor: 12300, ledger: [] });
      if (pathname === "/settings") return ok({});
      if (pathname === "/dispatch/offers") return ok({ orders: [] });
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
  render(
    <StrictMode>
      <NavCountsProvider
        sources={["signups-waiting", "orders-waiting"]}
        pathname="/admin/overview"
      >
        <Badges />
        <AdminOverviewPage />
      </NavCountsProvider>
    </StrictMode>,
  );
  await screen.findByText("Signups: 0");
  await screen.findByText("Across 1 client ledger");
  for (const key of [
    "/orders",
    "/users?role=supplier",
    "/users?role=rider",
    "/users?role=client",
  ]) {
    expect(
      calls.filter((path) => path === key),
      key,
    ).toHaveLength(1);
  }
});

it("loads distinct client credits concurrently with a bound, preserving totals, grant counts and order", async () => {
  const clients = Array.from({ length: 9 }, (_, i) => `client-${i}`);
  const pending: { clientId: string; resolve: (response: Response) => void }[] = [];
  let active = 0;
  let peak = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const { pathname, searchParams } = new URL(url, window.location.origin);
      if (pathname.endsWith("/orders"))
        return ok({
          orders: [...clients.map((id) => order(id)), order(clients[0], "repeat")],
        });
      if (pathname.endsWith("/users"))
        return ok({ users: clients.map((id) => ({ id, name: id })) });
      if (pathname.endsWith("/credits/balance")) {
        const clientId = searchParams.get("clientId")!;
        active += 1;
        peak = Math.max(peak, active);
        return new Promise<Response>((resolve) =>
          pending.push({
            clientId,
            resolve: (response) => {
              active -= 1;
              resolve(response);
            },
          }),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
  render(<AdminOverviewPage />);
  await waitFor(() => expect(pending.length).toBeGreaterThan(1));
  expect(pending.length).toBeLessThanOrEqual(4);
  const seen: string[] = [];
  while (seen.length < clients.length) {
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));
    // Complete each batch backwards to catch accidentally reordered rows.
    const batch = pending.splice(0).reverse();
    for (const entry of batch) {
      seen.push(entry.clientId);
      entry.resolve(
        entry.clientId === "client-3"
          ? new Response(JSON.stringify({ error: "no_ledger" }), { status: 404 })
          : ok({
              clientId: entry.clientId,
              balanceMinor: 10000,
              ledger: [{ id: "g1" }, { id: "g2" }],
            }),
      );
    }
  }
  await screen.findByText("Across 8 client ledgers");
  expect(screen.getAllByText("₱800.00")).toHaveLength(1);
  expect(screen.getAllByText("2 grants on record")).toHaveLength(8);
  expect(peak).toBeLessThanOrEqual(4);
  expect(new Set(seen).size).toBe(9);
  const creditList = screen.getByRole("heading", {
    name: "Pilot Credit positions",
  }).parentElement!;
  expect(
    [...creditList.querySelectorAll("li > div > p:first-child")].map(
      (node) => node.textContent,
    ),
  ).toEqual(clients.filter((id) => id !== "client-3"));
});
