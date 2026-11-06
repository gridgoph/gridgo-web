// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AdminRolesPage from "@/app/admin/roles/page";
import type { ApprovalCaseQueue, User } from "@/lib/api/types";

/**
 * gridgoph/gridgo-web#73: accreditation ("Account") and account standing
 * ("Standing") are independent, so each has its own column and facet. The
 * facet filters by exact value, so a composite cell value silently matches
 * nothing; these tests click the facets rather than read the cells.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/roles",
}));

vi.stubGlobal("React", React);

class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

const SEP_18 = "2026-09-18T02:00:00.000Z";

const listUsers = vi.hoisted(() => vi.fn<() => Promise<User[]>>());
const listApprovalCases = vi.hoisted(() => vi.fn<() => Promise<ApprovalCaseQueue>>());

vi.mock("@/lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")),
  listUsers,
  listApprovalCases,
}));

afterEach(cleanup);

const PEOPLE: User[] = [
  {
    id: "user_dara",
    email: "dara@blueprint.ph",
    name: "Dara Cruz",
    role: "supplier",
    supplierName: "Dara Blueprint",
    verificationStatus: "suspended",
    accountStatus: "active",
  },
  {
    id: "user_north",
    email: "north@press.ph",
    name: "North Press",
    role: "supplier",
    accountStatus: "suspended",
    accountStatusReason: "Counter was closed",
  },
  {
    id: "user_rico",
    email: "rico@riders.ph",
    name: "Rico Santos",
    role: "rider",
    accountStatus: "removed",
    accountStatusReason: "Left the fleet",
  },
  { id: "user_ana", email: "ana@gridgo.ph", name: "Ana Reyes", role: "ops_admin" },
];

function mockDirectory() {
  listUsers.mockResolvedValue(PEOPLE);
  listApprovalCases.mockResolvedValue({
    approvalCases: [
      {
        id: "apc_dara",
        kind: "supplier",
        status: "suspended",
        version: 3,
        applicationRevision: 1,
        submittedAt: "2026-08-01T00:00:00.000Z",
        decidedAt: SEP_18,
        rejectionReason: null,
        suspensionReason: "Unpaid shop rent",
        updatedAt: SEP_18,
        applicant: {
          id: "user_dara",
          email: "dara@blueprint.ph",
          name: "Dara Cruz",
          createdAt: "",
        },
        decidedBy: "user_ana",
      },
    ],
    nextCursor: null,
  });
}

function visibleNames(table: HTMLElement): string[] {
  return PEOPLE.map((p) => p.name).filter((name) => within(table).queryByText(name));
}

function peopleSummary(): string {
  const summary = screen.getByText((_, node) => {
    return (
      node?.getAttribute("aria-live") === "polite" && /people/.test(node.textContent ?? "")
    );
  });
  return (summary.textContent ?? "").replace(/\s+/g, " ").trim();
}

async function pickFacet(
  user: ReturnType<typeof userEvent.setup>,
  facet: "Account" | "Standing",
  option: string,
) {
  // The trigger reads "Account" or, with a selection, "Account 1".
  await user.click(
    screen.getByRole("button", { name: new RegExp(`^${facet}( \\d+)?$`) }),
  );
  await user.click(
    await screen.findByRole("button", { name: new RegExp(`^${option}\\s*\\d+$`) }),
  );
  await user.keyboard("{Escape}");
}

describe("Roles Account and Standing facets", () => {
  it("filters accreditation by Account and standing by Standing", async () => {
    const user = userEvent.setup();
    mockDirectory();
    render(<AdminRolesPage />);
    const table = await screen.findByRole("table");
    await within(table).findByText("Dara Cruz");
    // Rico's standing is removed, so he is not a row. Account "Active" is not why.
    expect(visibleNames(table)).toEqual(["Dara Cruz", "North Press", "Ana Reyes"]);
    expect(within(table).queryByText("Rico Santos")).not.toBeInTheDocument();
    expect(within(table).queryByText("Left the fleet")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Standing( \d+)?$/ }));
    expect(screen.queryByRole("button", { name: /^Removed/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Active\s+2$/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Suspended\s+1$/ })).toBeVisible();
    await user.keyboard("{Escape}");

    // Account → Suspended is accreditation only: the shop Operations suspended.
    await pickFacet(user, "Account", "Suspended");
    expect(visibleNames(table)).toEqual(["Dara Cruz"]);
    await pickFacet(user, "Account", "Suspended");
    expect(visibleNames(table)).toEqual(["Dara Cruz", "North Press", "Ana Reyes"]);

    // Standing → Suspended is the account hold, never the accreditation.
    await pickFacet(user, "Standing", "Suspended");
    expect(visibleNames(table)).toEqual(["North Press"]);
    expect(within(table).getByText("Counter was closed")).toBeVisible();
    const northRow = within(table).getByText("North Press").closest("tr");
    if (!northRow) throw new Error("missing North row");
    expect(within(northRow).getByRole("button", { name: "Restore account" })).toBeVisible();
    await pickFacet(user, "Standing", "Suspended");

    // Missing standing (an older API) reads as Active.
    await pickFacet(user, "Standing", "Active");
    expect(visibleNames(table)).toEqual(["Dara Cruz", "Ana Reyes"]);
    await pickFacet(user, "Standing", "Active");

    await user.type(screen.getByPlaceholderText("Filter people…"), "rico@riders.ph");
    // Phone cards and the desktop table both say the search missed.
    expect(screen.getAllByText("No rows match what you searched for.").length).toBeGreaterThan(0);
    expect(screen.queryByText("Rico Santos")).not.toBeInTheDocument();
    expect(screen.queryByText("Left the fleet")).not.toBeInTheDocument();
    await user.clear(screen.getByPlaceholderText("Filter people…"));
    expect(await within(screen.getByRole("table")).findByText("Dara Cruz")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Sign-ins" }));
    const signIns = screen.getByRole("table");
    expect(within(signIns).queryByText("Rico Santos")).not.toBeInTheDocument();
    expect(within(signIns).getByText("Dara Cruz")).toBeVisible();
    expect(within(signIns).getByText("North Press")).toBeVisible();
    expect(within(signIns).getByText("Ana Reyes")).toBeVisible();
  }, 20000);

  it("keeps the account actions distinct from reviewing a suspension", async () => {
    mockDirectory();
    render(<AdminRolesPage />);
    const table = await screen.findByRole("table");

    const daraRow = (await within(table).findByText("Dara Cruz")).closest("tr");
    if (!daraRow) throw new Error("missing Dara row");
    expect(
      within(daraRow).getByRole("button", { name: "Review suspension" }),
    ).toBeVisible();
    expect(
      within(daraRow).getByRole("button", { name: "Suspend account" }),
    ).toBeVisible();
    expect(within(daraRow).getByRole("button", { name: "Remove account" })).toBeVisible();

    expect(within(table).queryByText("Rico Santos")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Removed/ })).not.toBeInTheDocument();

    const northRow = within(table).getByText("North Press").closest("tr");
    if (!northRow) throw new Error("missing North row");
    expect(within(northRow).getByText("Counter was closed")).toBeVisible();
    expect(within(northRow).getByRole("button", { name: "Restore account" })).toBeVisible();
    expect(within(northRow).getByRole("button", { name: "Remove account" })).toBeVisible();
    expect(
      within(northRow).queryByRole("button", { name: "Suspend account" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a removed account out of the page count and both searches", async () => {
    const user = userEvent.setup();
    const listed = [
      {
        id: "user_north",
        email: "north@press.ph",
        name: "North Press",
        role: "client" as const,
        accountStatus: "suspended" as const,
        accountStatusReason: "Counter was closed",
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `user_${index}`,
        email: `person${index}@gridgo.ph`,
        name: `Person ${index}`,
        role: "client" as const,
      })),
    ];
    listUsers.mockResolvedValue([
      ...listed,
      {
        id: "user_rico",
        email: "rico@riders.ph",
        name: "Rico Santos",
        role: "client",
        accountStatus: "removed",
        accountStatusReason: "Left the fleet",
      },
    ]);
    listApprovalCases.mockResolvedValue({ approvalCases: [], nextCursor: null });

    render(<AdminRolesPage />);
    const table = await screen.findByRole("table");
    expect(await within(table).findByText("North Press")).toBeVisible();
    expect(peopleSummary()).toMatch(/of 11 people$/);
    expect(peopleSummary()).not.toMatch(/of 12 people/);

    await user.type(screen.getByPlaceholderText("Filter people…"), "Left the fleet");
    expect(screen.getAllByText("No rows match what you searched for.").length).toBeGreaterThan(0);
    await user.clear(screen.getByPlaceholderText("Filter people…"));
    await user.type(screen.getByPlaceholderText("Filter people…"), "rico@riders.ph");
    expect(screen.getAllByText("No rows match what you searched for.").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("tab", { name: "Sign-ins" }));
    expect(screen.queryByText("Rico Santos")).not.toBeInTheDocument();
    expect(peopleSummary()).toMatch(/of 11 people$/);
    await user.clear(screen.getByPlaceholderText("Filter people…"));
    await user.type(screen.getByPlaceholderText("Filter people…"), "Rico Santos");
    expect(screen.getAllByText("No rows match what you searched for.").length).toBeGreaterThan(0);
  }, 20000);
});
