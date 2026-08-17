// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LoginPage from "@/app/login/page";

const { signInPropsMock, clerkSignedIn } = vi.hoisted(() => ({
  signInPropsMock: vi.fn(),
  clerkSignedIn: { current: false },
}));

vi.stubGlobal("React", React);

vi.mock("@clerk/nextjs", () => ({
  SignIn: (props: Record<string, unknown>) => {
    signInPropsMock(props);
    return <div data-testid="clerk-sign-in">Clerk sign in</div>;
  },
  SignedOut: ({ children }: { children: React.ReactNode }) =>
    clerkSignedIn.current ? null : <>{children}</>,
  SignedIn: ({ children }: { children: React.ReactNode }) =>
    clerkSignedIn.current ? <>{children}</> : null,
  SignOutButton: ({
    children,
    redirectUrl,
  }: {
    children: React.ReactNode;
    redirectUrl?: string;
  }) => (
    <div data-testid="clerk-sign-out" data-redirect-url={redirectUrl ?? ""}>
      {children}
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  clerkSignedIn.current = false;
  vi.clearAllMocks();
});

describe("LoginPage", () => {
  it("renders the branded portal orientation and Clerk sign-in", () => {
    render(<LoginPage />);

    expect(
      screen.getByRole("heading", { name: "Partner and operations portal" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Welcome back." })).toBeVisible();
    expect(screen.getByTestId("clerk-sign-in")).toBeVisible();
    expect(
      screen.getByRole("img", { name: /operations team coordinating work/i }),
    ).toBeVisible();
  });

  it("is sign-in only and prevents Clerk from transferring to public signup", () => {
    render(<LoginPage />);

    expect(signInPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        routing: "hash",
        fallbackRedirectUrl: "/",
        transferable: false,
        withSignUp: false,
      }),
    );
    expect(
      screen.getByText(/New privileged accounts cannot be created here/i),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: /sign up/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign up/i })).not.toBeInTheDocument();
  });

  it("does not restore a leftover Clerk session via the home fallback", () => {
    clerkSignedIn.current = true;
    render(<LoginPage />);

    expect(screen.queryByTestId("clerk-sign-in")).not.toBeInTheDocument();
    expect(signInPropsMock).not.toHaveBeenCalled();
    expect(screen.getByText(/previous session is still active/i)).toBeVisible();
    expect(screen.getByTestId("clerk-sign-out")).toHaveAttribute(
      "data-redirect-url",
      "/login",
    );
    expect(screen.getByRole("button", { name: "Log out" })).toBeVisible();
  });
});
