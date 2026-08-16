// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";

const { authState, replaceMock } = vi.hoisted(() => ({
  authState: {
    user: {
      id: "user_multi",
      email: "person@example.com",
      name: "Multi Member",
      role: "client",
    },
    memberships: [] as Array<{ role: string }>,
    status: "mapped",
    loading: false,
    signOut: vi.fn(),
    refresh: vi.fn(),
  },
  replaceMock: vi.fn(),
}));

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => authState,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  authState.status = "mapped";
  authState.user.role = "client";
  authState.memberships = [];
});

describe("portal landing", () => {
  it("shows settled denial for a mapped identity with no portal membership", () => {
    authState.memberships = [{ role: "client" }];

    render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "Portal access has not been assigned" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Use another account" })).toBeVisible();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("chooses a stable portal landing from memberships, not the legacy role", async () => {
    authState.user.role = "client";
    authState.memberships = [
      { role: "supplier" },
      { role: "ops_admin" },
      { role: "super_admin" },
    ];

    render(<HomePage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/admin/overview"));
  });
});
