// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { StaffDesk } from "@/app/admin/staff/_components/StaffDesk";
import type { StaffInvite } from "@/lib/api/types";

vi.stubGlobal("React", React);

const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
const waiting: StaffInvite = {
  id: "invite_waiting",
  roleCode: "hub_staff",
  createdBy: "admin",
  createdAt: "2026-10-01T00:00:00.000Z",
  expiresAt: future,
  redeemedBy: null,
  redeemedAt: null,
  revokedAt: null,
};

const api = vi.hoisted(() => ({
  listStaffRoles: vi.fn(async () => [
    { code: "hub_staff", name: "Hub staff", canHandout: true },
  ]),
  listStaffInvites: vi.fn(async () => [] as StaffInvite[]),
  listStaff: vi.fn(async () => [
    {
      userId: "user_staff",
      name: "Hub Person",
      roleCode: "hub_staff",
      active: true,
      updatedAt: "2026-10-02T00:00:00.000Z",
    },
  ]),
  listHubHandouts: vi.fn(async () => ({
    handouts: [],
    staffTotals: [{ staffId: "user_staff", name: "Hub Person", count: 12 }],
    nextCursor: null,
  })),
  createStaffInvite: vi.fn(async () => ({
    invite: waiting,
    code: "secret-invite-code-123",
  })),
  revokeStaffInvite: vi.fn(async () => undefined),
  updateStaffMember: vi.fn(async () => ({}) as never),
  createStaffRole: vi.fn(async () => ({}) as never),
}));

vi.mock("@/lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")),
  ...api,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("shows the invite code once, then forgets it", async () => {
  render(<StaffDesk />);

  expect((await screen.findAllByText("Hub Person")).length).toBeGreaterThan(0);
  expect(screen.getAllByText("12").length).toBeGreaterThan(0);

  await userEvent.clear(screen.getByLabelText("Code works for (days)"));
  await userEvent.type(screen.getByLabelText("Code works for (days)"), "3");
  await userEvent.click(screen.getByRole("button", { name: "Create invite code" }));

  expect(api.createStaffInvite).toHaveBeenCalledWith({
    roleCode: "hub_staff",
    expiresInDays: 3,
  });
  expect(await screen.findByLabelText("Invite code")).toHaveTextContent(
    "secret-invite-code-123",
  );
  expect(screen.getByText(/only time the code is shown/)).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Done, create another" }));
  expect(screen.queryByText("secret-invite-code-123")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create invite code" })).toBeInTheDocument();
});

it("revokes an unused invite after confirming", async () => {
  api.listStaffInvites.mockResolvedValue([waiting]);
  render(<StaffDesk />);

  const table = await screen.findByRole("table", { name: "Staff invites" });
  expect(within(table).getByText("Not used yet")).toBeInTheDocument();
  await userEvent.click(within(table).getByRole("button", { name: "Revoke" }));
  expect(screen.getByText("Revoke this Hub staff invite?")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Revoke invite" }));

  expect(api.revokeStaffInvite).toHaveBeenCalledWith("invite_waiting");
  expect(await screen.findByText(/The code no longer works/)).toBeInTheDocument();
});

it("refuses an invite that would last longer than 30 days", async () => {
  render(<StaffDesk />);
  const days = await screen.findByLabelText("Code works for (days)");
  await userEvent.clear(days);
  await userEvent.type(days, "45");
  expect(screen.getByText("Choose 1 to 30 days.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create invite code" })).toBeDisabled();
});
