// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/lib/api/types";

const { listUsers, updateUserAccount } = vi.hoisted(() => ({
  listUsers: vi.fn(),
  updateUserAccount: vi.fn(),
}));

vi.stubGlobal("React", React);

class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return { ...actual, listUsers, updateUserAccount };
});

import AdminRolesPage from "@/app/admin/roles/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function person(partial: Partial<User> & Pick<User, "id" | "name" | "role">): User {
  return {
    email: `${partial.id}@gridgo.test`,
    ...partial,
  };
}

describe("Admin roles account actions", () => {
  it("keeps suspend, remove, and restore disabled until a reason is entered", async () => {
    const user = userEvent.setup();
    listUsers.mockResolvedValue([
      person({
        id: "user_client",
        name: "Ana Client",
        role: "client",
        accountStatus: "active",
      }),
      person({
        id: "user_shop",
        name: "North Press",
        role: "supplier",
        accountStatus: "suspended",
        accountStatusReason: "Counter was closed",
      }),
    ]);

    render(<AdminRolesPage />);

    const table = await screen.findByRole("table");
    expect(within(table).getByText("Counter was closed")).toBeVisible();
    expect(within(table).getByText("Suspended")).toBeVisible();

    const clientRow = within(table).getByText("Ana Client").closest("tr");
    if (!clientRow) throw new Error("missing client row");
    const suspend = within(clientRow).getByRole("button", { name: "Suspend" });
    expect(within(clientRow).queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
    await user.click(suspend);

    const confirmSuspend = await screen.findByRole("button", { name: "Confirm suspend" });
    expect(confirmSuspend).toBeDisabled();
    await user.type(screen.getByLabelText(/Reason \(required/), "Missed a payment");
    await waitFor(() => expect(confirmSuspend).toBeEnabled());
    updateUserAccount.mockResolvedValue(
      person({
        id: "user_client",
        name: "Ana Client",
        role: "client",
        accountStatus: "suspended",
        accountStatusReason: "Missed a payment",
      }),
    );
    await user.click(confirmSuspend);
    await waitFor(() =>
      expect(updateUserAccount).toHaveBeenCalledWith("user_client", {
        status: "suspended",
        reason: "Missed a payment",
      }),
    );

    const remove = within(clientRow).getByRole("button", { name: "Remove" });
    await user.click(remove);
    const confirmRemove = await screen.findByRole("button", { name: "Confirm remove" });
    expect(confirmRemove).toBeDisabled();
    await user.type(screen.getByLabelText(/Reason \(required/), "Closed the account");
    expect(confirmRemove).toBeDisabled();
    await user.type(screen.getByLabelText(/Type .* to confirm/), "user_client@gridgo.test");
    await waitFor(() => expect(confirmRemove).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    const shopRow = within(table).getByText("North Press").closest("tr");
    if (!shopRow) throw new Error("missing shop row");
    expect(within(shopRow).queryByRole("button", { name: "Suspend" })).not.toBeInTheDocument();
    await user.click(within(shopRow).getByRole("button", { name: "Restore" }));
    const confirmRestore = await screen.findByRole("button", { name: "Confirm restore" });
    expect(confirmRestore).toBeDisabled();
    await user.type(screen.getByLabelText(/Reason \(required/), "Payment landed");
    await waitFor(() => expect(confirmRestore).toBeEnabled());
  }, 20000);
});
