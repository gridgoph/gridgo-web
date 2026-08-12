// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import LoginPage from "@/app/login/page";
import { ApiError } from "@/lib/api/client";

const { replaceMock, signInMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  signInMock: vi.fn(),
}));

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({
    signIn: signInMock,
    user: null,
    loading: false,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LoginPage", () => {
  it("starts with empty credentials", () => {
    render(<LoginPage />);

    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });

  it("fills both fields when a local development account is chosen", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Super Admin" }));

    // One tap signs in locally. Safe only because the whole list — address and
    // local password together — folds away in a production build; see
    // `account-disclosure.test.ts` and `scripts/assert-no-account-addresses.mjs`.
    expect(screen.getByLabelText("Email")).toHaveValue("admin@gridgo.ph");
    expect(screen.getByLabelText("Password")).toHaveValue("Ilovegridgo-0990");
  });

  it("explains how to continue when credentials are empty", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.clear(screen.getByLabelText("Email"));
    await user.clear(screen.getByLabelText("Password"));
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter your email and password.",
    );
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("names no account and no error code when credentials are rejected", async () => {
    signInMock.mockRejectedValueOnce(new ApiError(401, { error: "invalid_credentials" }));
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "someone@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Email or password is wrong. Check both and try again.",
    );
    expect(alert.textContent).not.toMatch(/@gridgo\./);
    expect(alert.textContent).not.toMatch(/invalid_credentials/);
  });

  it("keeps an unreachable API off the screen as plain recovery copy", async () => {
    signInMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "someone@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Could not reach GRIDGO. Check your connection and try again.",
    );
    // No host, port or environment variable name on a public screen.
    expect(alert.textContent).not.toMatch(/127\.0\.0\.1|NEXT_PUBLIC/);
  });

  it("cannot be submitted before React attaches its handler", () => {
    // The server markup is what a fast click hits. If the button were enabled
    // there, the browser would submit the form natively — a GET that writes the
    // password into the address bar and browser history.
    const markup = renderToStaticMarkup(<LoginPage />);
    const submit = markup.slice(markup.indexOf('type="submit"') - 400);
    expect(submit).toContain("disabled");
  });

  it("renders no account address once the build-time guard is empty", async () => {
    // What a production build renders: DEV_ACCOUNTS folds to a constant [].
    vi.resetModules();
    vi.doMock("@/app/login/dev-accounts", () => ({ DEV_ACCOUNTS: [] }));
    const { default: ProductionLoginPage } = await import("@/app/login/page");

    const markup = renderToStaticMarkup(<ProductionLoginPage />);

    expect(markup).not.toMatch(/@gridgo\./);
    expect(markup).not.toMatch(/Local development/);
    vi.doUnmock("@/app/login/dev-accounts");
    vi.resetModules();
  });
});
