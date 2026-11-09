// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RoleGate, SHOP_REMOVED_LOGIN } from "@/components/shell/RoleGate";
import { PENDING_RECHECK_MS } from "@/components/shop-team/ShopAccessNotices";
import { listJobs } from "@/lib/api/client";
import { useShopAccess } from "@/lib/auth/shop-access";

/**
 * Shop Owner and Staff logins (gridgo-api docs/SHOP_TEAM_API.md): the
 * supplier projection's `shop` decides Staff mode, a pending person waits
 * outside the work shell, and a removed person's session ends.
 */

const { authState } = vi.hoisted(() => ({
  authState: {
    revision: 1,
    user: { id: "user_sam", email: "sam@example.com", name: "Sam Santos", role: "supplier" },
    memberships: [{ role: "supplier" }] as Array<{ role: string }>,
    status: "mapped" as string,
    accessError: null as string | null,
    loading: false,
    signOut: vi.fn(),
    refresh: vi.fn(),
  },
}));

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => {
  const router = { replace: vi.fn() };
  return { usePathname: () => "/supplier/jobs", useRouter: () => router };
});

vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => authState }));

vi.mock("@/components/shell/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => {
    const access = useShopAccess();
    React.useEffect(() => {
      void listJobs().catch(() => undefined);
    }, []);
    return (
      <div data-testid="supplier-shell" data-staff={String(access.staff)}>
        {access.shop?.name}
        {children}
      </div>
    );
  },
}));

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const shop = (status: string, role = "staff") => ({
  id: "user_owner",
  name: "Blueprint Print Co.",
  role,
  status,
});

function bootstrap(status: string, role = "staff") {
  return {
    user: { id: "user_sam", name: "Sam Santos", role: "supplier" },
    shop: shop(status, role),
    memberships: [{ role: "supplier" }],
    approvalCases: [],
  };
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
let projections: Array<() => Response> = [];

function pathOf(input: RequestInfo | URL): string {
  return new URL(String(input), "http://api.test").pathname;
}
const callsTo = (path: string) =>
  fetchMock.mock.calls.filter(([input]) => pathOf(input) === path).length;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  projections = [];
  fetchMock.mockImplementation(async (input) => {
    const path = pathOf(input);
    if (path === "/auth/me/supplier") {
      const next = projections.length > 1 ? projections.shift()! : projections[0];
      return next();
    }
    if (path === "/jobs") return json(200, { jobs: [] });
    return json(404, { error: "not_found" });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  cleanup();
  // Let a shell read already in flight land here, not in the next test.
  await vi.advanceTimersByTimeAsync(50);
  vi.useRealTimers();
  fetchMock.mockReset();
  authState.signOut = vi.fn();
  authState.status = "mapped";
  authState.accessError = null;
  authState.memberships = [{ role: "supplier" }];
});

function renderGate() {
  return render(
    <RoleGate allow="supplier">
      <p>Jobs page</p>
    </RoleGate>,
  );
}

describe("RoleGate shop teams", () => {
  it("opens the work shell in Staff mode for an active Staff login", async () => {
    projections = [() => json(200, bootstrap("active"))];
    renderGate();
    const shell = await screen.findByTestId("supplier-shell");
    expect(shell).toHaveAttribute("data-staff", "true");
    expect(shell).toHaveTextContent("Blueprint Print Co.");
    expect(screen.getByText("Jobs page")).toBeVisible();
  });

  it("keeps an Owner out of Staff mode", async () => {
    projections = [() => json(200, bootstrap("active", "owner"))];
    renderGate();
    expect(await screen.findByTestId("supplier-shell")).toHaveAttribute("data-staff", "false");
  });

  it("holds a pending person on the waiting screen, reads no orders, and opens once approved", async () => {
    projections = [() => json(200, bootstrap("pending")), () => json(200, bootstrap("active"))];
    renderGate();
    expect(await screen.findByRole("heading", { name: "Waiting for approval" })).toBeVisible();
    expect(screen.getByText("Blueprint Print Co.")).toBeVisible();
    expect(screen.queryByTestId("supplier-shell")).not.toBeInTheDocument();
    expect(callsTo("/jobs")).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_RECHECK_MS);
    });
    expect(await screen.findByTestId("supplier-shell")).toHaveAttribute("data-staff", "true");
  });

  it("treats 403 shop_approval_pending as waiting too", async () => {
    projections = [() => json(403, { error: "shop_approval_pending" })];
    renderGate();
    expect(await screen.findByRole("heading", { name: "Waiting for approval" })).toBeVisible();
  });

  it("ends a removed Staff session and sends them to sign-in with a reason", async () => {
    projections = [() => json(403, { error: "shop_access_removed" })];
    renderGate();
    expect(
      await screen.findByRole("heading", { name: "You're no longer on this shop's team" }),
    ).toBeVisible();
    expect(screen.queryByTestId("supplier-shell")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(authState.signOut).toHaveBeenCalledWith({ redirectUrl: SHOP_REMOVED_LOGIN }),
    );
    expect(SHOP_REMOVED_LOGIN).toBe("/login?left=shop");
  });

  it("ends the session when the identity itself is refused as removed", async () => {
    authState.status = "unavailable";
    authState.accessError = "shop_access_removed";
    authState.memberships = [];
    renderGate();
    expect(
      await screen.findByRole("heading", { name: "You're no longer on this shop's team" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(authState.signOut).toHaveBeenCalledWith({ redirectUrl: SHOP_REMOVED_LOGIN }),
    );
  });

  it("keeps the session of someone with another GRIDGO workspace", async () => {
    authState.memberships = [{ role: "supplier" }, { role: "ops_admin" }];
    projections = [() => json(403, { error: "shop_access_removed" })];
    renderGate();
    await screen.findByRole("heading", { name: "You're no longer on this shop's team" });
    expect(authState.signOut).not.toHaveBeenCalled();
    expect(screen.getByText("Open Operations").closest("a")).toHaveAttribute(
      "href",
      "/ops/orders",
    );
  });

  it("closes the work shell when a page read says access was removed mid-session", async () => {
    projections = [
      () => json(200, bootstrap("active")),
      () => json(403, { error: "shop_access_removed" }),
    ];
    fetchMock.mockImplementation(async (input) => {
      const path = pathOf(input);
      if (path === "/auth/me/supplier") {
        const next = projections.length > 1 ? projections.shift()! : projections[0];
        return next();
      }
      if (path === "/jobs") return json(403, { error: "shop_access_removed" });
      return json(404, { error: "not_found" });
    });
    renderGate();
    expect(
      await screen.findByRole("heading", { name: "You're no longer on this shop's team" }),
    ).toBeVisible();
    expect(screen.queryByTestId("supplier-shell")).not.toBeInTheDocument();
  });
});
