// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/lib/api/types";

const { listUsers, listApprovalCases } = vi.hoisted(() => ({
  listUsers: vi.fn(),
  listApprovalCases: vi.fn(),
}));

vi.stubGlobal("React", React);
vi.stubGlobal("PointerEvent", MouseEvent);
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/lib/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, listUsers, listApprovalCases };
});

import AdminRolesPage from "@/app/admin/roles/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function person(partial: Partial<User> & Pick<User, "id" | "name" | "role">): User {
  return { email: `${partial.id}@gridgo.test`, ...partial };
}

const tester = person({
  id: "c1",
  name: "Ana Tester",
  role: "client",
  foundingTester: true,
});
const newcomer = person({
  id: "c2",
  name: "Ben Newcomer",
  role: "client",
  foundingTester: false,
});
// The API never sends the field on these rows; the page must not draw it even if it did.
const shop = person({
  id: "s1",
  name: "North Press",
  role: "supplier",
  foundingTester: true,
} as User);
const rider = person({
  id: "r1",
  name: "Rae Rider",
  role: "rider",
  foundingTester: true,
} as User);

async function rowFor(name: string) {
  const table = await screen.findByRole("table");
  const cell = await within(table).findByText(name);
  const row = cell.closest("tr");
  if (!row) throw new Error(`missing row for ${name}`);
  return within(row);
}

describe("Founding Tester on Roles", () => {
  it("badges client rows with the label, never a shop or rider row", async () => {
    listUsers.mockResolvedValue([tester, newcomer, shop, rider]);
    listApprovalCases.mockResolvedValue({ approvalCases: [], nextCursor: null });
    render(<AdminRolesPage />);

    expect((await rowFor("Ana Tester")).getByText("Founding Tester")).toBeVisible();
    expect((await rowFor("Ben Newcomer")).queryByText("Founding Tester")).toBeNull();
    expect((await rowFor("North Press")).queryByText("Founding Tester")).toBeNull();
    expect((await rowFor("Rae Rider")).queryByText("Founding Tester")).toBeNull();
  });

  it("links client rows to their account and not other rows", async () => {
    listUsers.mockResolvedValue([tester, shop]);
    listApprovalCases.mockResolvedValue({ approvalCases: [], nextCursor: null });
    render(<AdminRolesPage />);

    const client = await rowFor("Ana Tester");
    // A row action link renders as a 44px button with the verb as its name.
    expect(client.getByText("Open client account").closest("a")).toHaveAttribute(
      "href",
      "/admin/founding-testers/c1",
    );
    expect((await rowFor("North Press")).queryByText("Open client account")).toBeNull();
  });

  it("filters to Founding Testers, Not yet, and back to everyone through the API", async () => {
    listUsers.mockImplementation(
      async (role?: string, filter?: { foundingTester?: boolean }) => {
        if (role === "client" && filter?.foundingTester === true) return [tester];
        if (role === "client" && filter?.foundingTester === false) return [newcomer];
        return [tester, newcomer, shop];
      },
    );
    listApprovalCases.mockResolvedValue({ approvalCases: [], nextCursor: null });
    render(<AdminRolesPage />);
    await rowFor("North Press");
    expect(listUsers).toHaveBeenLastCalledWith(undefined, { foundingTester: undefined });

    const filter = screen.getByRole("group", { name: "Founding Tester" });
    fireEvent.click(within(filter).getByRole("button", { name: "Founding Testers" }));
    await waitFor(() =>
      expect(listUsers).toHaveBeenLastCalledWith("client", { foundingTester: true }),
    );
    await waitFor(() => expect(screen.queryByText("North Press")).toBeNull());
    expect(await rowFor("Ana Tester")).toBeTruthy();
    expect(screen.queryByText("Ben Newcomer")).toBeNull();
    expect(screen.getByText("Client accounts only.")).toBeVisible();

    fireEvent.click(within(filter).getByRole("button", { name: "Not yet" }));
    await waitFor(() =>
      expect(listUsers).toHaveBeenLastCalledWith("client", { foundingTester: false }),
    );
    await waitFor(() => expect(screen.queryByText("Ana Tester")).toBeNull());
    expect(await rowFor("Ben Newcomer")).toBeTruthy();

    fireEvent.click(within(filter).getByRole("button", { name: "All" }));
    await waitFor(() =>
      expect(listUsers).toHaveBeenLastCalledWith(undefined, {
        foundingTester: undefined,
      }),
    );
    expect(await rowFor("North Press")).toBeTruthy();
  });

  it("says when no client has earned the label yet", async () => {
    listUsers.mockImplementation(async (role?: string) =>
      role === "client" ? [] : [newcomer],
    );
    listApprovalCases.mockResolvedValue({ approvalCases: [], nextCursor: null });
    render(<AdminRolesPage />);
    await rowFor("Ben Newcomer");
    fireEvent.click(
      within(screen.getByRole("group", { name: "Founding Tester" })).getByRole("button", {
        name: "Founding Testers",
      }),
    );
    expect(await screen.findByText("No Founding Testers yet")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Show everyone" }));
    expect(await rowFor("Ben Newcomer")).toBeTruthy();
  });
});
