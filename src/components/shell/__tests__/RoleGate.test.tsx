// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
    memberships: [{ role: "supplier" }, { role: "ops_admin" }, { role: "super_admin" }],
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
  refreshMock.mockReset();
  pathnameRef.current = "/test-route";
  authState.status = "mapped";
  authState.user.role = "client";
  authState.memberships = [
    { role: "supplier" },
    { role: "ops_admin" },
    { role: "super_admin" },
  ];
  authState.signOut = signOutMock;
  authState.refresh = refreshMock;
});

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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
  it.each(["supplier", "ops_admin", "super_admin"] as const)(
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
    await waitFor(() => expect(screen.getByText("Operations workspace")).toBeVisible());
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

  it("keeps the allowed tree mounted through a 401 token refresh and projection retry", async () => {
    getPortalRoleProjectionMock.mockResolvedValueOnce(projection("ops_admin"));

    const { rerender } = render(
      <RoleGate allow="ops_admin">
        <p>Operations workspace</p>
      </RoleGate>,
    );
    expect(await screen.findByText("Operations workspace")).toBeVisible();

    const projectionRetry = deferred();
    getPortalRoleProjectionMock
      .mockRejectedValueOnce(new ApiError(401, { error: "unauthorized" }))
      .mockImplementationOnce(() => projectionRetry.promise);

    pathnameRef.current = "/test-route/detail";
    rerender(
      <RoleGate allow="ops_admin">
        <p>Operations workspace</p>
      </RoleGate>,
    );

    await waitFor(() => expect(getPortalRoleProjectionMock).toHaveBeenCalledTimes(3));
    expect(screen.getByText("Operations workspace")).toBeVisible();
    expect(screen.queryByText("Checking portal access…")).not.toBeInTheDocument();
    expect(getPortalRoleProjectionMock).toHaveBeenLastCalledWith("ops_admin", {
      refreshToken: true,
    });

    await act(async () => {
      projectionRetry.resolve(projection("ops_admin"));
    });
    expect(screen.getByText("Operations workspace")).toBeVisible();
  });

  it("cannot refresh shared auth from a stale projection after switching gates", async () => {
    const staleOpsProjection = deferred();
    getPortalRoleProjectionMock.mockImplementationOnce(() => staleOpsProjection.promise);

    const { rerender } = render(
      <RoleGate key="ops" allow="ops_admin">
        <p>Operations workspace</p>
      </RoleGate>,
    );
    await waitFor(() => expect(getPortalRoleProjectionMock).toHaveBeenCalledTimes(1));

    getPortalRoleProjectionMock.mockResolvedValueOnce(projection("super_admin"));
    rerender(
      <RoleGate key="admin" allow="super_admin">
        <p>Admin workspace</p>
      </RoleGate>,
    );
    expect(await screen.findByText("Admin workspace")).toBeVisible();

    await act(async () => {
      staleOpsProjection.reject(new ApiError(401, { error: "unauthorized" }));
    });

    expect(screen.getByText("Admin workspace")).toBeVisible();
    expect(getPortalRoleProjectionMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Operations workspace")).not.toBeInTheDocument();
  });

  it("ignores a stale projection success that resolves after a newer denial", async () => {
    getPortalRoleProjectionMock.mockResolvedValueOnce(projection("ops_admin"));

    const { rerender } = render(
      <RoleGate allow="ops_admin">
        <p>Operations workspace</p>
      </RoleGate>,
    );
    expect(await screen.findByText("Operations workspace")).toBeVisible();

    const stale = deferred();
    const newest = deferred();
    getPortalRoleProjectionMock
      .mockImplementationOnce(() => stale.promise)
      .mockImplementationOnce(() => newest.promise);

    pathnameRef.current = "/test-route/first";
    rerender(
      <RoleGate allow="ops_admin">
        <p>Operations workspace</p>
      </RoleGate>,
    );
    await waitFor(() => expect(getPortalRoleProjectionMock).toHaveBeenCalledTimes(2));

    pathnameRef.current = "/test-route/second";
    rerender(
      <RoleGate allow="ops_admin">
        <p>Operations workspace</p>
      </RoleGate>,
    );
    await waitFor(() => expect(getPortalRoleProjectionMock).toHaveBeenCalledTimes(3));

    await act(async () => {
      newest.reject(
        new ApiError(403, {
          error: "membership_required",
          requiredRole: "ops_admin",
        }),
      );
    });
    expect(
      await screen.findByRole("heading", {
        name: "This account cannot open Operations",
      }),
    ).toBeVisible();

    await act(async () => {
      stale.resolve(projection("ops_admin"));
    });
    expect(
      screen.getByRole("heading", { name: "This account cannot open Operations" }),
    ).toBeVisible();
    expect(screen.queryByText("Operations workspace")).not.toBeInTheDocument();
  });

  it("ignores a stale projection denial that rejects after a newer allowed result", async () => {
    getPortalRoleProjectionMock.mockResolvedValueOnce(projection("ops_admin"));

    const { rerender } = render(
      <RoleGate allow="ops_admin">
        <p>Operations workspace</p>
      </RoleGate>,
    );
    expect(await screen.findByText("Operations workspace")).toBeVisible();

    const stale = deferred();
    const newest = deferred();
    getPortalRoleProjectionMock
      .mockImplementationOnce(() => stale.promise)
      .mockImplementationOnce(() => newest.promise);

    pathnameRef.current = "/test-route/first";
    rerender(
      <RoleGate allow="ops_admin">
        <p>Operations workspace</p>
      </RoleGate>,
    );
    await waitFor(() => expect(getPortalRoleProjectionMock).toHaveBeenCalledTimes(2));

    pathnameRef.current = "/test-route/second";
    rerender(
      <RoleGate allow="ops_admin">
        <p>Operations workspace</p>
      </RoleGate>,
    );
    await waitFor(() => expect(getPortalRoleProjectionMock).toHaveBeenCalledTimes(3));

    await act(async () => {
      newest.resolve(projection("ops_admin"));
    });
    expect(screen.getByText("Operations workspace")).toBeVisible();

    await act(async () => {
      stale.reject(
        new ApiError(403, {
          error: "membership_required",
          requiredRole: "ops_admin",
        }),
      );
    });
    expect(screen.getByText("Operations workspace")).toBeVisible();
    expect(
      screen.queryByRole("heading", {
        name: "This account cannot open Operations",
      }),
    ).not.toBeInTheDocument();
  });

  it("settles a persistently unauthorized projection to the retryable unavailable state", async () => {
    getPortalRoleProjectionMock.mockRejectedValue(
      new ApiError(401, { error: "unauthorized" }),
    );
    render(
      <RoleGate allow="ops_admin">
        <p>Operations workspace</p>
      </RoleGate>,
    );

    expect(
      await screen.findByRole("heading", { name: "Could not check portal access" }),
    ).toBeVisible();
    expect(getPortalRoleProjectionMock).toHaveBeenCalledTimes(2);
    expect(getPortalRoleProjectionMock).toHaveBeenLastCalledWith("ops_admin", {
      refreshToken: true,
    });
    expect(screen.queryByText("Operations workspace")).not.toBeInTheDocument();
  });

  it("keeps an allowed tree mounted after the bounded 401 retry is exhausted", async () => {
    getPortalRoleProjectionMock.mockResolvedValueOnce(projection("ops_admin"));
    const { rerender } = render(
      <RoleGate allow="ops_admin">
        <p>Operations workspace</p>
      </RoleGate>,
    );
    expect(await screen.findByText("Operations workspace")).toBeVisible();

    getPortalRoleProjectionMock.mockRejectedValue(
      new ApiError(401, { error: "unauthorized" }),
    );
    pathnameRef.current = "/test-route/detail";
    rerender(
      <RoleGate allow="ops_admin">
        <p>Operations workspace</p>
      </RoleGate>,
    );

    await waitFor(() => expect(getPortalRoleProjectionMock).toHaveBeenCalledTimes(3));
    expect(screen.getByText("Operations workspace")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Could not check portal access" }),
    ).not.toBeInTheDocument();
    expect(getPortalRoleProjectionMock).toHaveBeenLastCalledWith("ops_admin", {
      refreshToken: true,
    });
  });
});
