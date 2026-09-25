// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { trackerBoard } from "@/app/admin/tracker/__tests__/fixtures";
import AdminLayout from "@/app/admin/layout";
import AdminTrackerPage from "@/app/admin/tracker/page";
import { ApiError } from "@/lib/api/client";

vi.stubGlobal("React", React);

const { authState, getPortalRoleProjection, getTracker } = vi.hoisted(() => ({
  authState: {
    user: { id: "user_ops", email: "ops@example.com", name: "Olive Ops", role: "ops_admin" },
    memberships: [{ role: "ops_admin" }] as Array<{ role: string }>,
    status: "mapped",
    loading: false,
    signOut: vi.fn(),
    refresh: vi.fn(),
  },
  getPortalRoleProjection: vi.fn(),
  getTracker: vi.fn(),
}));

vi.mock("next/navigation", () => {
  const router = { replace: vi.fn() };
  return { usePathname: () => "/admin/tracker", useRouter: () => router };
});

vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => authState }));

vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  getPortalRoleProjection,
  getTracker,
}));

vi.mock("@/components/shell/AppShell", () => ({
  AppShell: ({ children, role }: { children: React.ReactNode; role: string }) => (
    <div data-testid={`shell-${role}`}>{children}</div>
  ),
}));

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  getTracker.mockResolvedValue(trackerBoard());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderTracker() {
  return render(
    <AdminLayout>
      <AdminTrackerPage />
    </AdminLayout>,
  );
}

describe("/admin/tracker is Super Admin only", () => {
  it.each([
    ["Operations", [{ role: "ops_admin" }]],
    ["a supplier", [{ role: "supplier" }]],
  ])("refuses %s and never reads the tracker", async (_who, memberships) => {
    authState.memberships = memberships;
    getPortalRoleProjection.mockRejectedValue(
      new ApiError(403, { error: "membership_required", requiredRole: "super_admin" }),
    );
    renderTracker();

    expect(
      await screen.findByRole("heading", { name: "This account cannot open Super Admin" }),
    ).toBeVisible();
    expect(getPortalRoleProjection).toHaveBeenCalledWith("super_admin");
    expect(screen.queryByText("GENERAL & ADMIN / SYSTEM-WIDE")).toBeNull();
    expect(getTracker).not.toHaveBeenCalled();
  });

  it("opens for a Super Admin through the admin projection", async () => {
    authState.memberships = [{ role: "super_admin" }];
    getPortalRoleProjection.mockResolvedValue({
      user: { id: "user_admin", email: "admin@example.com", name: "Ada Admin" },
      membership: { role: "super_admin" },
      capabilities: {},
    });
    renderTracker();

    expect(await screen.findByText("GENERAL & ADMIN / SYSTEM-WIDE")).toBeInTheDocument();
    expect(screen.getByTestId("shell-super_admin")).toBeInTheDocument();
    expect(getTracker).toHaveBeenCalledTimes(1);
  });
});
