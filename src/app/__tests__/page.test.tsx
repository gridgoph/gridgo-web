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

const shopTeam = vi.hoisted(() => ({
  listMyShopMemberships: vi.fn(async () => [] as Array<{ status: string }>),
  discoverShopInvites: vi.fn(async () => [] as unknown[]),
}));
vi.mock("@/lib/api/shop-team", () => shopTeam);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  authState.status = "mapped";
  authState.user.role = "client";
  authState.memberships = [];
});

describe("portal landing", () => {
  it("opens the shop workspace for a client account that joined a shop", async () => {
    authState.memberships = [{ role: "client" }];
    shopTeam.listMyShopMemberships.mockResolvedValueOnce([{ status: "pending" }]);
    render(<HomePage />);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/supplier"));
  });

  it("sends a person with an email or phone invite to join", async () => {
    authState.status = "unmapped";
    shopTeam.discoverShopInvites.mockResolvedValueOnce([{ id: "shi_1" }]);
    render(<HomePage />);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/join-team"));
  });

  it("tells a removed Staff login why, instead of a connection error", async () => {
    authState.status = "unavailable";
    (authState as { accessError?: string | null }).accessError = "shop_access_removed";
    render(<HomePage />);
    expect(
      await screen.findByRole("heading", { name: "You're no longer on this shop's team" }),
    ).toBeVisible();
    expect(shopTeam.listMyShopMemberships).not.toHaveBeenCalled();
    (authState as { accessError?: string | null }).accessError = null;
  });

  it("shows settled denial for a mapped identity with no portal membership", async () => {
    authState.memberships = [{ role: "client" }];

    render(<HomePage />);

    expect(
      await screen.findByRole("heading", { name: "Portal access has not been assigned" }),
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
