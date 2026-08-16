// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoleGate } from "@/components/shell/RoleGate";
import { ApiError } from "@/lib/api/client";

const {
  authState,
  getPortalRoleProjectionMock,
  replaceMock,
  signOutMock,
  refreshMock,
  pathnameRef,
} = vi.hoisted(() => ({
  authState: {
    user: {
      id: "user_multi",
      email: "person@example.com",
      name: "Multi Member",
      // Deliberately irrelevant to route authorization.
      role: "client",
    },
    memberships: [{ role: "supplier" }, { role: "ops_admin" }],
    status: "mapped",
    loading: false,
    signOut: vi.fn(),
    refresh: vi.fn(),
  },
  getPortalRoleProjectionMock: vi.fn(),
  replaceMock: vi.fn(),
  signOutMock: vi.fn(),
  refreshMock: vi.fn(),
  pathnameRef: { current: "/test-route" },
}));

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => {
  const router = { replace: replaceMock };
  return {
    usePathname: () => pathnameRef.current,
    useRouter: () => router,
  };
});

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => authState,
}));

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    getPortalRoleProjection: getPortalRoleProjectionMock,
  };
});

vi.mock("@/components/shell/AppShell", () => ({
  AppShell: ({ children, role }: { children: React.ReactNode; role: string }) => (
    <div data-testid={`shell-${role}`}>{children}</div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  getPortalRoleProjectionMock.mockReset();
  pathnameRef.current = "/test-route";
  authState.status = "mapped";
  authState.user.role = "client";
  authState.memberships = [{ role: "supplier" }, { role: "ops_admin" }];
  authState.signOut = signOutMock;
  authState.refresh = refreshMock;
});

function projection(role: "supplier" | "ops_admin" | "super_admin") {
  return {
    user: {
      id: "user_multi",
      email: "person@example.com",
      name: "Multi Member",
    },
    membership: { role },
    capabilities: {},
  };
}

describe("RoleGate fixed projections", () => {
  it.each(["supplier", "ops_admin"] as const)(
    "allows a multi-member identity into its %s route through that fixed projection",
    async (role) => {
      getPortalRoleProjectionMock.mockResolvedValueOnce(projection(role));

      render(
        <RoleGate allow={role}>
          <p>Authorized workspace</p>
        </RoleGate>,
      );

      expect(await screen.findByText("Authorized workspace")).toBeVisible();
      expect(screen.getByTestId(`shell-${role}`)).toBeVisible();
      expect(getPortalRoleProjectionMock).toHaveBeenCalledWith(role);
    },
  );

  it("denies a route when the fixed projection rejects it, regardless of legacy role", async () => {
    authState.user.role = "super_admin";
    getPortalRoleProjectionMock.mockRejectedValue(
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

  it("shows the mapped-account denial without probing a role for an unmapped identity", async () => {
    authState.status = "unmapped";

    render(
      <RoleGate allow="ops_admin">
        <p>Operations secrets</p>
      </RoleGate>,
    );

    expect(
      screen.getByRole("heading", { name: "Portal access has not been assigned" }),
    ).toBeVisible();
    expect(screen.queryByText("Operations secrets")).not.toBeInTheDocument();
    await waitFor(() => expect(getPortalRoleProjectionMock).not.toHaveBeenCalled());
  });
});

describe("RoleGate navigation revalidation", () => {
  it("keeps the allowed tree mounted while a navigation revalidation is in flight", async () => {
    getPortalRoleProjectionMock.mockResolvedValueOnce(projection("ops_admin"));

    const { rerender } = render(
      <RoleGate allow="ops_admin">
        <p>Operations workspace</p>
      </RoleGate>,
    );
    expect(await screen.findByText("Operations workspace")).toBeVisible();

    let resolveRevalidation: (value: unknown) => void = () => {};
    getPortalRoleProjectionMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRevalidation = resolve;
        }),
    );
    pathnameRef.current = "/test-route/detail";
    rerender(
      <RoleGate allow="ops_admin">
        <p>Operations workspace</p>
      </RoleGate>,
    );

    await waitFor(() => expect(getPortalRoleProjectionMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Operations workspace")).toBeVisible();
    expect(screen.queryByText("Checking portal access…")).not.toBeInTheDocument();

    resolveRevalidation(projection("ops_admin"));
    await waitFor(() =>
      expect(screen.getByText("Operations workspace")).toBeVisible(),
    );
  });

  it("removes access when a navigation revalidation returns a settled denial", async () => {
    getPortalRoleProjectionMock.mockResolvedValueOnce(projection("ops_admin"));

    const { rerender } = render(
      <RoleGate allow="ops_admin">
        <p>Operations workspace</p>
      </RoleGate>,
    );
    expect(await screen.findByText("Operations workspace")).toBeVisible();

    getPortalRoleProjectionMock.mockRejectedValueOnce(
      new ApiError(403, {
        error: "membership_required",
        requiredRole: "ops_admin",
      }),
    );
    pathnameRef.current = "/test-route/detail";
    rerender(
      <RoleGate allow="ops_admin">
        <p>Operations workspace</p>
      </RoleGate>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "This account cannot open Operations",
      }),
    ).toBeVisible();
    expect(screen.queryByText("Operations workspace")).not.toBeInTheDocument();
  });

  it("settles a persistently unauthorized projection to the retryable unavailable state", async () => {
    getPortalRoleProjectionMock.mockRejectedValue(
      new ApiError(401, { error: "unauthorized" }),
    );
    refreshMock.mockResolvedValue(undefined);

    const { rerender } = render(
      <RoleGate allow="ops_admin">
        <p>Operations workspace</p>
      </RoleGate>,
    );

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));

    authState.status = "checking";
    rerender(
      <RoleGate allow="ops_admin">
        <p>Operations workspace</p>
      </RoleGate>,
    );
    authState.status = "mapped";
    rerender(
      <RoleGate allow="ops_admin">
        <p>Operations workspace</p>
      </RoleGate>,
    );

    expect(
      await screen.findByRole("heading", { name: "Could not check portal access" }),
    ).toBeVisible();
    expect(getPortalRoleProjectionMock).toHaveBeenCalledTimes(2);
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Operations workspace")).not.toBeInTheDocument();
  });
});
