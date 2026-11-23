// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { NextRequest } from "next/server";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoleGate } from "@/components/shell/RoleGate";
import { ApiError } from "@/lib/api/client";
import { portalSessionMiddleware, requiresPortalSession } from "@/middleware";

/**
 * The public `/signup` (gridgoph/gridgo-web#328) makes print shops only. A
 * fresh web sign-up holds one `supplier` membership, and the fixed database
 * projection behind every Operations and Super Admin layout refuses it, the
 * same guard as before the route existed.
 */

const { getPortalRoleProjectionMock, pathname, apiRequestMock, routerMock } = vi.hoisted(() => ({
  routerMock: { replace: vi.fn(), push: vi.fn() },
  getPortalRoleProjectionMock: vi.fn(),
  pathname: { current: "/ops/overview" },
  apiRequestMock: vi.fn(async () => ({})),
}));

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => routerMock,
}));

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "fresh_web_shop", email: "shop@example.com", name: "New Shop", role: "supplier" },
    memberships: [{ role: "supplier" }],
    status: "mapped",
    loading: false,
    signOut: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, getPortalRoleProjection: getPortalRoleProjectionMock, apiRequest: apiRequestMock };
});

vi.mock("@/components/shell/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const STAFF_ROUTES = [
  { allow: "ops_admin", path: "/ops/overview", label: "Operations" },
  { allow: "ops_admin", path: "/ops/settings", label: "Operations" },
  { allow: "super_admin", path: "/admin/overview", label: "Super Admin" },
  { allow: "super_admin", path: "/admin/roles", label: "Super Admin" },
] as const;

describe("a fresh web sign-up", () => {
  it("is a public page, outside the portal session check", async () => {
    expect(requiresPortalSession("/signup")).toBe(false);
    const auth = vi.fn().mockResolvedValue({ userId: null });
    const response = await portalSessionMiddleware(auth, new NextRequest("https://portal.example/signup"));
    expect(response.headers.get("location")).toBeNull();
    expect(auth).not.toHaveBeenCalled();
  });

  it("enrolls through the supplier route only, naming no role", async () => {
    const { enrollGuidedSupplier } = await import("@/lib/api/supplier-signup");
    await enrollGuidedSupplier({ signupVersion: 3, jobsHandledBy: "just_me" }, "web-signup:test");
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    const [path, init] = apiRequestMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/auth/clerk/enroll/supplier");
    expect(String(init.body)).not.toMatch(/role|ops_admin|super_admin/);
  });

  it.each(STAFF_ROUTES)("cannot open $path", async ({ allow, path, label }) => {
    pathname.current = path;
    getPortalRoleProjectionMock.mockRejectedValueOnce(
      new ApiError(403, { error: "membership_required", requiredRole: allow }),
    );
    render(
      <RoleGate allow={allow}>
        <p>Staff-only content</p>
      </RoleGate>,
    );
    expect(await screen.findByRole("heading", { name: `This account cannot open ${label}` })).toBeVisible();
    expect(screen.queryByText("Staff-only content")).not.toBeInTheDocument();
    expect(getPortalRoleProjectionMock).toHaveBeenCalledWith(allow);
  });
});
