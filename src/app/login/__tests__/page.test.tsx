// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import LoginPage from "@/app/login/page";

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

  it("fills credentials when a demo account is chosen", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: /Super Admin/ }));

    expect(screen.getByLabelText("Email")).toHaveValue("admin@gridgo.local");
    expect(screen.getByLabelText("Password")).toHaveValue("demo");
  });

  it("explains how to continue when credentials are empty", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.clear(screen.getByLabelText("Email"));
    await user.clear(screen.getByLabelText("Password"));
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter your email and password, or choose a demo account below.",
    );
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("cannot be submitted before React attaches its handler", () => {
    // The server markup is what a fast click hits. If the button were enabled
    // there, the browser would submit the form natively — a GET that writes the
    // password into the address bar and browser history.
    const markup = renderToStaticMarkup(<LoginPage />);
    const submit = markup.slice(markup.indexOf('type="submit"') - 400);
    expect(submit).toContain("disabled");
  });
});
