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
    expect(visibleNames(table)).toHaveLength(4);

    // Account → Suspended is accreditation only: the shop Operations suspended.
    await pickFacet(user, "Account", "Suspended");
    expect(visibleNames(table)).toEqual(["Dara Cruz"]);
    await pickFacet(user, "Account", "Suspended");
    expect(visibleNames(table)).toHaveLength(4);

    // Standing → Suspended is the account hold, never the accreditation.
    await pickFacet(user, "Standing", "Suspended");
    expect(visibleNames(table)).toEqual(["North Press"]);
    expect(within(table).getByText("Counter was closed")).toBeVisible();
    await pickFacet(user, "Standing", "Suspended");

    await pickFacet(user, "Standing", "Removed");
    expect(visibleNames(table)).toEqual(["Rico Santos"]);
    expect(within(table).getByText("Left the fleet")).toBeVisible();
    await pickFacet(user, "Standing", "Removed");

    // Missing standing (an older API) reads as Active.
    await pickFacet(user, "Standing", "Active");
    expect(visibleNames(table)).toEqual(["Dara Cruz", "Ana Reyes"]);
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

    const ricoRow = within(table).getByText("Rico Santos").closest("tr");
    if (!ricoRow) throw new Error("missing Rico row");
    expect(
      within(ricoRow).getByRole("button", { name: "Restore account" }),
    ).toBeVisible();
    expect(
      within(ricoRow).queryByRole("button", { name: "Remove account" }),
    ).not.toBeInTheDocument();
  });
});
