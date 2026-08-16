// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { NextRequest } from "next/server";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoleGate } from "@/components/shell/RoleGate";
import { ApiError } from "@/lib/api/client";
import { portalSessionMiddleware } from "@/middleware";

const { getPortalRoleProjectionMock, routerMock } = vi.hoisted(() => {
  const replace = vi.fn();
  return {
    getPortalRoleProjectionMock: vi.fn(),
    routerMock: { replace },
  };
});

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/overview",
  useRouter: () => routerMock,
}));

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: "user_without_admin_membership",
      email: "person@example.com",
      name: "Forged Claim User",
      role: "client",
    },
    memberships: [],
    status: "mapped",
    loading: false,
    signOut: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    getPortalRoleProjection: getPortalRoleProjectionMock,
  };
});

vi.mock("@/components/shell/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("signed-in forged Clerk role claims", () => {
  it("reaches the protected layout but cannot bypass its fixed database projection", async () => {
    const auth = vi.fn().mockResolvedValue({
      userId: "clerk_user",
      sessionClaims: {
        gridgo_role: "super_admin",
        org_role: "admin",
        public_metadata: { gridgoRole: "super_admin" },
      },
    });
    const middlewareResponse = await portalSessionMiddleware(
      auth,
      new NextRequest("https://portal.example/admin/overview"),
    );

    expect(middlewareResponse.status).toBe(200);
    expect(middlewareResponse.headers.get("x-middleware-next")).toBe("1");

    getPortalRoleProjectionMock.mockRejectedValueOnce(
      new ApiError(403, {
        error: "membership_required",
        requiredRole: "super_admin",
      }),
    );
    render(
      <RoleGate allow="super_admin">
        <p>Admin secrets</p>
      </RoleGate>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "This account cannot open Super Admin",
      }),
    ).toBeVisible();
    expect(screen.queryByText("Admin secrets")).not.toBeInTheDocument();
    expect(getPortalRoleProjectionMock).toHaveBeenCalledWith("super_admin");
  });
});
