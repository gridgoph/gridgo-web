// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, type ClerkSessionAdapter, useAuth } from "@/lib/auth/AuthProvider";
import { ApiError } from "@/lib/api/client";
import type { AuthMe, Role } from "@/lib/api/types";

vi.stubGlobal("React", React);

const { getAuthMeMock, replaceMock, routerMock, setTokenProviderMock } = vi.hoisted(
  () => {
    const replace = vi.fn();
    return {
      getAuthMeMock:
        vi.fn<
          (options?: { signal?: AbortSignal; refreshToken?: boolean }) => Promise<AuthMe>
        >(),
      replaceMock: replace,
      routerMock: { replace },
      setTokenProviderMock: vi.fn(),
    };
  },
);

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    getAuthMe: getAuthMeMock,
    setTokenProvider: setTokenProviderMock,
  };
});

afterEach(() => {
  cleanup();
  getAuthMeMock.mockReset();
  replaceMock.mockReset();
  setTokenProviderMock.mockReset();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function authMe(id: string, role: Role): AuthMe {
  return {
    user: {
      id,
      email: `${id}@example.com`,
      name: id,
      role,
    },
    memberships: [{ role }],
    approvalCases: [],
  };
}

function clerkSession(userId: string, sessionId: string): ClerkSessionAdapter {
  return {
    getToken: vi.fn().mockResolvedValue(`token-${sessionId}`),
    isLoaded: true,
    isSignedIn: true,
    sessionId,
    signOut: vi.fn().mockResolvedValue(undefined),
    userId,
  };
}

function signedOutClerkSession(): ClerkSessionAdapter {
  return {
    getToken: vi.fn().mockResolvedValue(null),
    isLoaded: true,
    isSignedIn: false,
    sessionId: null,
    signOut: vi.fn().mockResolvedValue(undefined),
    userId: null,
  };
}

function AuthProbe() {
  const auth = useAuth();
  return (
    <>
      <output data-testid="status">{auth.status}</output>
      <output data-testid="user">{auth.user?.id ?? "none"}</output>
      {auth.status === "mapped" && auth.user ? <p>Authorized workspace</p> : null}
      <button type="button" onClick={() => void auth.refresh()}>
        Refresh
      </button>
      <button type="button" onClick={() => void auth.signOut()}>
        Sign out
      </button>
    </>
  );
}

describe("AuthProvider refresh ownership", () => {
  it("removes the authorized workspace immediately on a direct account switch", async () => {
    const firstIdentity = authMe("user_first", "ops_admin");
    const secondIdentity = authMe("user_second", "super_admin");
    const pendingSecondIdentity = deferred<AuthMe>();
    getAuthMeMock
      .mockResolvedValueOnce(firstIdentity)
      .mockImplementationOnce(() => pendingSecondIdentity.promise);

    const view = render(
      <AuthProvider clerkSession={clerkSession("clerk_first", "session_first")}>
        <AuthProbe />
      </AuthProvider>,
    );
    expect(await screen.findByText("Authorized workspace")).toBeVisible();

    view.rerender(
      <AuthProvider clerkSession={clerkSession("clerk_second", "session_second")}>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(screen.queryByText("Authorized workspace")).not.toBeInTheDocument();
    expect(screen.getByTestId("status")).toHaveTextContent("checking");
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    await waitFor(() => expect(getAuthMeMock).toHaveBeenCalledTimes(2));

    await act(async () => {
      pendingSecondIdentity.resolve(secondIdentity);
      await pendingSecondIdentity.promise;
    });
    expect(await screen.findByText("Authorized workspace")).toBeVisible();
    expect(screen.getByTestId("user")).toHaveTextContent("user_second");
  });

  it("removes the authorized workspace immediately when Clerk signs out", async () => {
    getAuthMeMock.mockResolvedValueOnce(authMe("user_first", "ops_admin"));
    const view = render(
      <AuthProvider clerkSession={clerkSession("clerk_first", "session_first")}>
        <AuthProbe />
      </AuthProvider>,
    );
    expect(await screen.findByText("Authorized workspace")).toBeVisible();

    view.rerender(
      <AuthProvider clerkSession={signedOutClerkSession()}>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(screen.queryByText("Authorized workspace")).not.toBeInTheDocument();
    expect(screen.getByTestId("status")).toHaveTextContent("signed_out");
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(getAuthMeMock).toHaveBeenCalledTimes(1);
  });

  it("cannot restore a prior account after sign-out and a new Clerk session", async () => {
    const firstIdentity = authMe("user_first", "ops_admin");
    const secondIdentity = authMe("user_second", "super_admin");
    const staleRefresh = deferred<AuthMe>();
    const firstSession = clerkSession("clerk_first", "session_first");
    const secondSession = clerkSession("clerk_second", "session_second");

    getAuthMeMock
      .mockResolvedValueOnce(firstIdentity)
      .mockImplementationOnce(() => staleRefresh.promise)
      .mockResolvedValueOnce(secondIdentity);

    const view = render(
      <AuthProvider clerkSession={firstSession}>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("user_first"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(getAuthMeMock).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("status")).toHaveTextContent("checking");

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.getByTestId("status")).toHaveTextContent("signed_out");

    view.rerender(
      <AuthProvider clerkSession={secondSession}>
        <AuthProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("user_second"),
    );
    expect(screen.getByTestId("status")).toHaveTextContent("mapped");

    await act(async () => {
      staleRefresh.resolve(firstIdentity);
      await staleRefresh.promise;
    });

    expect(screen.getByTestId("user")).toHaveTextContent("user_second");
    expect(screen.getByTestId("status")).toHaveTextContent("mapped");
  });

  it("aborts the pending identity request when the provider unmounts", async () => {
    const pendingIdentity = deferred<AuthMe>();
    getAuthMeMock.mockImplementationOnce(() => pendingIdentity.promise);

    const view = render(
      <AuthProvider clerkSession={clerkSession("clerk_first", "session_first")}>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(getAuthMeMock).toHaveBeenCalledTimes(1));
    const request = getAuthMeMock.mock.calls[0][0] as { signal: AbortSignal };
    expect(request.signal.aborted).toBe(false);

    view.unmount();

    expect(request.signal.aborted).toBe(true);
    await act(async () => {
      pendingIdentity.resolve(authMe("user_first", "ops_admin"));
      await pendingIdentity.promise;
    });
  });

  it("retries an unauthorized identity lookup once with a fresh Clerk token", async () => {
    getAuthMeMock
      .mockRejectedValueOnce(new ApiError(401, { error: "unauthorized" }))
      .mockResolvedValueOnce(authMe("user_first", "ops_admin"));

    render(
      <AuthProvider clerkSession={clerkSession("clerk_first", "session_first")}>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(await screen.findByText("Authorized workspace")).toBeVisible();
    expect(getAuthMeMock).toHaveBeenCalledTimes(2);
    expect(getAuthMeMock.mock.calls[0][0]).toEqual({
      signal: expect.any(AbortSignal),
    });
    expect(getAuthMeMock.mock.calls[1][0]).toEqual({
      signal: expect.any(AbortSignal),
      refreshToken: true,
    });
    expect(screen.getByTestId("status")).toHaveTextContent("mapped");
  });

  it("settles a repeatedly unauthorized identity as unmapped", async () => {
    getAuthMeMock.mockRejectedValue(new ApiError(401, { error: "unauthorized" }));

    render(
      <AuthProvider clerkSession={clerkSession("clerk_first", "session_first")}>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("unmapped"),
    );
    expect(getAuthMeMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(screen.queryByText("Authorized workspace")).not.toBeInTheDocument();
  });
});
