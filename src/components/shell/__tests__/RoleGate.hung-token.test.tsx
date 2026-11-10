// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RoleGate } from "@/components/shell/RoleGate";
import { AuthProvider, type ClerkSessionAdapter } from "@/lib/auth/AuthProvider";
import type { AuthMe } from "@/lib/api/types";

vi.stubGlobal("React", React);

const { getAuthMeMock, getPortalRoleProjectionMock, routerMock } = vi.hoisted(() => ({
  getAuthMeMock: vi.fn(),
  getPortalRoleProjectionMock: vi.fn(),
  routerMock: { replace: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/ops/issue-reports",
  useRouter: () => routerMock,
}));

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    getAuthMe: getAuthMeMock,
    getPortalRoleProjection: getPortalRoleProjectionMock,
  };
});

vi.mock("@/components/shell/AppShell", () => ({
  AppShell: ({ children, role }: { children: React.ReactNode; role: string }) => (
    <div data-testid={`shell-${role}`}>{children}</div>
  ),
}));

const OPERATIONS: AuthMe = {
  user: { id: "user_ops", email: "ops@example.com", name: "Ops", role: "ops_admin" },
  memberships: [{ role: "ops_admin" }],
  approvalCases: [],
};

function clerkSession(getToken: ClerkSessionAdapter["getToken"]): ClerkSessionAdapter {
  return {
    getToken,
    isLoaded: true,
    isSignedIn: true,
    sessionId: "session_ops",
    signOut: vi.fn().mockResolvedValue(undefined),
    userId: "clerk_ops",
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  getAuthMeMock.mockResolvedValue(OPERATIONS);
  getPortalRoleProjectionMock.mockResolvedValue({ user: OPERATIONS.user });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function renderOpsIssueReports(getToken: ClerkSessionAdapter["getToken"]) {
  return render(
    <AuthProvider clerkSession={clerkSession(getToken)}>
      <RoleGate allow="ops_admin">
        <p>Issue reports desk</p>
      </RoleGate>
    </AuthProvider>,
  );
}

describe("RoleGate when Clerk never hands over a session token", () => {
  it("settles /ops/issue-reports on the retryable error instead of checking forever", async () => {
    // First token request never answers (a stalled Clerk token refresh); the
    // retry gets one.
    const getToken = vi
      .fn<ClerkSessionAdapter["getToken"]>()
      .mockImplementationOnce(() => new Promise<string | null>(() => undefined))
      .mockResolvedValue("token-ops");

    renderOpsIssueReports(getToken);

    expect(screen.getByText("Checking portal access…")).toBeInTheDocument();
    expect(getAuthMeMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(screen.queryByText("Checking portal access…")).not.toBeInTheDocument();
    expect(screen.getByText("Could not check portal access")).toBeInTheDocument();
    expect(screen.queryByText("Issue reports desk")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Issue reports desk")).toBeInTheDocument();
    expect(screen.getByTestId("shell-ops_admin")).toBeInTheDocument();
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(getPortalRoleProjectionMock).toHaveBeenCalledWith("ops_admin");
  });

  it("still opens the desk at once when the token arrives normally", async () => {
    renderOpsIssueReports(vi.fn().mockResolvedValue("token-ops"));

    expect(await screen.findByText("Issue reports desk")).toBeInTheDocument();
    expect(screen.queryByText("Could not check portal access")).not.toBeInTheDocument();
  });
});
