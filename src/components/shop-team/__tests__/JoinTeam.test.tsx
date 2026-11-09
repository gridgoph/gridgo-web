// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JOIN_TOKEN_KEY, JoinTeam } from "@/components/shop-team/JoinTeam";
import { ApiError } from "@/lib/api/client";

const TOKEN = "J".repeat(43);

const api = vi.hoisted(() => ({
  claimShopInvite: vi.fn(),
  discoverShopInvites: vi.fn(),
}));
const { authState, router } = vi.hoisted(() => ({
  authState: {
    status: "unmapped" as string,
    user: null,
    refresh: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
  },
  router: { replace: vi.fn() },
}));

vi.stubGlobal("React", React);
vi.mock("@/lib/api/shop-team", () => api);
vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => authState }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: { primaryEmailAddress: { emailAddress: "sam@example.com" } } }),
}));

beforeEach(() => {
  authState.status = "unmapped";
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/join-team");
  api.discoverShopInvites.mockResolvedValue([]);
  api.claimShopInvite.mockResolvedValue({
    member: { userId: "user_sam", name: "Sam", role: "staff", status: "pending" },
    shop: { id: "user_owner", name: "Blueprint Print Co.", role: "staff", status: "pending" },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/join-team", () => {
  it("joins with the link's token, clears it, and opens the waiting screen", async () => {
    window.history.replaceState(null, "", `/join-team#token=${TOKEN}`);
    render(<JoinTeam />);
    const join = await screen.findByRole("button", { name: "Join" });
    expect(screen.getByText(/Signed in as sam@example.com/)).toBeVisible();
    await userEvent.click(join);
    expect(api.claimShopInvite).toHaveBeenCalledWith({ token: TOKEN });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/supplier"));
    expect(authState.refresh).toHaveBeenCalled();
    // The token never stays in the address bar or the tab.
    expect(window.location.hash).toBe("");
    expect(window.sessionStorage.getItem(JOIN_TOKEN_KEY)).toBeNull();
  });

  it("asks a signed-out person to sign in and keeps the token for the way back", async () => {
    authState.status = "signed_out";
    window.history.replaceState(null, "", `/join-team#token=${TOKEN}`);
    render(<JoinTeam />);
    expect(await screen.findByRole("heading", { name: "Join your shop on GRIDGO" })).toBeVisible();
    expect(window.sessionStorage.getItem(JOIN_TOKEN_KEY)).toBe(TOKEN);
    expect(window.location.hash).toBe("");
    expect(api.claimShopInvite).not.toHaveBeenCalled();
  });

  it("picks the stored token up after sign-in", async () => {
    window.sessionStorage.setItem(JOIN_TOKEN_KEY, TOKEN);
    render(<JoinTeam />);
    await userEvent.click(await screen.findByRole("button", { name: "Join" }));
    expect(api.claimShopInvite).toHaveBeenCalledWith({ token: TOKEN });
  });

  it("says an expired invite expired and forgets it", async () => {
    window.sessionStorage.setItem(JOIN_TOKEN_KEY, TOKEN);
    api.claimShopInvite.mockRejectedValue(new ApiError(410, { error: "shop_invite_expired" }));
    render(<JoinTeam />);
    await userEvent.click(await screen.findByRole("button", { name: "Join" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This invite expired.");
    expect(window.sessionStorage.getItem(JOIN_TOKEN_KEY)).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("lists email and phone invites waiting for this sign-in", async () => {
    api.discoverShopInvites.mockResolvedValue([
      {
        id: "shi_email",
        shopId: "user_owner",
        kind: "email",
        identity: "sam@example.com",
        createdAt: "2026-11-09T00:00:00.000Z",
        expiresAt: "2026-11-11T00:00:00.000Z",
        status: "open",
        shop: { id: "user_owner", name: "Blueprint Print Co.", role: "staff", status: "pending" },
      },
    ]);
    render(<JoinTeam />);
    expect(await screen.findByText("Blueprint Print Co.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(api.claimShopInvite).toHaveBeenCalledWith({ inviteId: "shi_email" });
  });

  it("says when there is no invite", async () => {
    render(<JoinTeam />);
    expect(await screen.findByRole("heading", { name: "No invite found" })).toBeVisible();
  });
});
