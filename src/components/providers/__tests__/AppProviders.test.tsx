// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "@/components/providers/AppProviders";

const { clerkProviderPropsMock } = vi.hoisted(() => ({
  clerkProviderPropsMock: vi.fn(),
}));

vi.stubGlobal("React", React);

vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => {
    clerkProviderPropsMock(props);
    return <div data-testid="clerk-provider">{children}</div>;
  },
}));

vi.mock("@/components/providers/ClerkSessionAuthProvider", () => ({
  ClerkSessionAuthProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AppProviders", () => {
  it("sends Clerk to login after sign-out and only uses home as a post-sign-in fallback", () => {
    render(
      <AppProviders>
        <p>Portal</p>
      </AppProviders>,
    );

    expect(clerkProviderPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        afterSignOutUrl: "/login",
        signInUrl: "/login",
        signInFallbackRedirectUrl: "/",
      }),
    );
  });

  it("always mounts Clerk on first paint so SSR and hydration share one tree", () => {
    const { getByTestId, getByText } = render(
      <AppProviders>
        <a href="#main-content">Skip to main content</a>
      </AppProviders>,
    );

    expect(getByTestId("clerk-provider")).toBeInTheDocument();
    expect(getByText("Skip to main content")).toBeInTheDocument();
    expect(clerkProviderPropsMock).toHaveBeenCalledTimes(1);
  });
});
