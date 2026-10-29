// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/lib/api/types";
import { ROLE_NAV } from "@/lib/nav";

const { listUsers, listApprovalCases, updateUserAccount } = vi.hoisted(() => ({
  listUsers: vi.fn(),
  // Mocked so the page never reaches a real fetch: the table shows its loading
  // skeleton until both directory reads settle, and a real network error
  // settles at a different speed on every machine.
  listApprovalCases: vi.fn(),
  updateUserAccount: vi.fn(),
}));

vi.stubGlobal("React", React);

class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/roles",
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return { ...actual, listUsers, listApprovalCases, updateUserAccount };
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

    listApprovalCases.mockResolvedValue({ approvalCases: [], nextCursor: null });

    render(<AdminRolesPage />);

    const table = await screen.findByRole("table");
    // The skeleton table is present before the rows; wait for the data itself.
    expect(await within(table).findByText("Counter was closed")).toBeVisible();
    expect(within(table).getByText("Suspended")).toBeVisible();

    const clientRow = within(table).getByText("Ana Client").closest("tr");
    if (!clientRow) throw new Error("missing client row");
    const suspend = within(clientRow).getByRole("button", { name: "Suspend account" });
    expect(within(clientRow).queryByRole("button", { name: "Restore account" })).not.toBeInTheDocument();
    await user.click(suspend);

    const confirmSuspend = await screen.findByRole("button", { name: "Confirm suspension" });
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

    const remove = within(clientRow).getByRole("button", { name: "Remove account" });
    await user.click(remove);
    const confirmRemove = await screen.findByRole("button", { name: "Confirm removal" });
    expect(confirmRemove).toBeDisabled();
    await user.type(screen.getByLabelText(/Reason \(required/), "Closed the account");
    expect(confirmRemove).toBeDisabled();
    await user.type(screen.getByLabelText(/Type .* to confirm/), "user_client@gridgo.test");
    await waitFor(() => expect(confirmRemove).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    const shopRow = within(table).getByText("North Press").closest("tr");
    if (!shopRow) throw new Error("missing shop row");
    expect(within(shopRow).queryByRole("button", { name: "Suspend account" })).not.toBeInTheDocument();
    await user.click(within(shopRow).getByRole("button", { name: "Restore account" }));
    const confirmRestore = await screen.findByRole("button", { name: "Confirm restore" });
    expect(confirmRestore).toBeDisabled();
    await user.type(screen.getByLabelText(/Reason \(required/), "Payment landed");
    await waitFor(() => expect(confirmRestore).toBeEnabled());
  }, 20000);
});

const LATER = "2026-10-28T10:00:00.000Z";
const EARLIER = "2026-10-01T01:00:00.000Z";
const CREATED = "2020-01-15T00:00:00.000Z";

function manila(iso: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(iso));
}

function namesIn(table: HTMLElement) {
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getByText(/Ana Client|North Press|Ben Rider/).textContent);
}

describe("Admin roles sign-ins", () => {
  it("sorts latest and oldest, filters recorded and empty sign-ins, and does not use the created date", async () => {
    const user = userEvent.setup();
    listUsers.mockResolvedValue([
      person({
        id: "user_north",
        name: "North Press",
        role: "supplier",
        lastAuthenticatedAt: EARLIER,
        createdAt: CREATED,
      }),
      person({
        id: "user_ben",
        name: "Ben Rider",
        role: "rider",
        createdAt: CREATED,
      }),
      person({
        id: "user_ana",
        name: "Ana Client",
        role: "client",
        lastAuthenticatedAt: LATER,
        createdAt: CREATED,
      }),
    ]);
    listApprovalCases.mockResolvedValue({ approvalCases: [], nextCursor: null });

    render(<AdminRolesPage />);

    const directory = await screen.findByRole("table");
    expect(await within(directory).findByText("Ana Client")).toBeVisible();
    for (const header of ["Person", "Platform role", "Account", "Standing", "Last signed in"]) {
      expect(within(directory).getByRole("columnheader", { name: new RegExp(header) })).toBeVisible();
    }
    expect(within(directory).getAllByRole("button", { name: "Change role" }).length).toBeGreaterThan(0);
    expect(within(directory).getAllByRole("button", { name: "Suspend account" }).length).toBeGreaterThan(0);
    expect(within(directory).getAllByRole("button", { name: "Remove account" }).length).toBeGreaterThan(0);
    expect(within(directory).getByText(manila(LATER))).toBeVisible();
    expect(within(directory).getByText("No sign-in recorded")).toBeVisible();
    expect(within(directory).queryByText(manila(CREATED))).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Sign-ins" }));
    const table = screen.getByRole("table");
    expect(namesIn(table)).toEqual(["Ana Client", "North Press", "Ben Rider"]);
    expect(within(table).getByText(manila(EARLIER))).toBeVisible();
    expect(within(table).getByText("No sign-in recorded")).toBeVisible();
    expect(within(table).queryByText(manila(CREATED))).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Oldest" }));
    expect(namesIn(screen.getByRole("table"))).toEqual(["North Press", "Ana Client", "Ben Rider"]);

    await user.click(screen.getByRole("button", { name: "Signed in" }));
    expect(namesIn(screen.getByRole("table"))).toEqual(["North Press", "Ana Client"]);
    expect(screen.getByRole("table")).not.toHaveTextContent("No sign-in recorded");
    expect(screen.getByRole("table")).not.toHaveTextContent("Ben Rider");

    await user.click(screen.getByRole("button", { name: "No sign-in recorded" }));
    expect(namesIn(screen.getByRole("table"))).toEqual(["Ben Rider"]);
    expect(screen.getByRole("table")).not.toHaveTextContent("Ana Client");
    expect(screen.getByRole("table")).not.toHaveTextContent(manila(CREATED));

    await user.click(screen.getByRole("button", { name: "All" }));
    await user.type(screen.getByPlaceholderText("Filter people…"), "north");
    expect(namesIn(screen.getByRole("table"))).toEqual(["North Press"]);
  }, 20000);

  it("lists every account on Sign-ins whatever the Directory's Founding Tester filter", async () => {
    const user = userEvent.setup();
    const ana = person({
      id: "user_ana",
      name: "Ana Client",
      role: "client",
      foundingTester: true,
      lastAuthenticatedAt: LATER,
    });
    const north = person({
      id: "user_north",
      name: "North Press",
      role: "supplier",
      lastAuthenticatedAt: EARLIER,
    });
    listUsers.mockImplementation(
      async (role?: string, filter?: { foundingTester?: boolean }) =>
        role === "client" && filter?.foundingTester === true ? [ana] : [ana, north],
    );
    listApprovalCases.mockResolvedValue({ approvalCases: [], nextCursor: null });

    render(<AdminRolesPage />);
    expect(await within(await screen.findByRole("table")).findByText("North Press")).toBeVisible();

    const testerFilter = screen.getByRole("group", { name: "Founding Tester" });
    await user.click(within(testerFilter).getByRole("button", { name: "Founding Testers" }));
    await waitFor(() => expect(screen.queryByText("North Press")).toBeNull());
    expect(within(screen.getByRole("table")).getByText("Ana Client")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Sign-ins" }));
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(namesIn(screen.getByRole("table"))).toEqual(["Ana Client", "North Press"]);

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());
    expect(namesIn(screen.getByRole("table"))).toEqual(["Ana Client", "North Press"]);

    await user.click(screen.getByRole("tab", { name: "Directory" }));
    expect(await within(screen.getByRole("table")).findByText("Ana Client")).toBeVisible();
    expect(screen.queryByText("North Press")).toBeNull();
    expect(screen.getByText("Client accounts only.")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Sign-ins" }));
    expect(namesIn(screen.getByRole("table"))).toEqual(["Ana Client", "North Press"]);
  }, 20000);

  it("keeps Roles on Super Admin and off Operations", () => {
    expect(ROLE_NAV.super_admin.some((item) => item.href === "/admin/roles" && item.label === "Roles")).toBe(
      true,
    );
    expect(ROLE_NAV.ops_admin.some((item) => item.label === "Roles" || item.href.includes("roles"))).toBe(
      false,
    );
  });
});
