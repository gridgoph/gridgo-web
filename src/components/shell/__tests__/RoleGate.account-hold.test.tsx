// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import React, { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RoleGate } from "@/components/shell/RoleGate";
import { listOrders } from "@/lib/api/client";
import type { PortalRole } from "@/lib/api/types";

/**
 * gridgoph/gridgo-web#73: a Super Admin suspends or removes an account while
 * that person has the portal open. `/auth/me` was read at load and still says
 * active, so the hold has to come from the projection re-check. These tests
 * drive the real API client against a stubbed `fetch`, with a shell stand-in
 * that reads `/orders` on mount and on a polling cadence.
 */

const { authState, pathnameRef } = vi.hoisted(() => ({
  authState: {
    revision: 1,
    user: {
      id: "user_ana",
      email: "ana@gridgo.test",
      name: "Ana Reyes",
      role: "ops_admin",
      accountStatus: "active",
      accountStatusReason: null as string | null,
    },
    memberships: [{ role: "supplier" }, { role: "ops_admin" }, { role: "super_admin" }],
    status: "mapped",
    loading: false,
    signOut: vi.fn(),
    refresh: vi.fn(),
  },
  pathnameRef: { current: "/ops/overview" },
}));

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => {
  const router = { replace: vi.fn() };
  return { usePathname: () => pathnameRef.current, useRouter: () => router };
});

vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => authState }));

const POLL_MS = 30_000;

vi.mock("@/components/shell/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => {
    useEffect(() => {
      const read = () => void listOrders().catch(() => undefined);
      read();
      const interval = setInterval(read, POLL_MS);
      return () => clearInterval(interval);
    }, []);
    return <div data-testid="portal-shell">{children}</div>;
  },
}));

type Standing = { accountStatus: "active" | "suspended" | "removed"; reason?: string };

function roleProjection(role: PortalRole, standing: Standing) {
  const base = {
    user: {
      id: "user_ana",
      email: "ana@gridgo.test",
      name: "Ana Reyes",
      createdAt: "2026-09-01T00:00:00.000Z",
      accountStatus: standing.accountStatus,
      accountStatusReason: standing.reason ?? null,
      accountStatusAt: standing.reason ? "2026-09-27T00:00:00.000Z" : null,
    },
    membership: { role },
    capabilities: {},
  };
  if (role !== "supplier") return base;
  return {
    ...base,
    supplierProfile: null,
    approvalCase: null,
    readiness: { readyForApproval: false, missing: [] },
  };
}

const PROJECTION_PATH: Record<PortalRole, string> = {
  supplier: "/auth/me/supplier",
  ops_admin: "/auth/me/ops",
  super_admin: "/auth/me/admin",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock =
  vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
let projections: unknown[] = [];
let ordersResponse: () => Response = () => json(200, { orders: [] });

function pathOf(input: RequestInfo | URL): string {
  return new URL(String(input), "http://api.test").pathname;
}

function callsTo(path: string): number {
  return fetchMock.mock.calls.filter(([input]) => pathOf(input) === path).length;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  projections = [];
  ordersResponse = () => json(200, { orders: [] });
  fetchMock.mockImplementation(async (input) => {
    const path = pathOf(input);
    if (Object.values(PROJECTION_PATH).includes(path)) {
      const next = projections.length > 1 ? projections.shift() : projections[0];
      return json(200, next);
    }
    if (path === "/orders") return ordersResponse();
    return json(404, { error: "not_found" });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  fetchMock.mockReset();
  pathnameRef.current = "/ops/overview";
});

describe("RoleGate account hold mid-session (#73)", () => {
  it.each([
    ["ops_admin", "account_suspended", "suspended", "This account is suspended."],
    ["super_admin", "account_removed", "removed", "This account has been removed."],
    ["supplier", "account_suspended", "suspended", "This account is suspended."],
  ] as const)(
    "closes the %s workspace when a read answers 403 %s",
    async (role, code, accountStatus, heading) => {
      projections = [
        roleProjection(role, { accountStatus: "active" }),
        roleProjection(role, { accountStatus, reason: "Left the company" }),
      ];

      render(
        <RoleGate allow={role}>
          <p>Workspace</p>
        </RoleGate>,
      );
      expect(await screen.findByText("Workspace")).toBeVisible();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(callsTo("/orders")).toBe(1);

      // A Super Admin holds the account; the next read is refused with its code.
      ordersResponse = () =>
        json(403, { error: code, message: "Account held", reason: "Left the company" });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });

      expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
      expect(screen.getByText("Left the company")).toBeVisible();
      expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
      expect(screen.queryByTestId("portal-shell")).not.toBeInTheDocument();
      expect(callsTo(PROJECTION_PATH[role])).toBe(2);

      // The shell is gone, so nothing keeps reading.
      const ordersAtNotice = callsTo("/orders");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS * 3);
      });
      expect(callsTo("/orders")).toBe(ordersAtNotice);
    },
  );

  it("shows the hold from the projection on the next navigation", async () => {
    projections = [
      roleProjection("ops_admin", { accountStatus: "active" }),
      roleProjection("ops_admin", { accountStatus: "suspended", reason: "Under review" }),
    ];

    const { rerender } = render(
      <RoleGate allow="ops_admin">
        <p>Workspace</p>
      </RoleGate>,
    );
    expect(await screen.findByText("Workspace")).toBeVisible();

    pathnameRef.current = "/ops/orders";
    rerender(
      <RoleGate allow="ops_admin">
        <p>Workspace</p>
      </RoleGate>,
    );

    expect(
      await screen.findByRole("heading", { name: "This account is suspended." }),
    ).toBeVisible();
    expect(screen.getByText("Under review")).toBeVisible();
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
  });

  it("leaves Operations in its workspace on a plain 403", async () => {
    projections = [roleProjection("ops_admin", { accountStatus: "active" })];
    ordersResponse = () => json(403, { error: "forbidden" });

    render(
      <RoleGate allow="ops_admin">
        <p>Workspace</p>
      </RoleGate>,
    );
    expect(await screen.findByText("Workspace")).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    });

    expect(callsTo("/orders")).toBe(3);
    expect(callsTo("/auth/me/ops")).toBe(1);
    expect(screen.getByTestId("portal-shell")).toBeVisible();
  });
});
