// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TeamManager } from "@/components/shop-team/TeamManager";
import type { ShopInvite, ShopMember } from "@/lib/api/types";

const TOKEN = "T".repeat(43);

const api = vi.hoisted(() => ({
  getMyShopTeam: vi.fn(),
  createShopInvite: vi.fn(),
  revokeShopInvite: vi.fn(),
  approveShopMember: vi.fn(),
  setShopMemberRole: vi.fn(),
  removeShopMember: vi.fn(),
}));

vi.stubGlobal("React", React);
vi.mock("@/lib/api/shop-team", () => api);
vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "user_owner", name: "Olive Owner" } }),
}));
vi.mock("@/lib/auth/shop-access", () => ({
  useShopAccess: () => ({
    shop: { id: "user_owner", name: "Blueprint Print Co.", role: "owner", status: "active" },
    staff: false,
  }),
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => undefined }));
vi.mock("@/components/ui/toast", () => ({ toast: { add: vi.fn() } }));

const owner: ShopMember = { userId: "user_owner", name: "Olive Owner", role: "owner", status: "active" };
const staff: ShopMember = { userId: "user_bea", name: "Bea Staff", role: "staff", status: "active" };
const pending: ShopMember = {
  userId: "user_pia",
  name: "Pia Pending",
  role: "staff",
  status: "pending",
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
};
const openInvite: ShopInvite = {
  id: "shi_email",
  shopId: "user_owner",
  kind: "email",
  identity: "sam@example.com",
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 47 * 3600_000).toISOString(),
  status: "open",
};

let members: ShopMember[];
let invites: ShopInvite[];

beforeEach(() => {
  members = [owner, staff, pending];
  invites = [openInvite];
  api.getMyShopTeam.mockImplementation(async () => ({ members, invites }));
  api.approveShopMember.mockImplementation(async (userId: string) => {
    members = members.map((m) => (m.userId === userId ? { ...m, status: "active" } : m));
    return members.find((m) => m.userId === userId);
  });
  api.removeShopMember.mockImplementation(async (userId: string) => {
    members = members.map((m) => (m.userId === userId ? { ...m, status: "removed" } : m));
    return members.find((m) => m.userId === userId);
  });
  api.revokeShopInvite.mockImplementation(async (id: string) => {
    invites = invites.map((i) => (i.id === id ? { ...i, status: "revoked" } : i));
    return invites[0];
  });
  api.createShopInvite.mockImplementation(async (kind: string, identity?: string) => ({
    invite: {
      ...openInvite,
      id: `shi_${kind}`,
      kind,
      identity: identity ?? null,
      expiresAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
    },
    token: TOKEN,
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Owner Team page", () => {
  it("shows waiting people first, the team with roles, and open invites", async () => {
    render(<TeamManager />);
    const waiting = await screen.findByRole("region", { name: "Waiting for you" });
    expect(within(waiting).getByText("Pia Pending")).toBeVisible();
    const team = screen.getByRole("region", { name: "Team" });
    const rows = within(team).getAllByTestId("team-member");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Olive Owner (you)Owner"),
      expect.stringContaining("Bea StaffStaff"),
    ]);
    const open = screen.getByRole("region", { name: "Open invites" });
    expect(within(open).getByText("sam@example.com")).toBeVisible();
    expect(within(open).getByText("Expires in 47 h")).toBeVisible();
    // One yellow action on the page.
    expect(screen.getByRole("button", { name: "Add staff" })).toBeVisible();
  });

  it("approves a waiting person", async () => {
    render(<TeamManager />);
    await userEvent.click(await screen.findByRole("button", { name: "Approve Pia Pending" }));
    expect(api.approveShopMember).toHaveBeenCalledWith("user_pia");
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Waiting for you" })).not.toBeInTheDocument(),
    );
    expect(screen.getAllByTestId("team-member")).toHaveLength(3);
  });

  it("declines a waiting person after a confirmation", async () => {
    render(<TeamManager />);
    await userEvent.click(await screen.findByRole("button", { name: "Decline Pia Pending" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Decline Pia Pending?")).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Decline" }));
    expect(api.removeShopMember).toHaveBeenCalledWith("user_pia");
  });

  it("removes a member after saying they are signed out right away", async () => {
    render(<TeamManager />);
    await userEvent.click(await screen.findByRole("button", { name: "Options for Bea Staff" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/signed out right away/)).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(api.removeShopMember).toHaveBeenCalledWith("user_bea");
    await waitFor(() => expect(screen.queryByText("Bea Staff")).not.toBeInTheDocument());
  });

  it("never offers to remove or demote the only Owner", async () => {
    render(<TeamManager />);
    await userEvent.click(await screen.findByRole("button", { name: "Options for Olive Owner" }));
    expect(await screen.findByRole("menuitem", { name: "Remove" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: "Make Staff" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("makes a Staff member an Owner", async () => {
    render(<TeamManager />);
    await userEvent.click(await screen.findByRole("button", { name: "Options for Bea Staff" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Make Owner" }));
    expect(api.setShopMemberRole).toHaveBeenCalledWith("user_bea", "owner");
  });

  it("cancels an open invite", async () => {
    render(<TeamManager />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel invite sam@example.com" }),
    );
    expect(api.revokeShopInvite).toHaveBeenCalledWith("shi_email");
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Open invites" })).not.toBeInTheDocument(),
    );
  });

  it("creates an email invite and shows the join link to pass on", async () => {
    render(<TeamManager />);
    await userEvent.click(await screen.findByRole("button", { name: "Add staff" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByLabelText("Their email or mobile number"),
      "Sam@Example.com",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Create invite" }));
    expect(api.createShopInvite).toHaveBeenCalledWith("email", "sam@example.com");
    const link = await within(dialog).findByLabelText("Invite link");
    expect(link).toHaveValue(`${window.location.origin}/join-team#token=${TOKEN}`);
    expect(within(dialog).getByText(/works once/i)).toBeVisible();
  });

  it("turns a local mobile number into a phone invite", async () => {
    render(<TeamManager />);
    await userEvent.click(await screen.findByRole("button", { name: "Add staff" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Their email or mobile number"), "0917 123 4567");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create invite" }));
    expect(api.createShopInvite).toHaveBeenCalledWith("phone", "+639171234567");
  });

  it("refuses a contact that is neither an email nor a number, without calling the API", async () => {
    render(<TeamManager />);
    await userEvent.click(await screen.findByRole("button", { name: "Add staff" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Their email or mobile number"), "sam@");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create invite" }));
    expect(within(dialog).getByText("Enter an email or a mobile number.")).toBeVisible();
    expect(api.createShopInvite).not.toHaveBeenCalled();
  });

  it("shows a QR code of the join link", async () => {
    render(<TeamManager />);
    await userEvent.click(await screen.findByRole("button", { name: "Add staff" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("tab", { name: "QR code" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Show QR code" }));
    expect(api.createShopInvite).toHaveBeenCalledWith("qr", undefined);
    expect(await within(dialog).findByRole("img", { name: "Invite QR code" })).toBeVisible();
  });

  it("creates a share link", async () => {
    render(<TeamManager />);
    await userEvent.click(await screen.findByRole("button", { name: "Add staff" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("tab", { name: "Link" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Create link" }));
    expect(api.createShopInvite).toHaveBeenCalledWith("link", undefined);
    expect(await within(dialog).findByLabelText("Invite link")).toHaveValue(
      `${window.location.origin}/join-team#token=${TOKEN}`,
    );
  });
});
