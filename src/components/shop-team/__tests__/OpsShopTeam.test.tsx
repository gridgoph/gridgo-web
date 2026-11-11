// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpsShopTeam } from "@/components/shop-team/OpsShopTeam";
import type { ShopMember } from "@/lib/api/types";

const api = vi.hoisted(() => ({ getOpsShopTeam: vi.fn(), removeOpsShopMember: vi.fn() }));
vi.stubGlobal("React", React);
vi.mock("@/lib/api/shop-team", () => api);
vi.mock("@/components/ui/toast", () => ({ toast: { add: vi.fn() } }));

let members: ShopMember[];

beforeEach(() => {
  members = [
    { userId: "user_owner", name: "Olive Owner", role: "owner", status: "active" },
    { userId: "user_bea", name: "Bea Staff", role: "staff", status: "active" },
    { userId: "user_pia", name: "Pia Pending", role: "staff", status: "pending" },
    { userId: "user_rex", name: "Rex Removed", role: "staff", status: "removed" },
  ];
  api.getOpsShopTeam.mockImplementation(async () => members);
  api.removeOpsShopMember.mockImplementation(async (_shop: string, userId: string) => {
    members = members.map((m) => (m.userId === userId ? { ...m, status: "removed" } : m));
    return members.find((m) => m.userId === userId);
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Operations: a shop's team", () => {
  it("lists each login with role and status", async () => {
    render(<OpsShopTeam shopId="user_owner" />);
    const rows = await screen.findAllByTestId("ops-team-member");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/Olive Owner.*Owner.*Active/),
      expect.stringMatching(/Bea Staff.*Staff.*Active/),
      expect.stringMatching(/Pia Pending.*Staff.*Waiting for Owner/),
      expect.stringMatching(/Rex Removed.*Staff.*Removed/),
    ]);
    expect(api.getOpsShopTeam).toHaveBeenCalledWith("user_owner");
    // The last Owner keeps access; removed people have nothing to remove.
    expect(screen.getByRole("button", { name: "Remove Olive Owner's access" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Remove Rex Removed's access" })).toBeNull();
  });

  it("removes a Staff login after a confirmation", async () => {
    render(<OpsShopTeam shopId="user_owner" />);
    await userEvent.click(await screen.findByRole("button", { name: "Remove Bea Staff's access" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove access" }));
    expect(api.removeOpsShopMember).toHaveBeenCalledWith("user_owner", "user_bea");
    await waitFor(() =>
      expect(
        screen.getAllByTestId("ops-team-member").find((row) => row.textContent?.includes("Bea")),
      ).toHaveTextContent("Removed"),
    );
  });
});
