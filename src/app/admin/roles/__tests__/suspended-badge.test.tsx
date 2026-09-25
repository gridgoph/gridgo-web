// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import AdminRolesPage from "@/app/admin/roles/page";
import type { ApprovalCaseQueue, User } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

vi.stubGlobal("React", React);

const SEP_18 = "2026-09-18T02:00:00.000Z";

const listUsers = vi.hoisted(() => vi.fn<() => Promise<User[]>>());
const listApprovalCases = vi.hoisted(() => vi.fn<() => Promise<ApprovalCaseQueue>>());

vi.mock("@/lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")),
  listUsers,
  listApprovalCases,
}));

afterEach(cleanup);

it("marks suspended people and points to the way back", async () => {
  listUsers.mockResolvedValue([
    {
      id: "user_dara",
      email: "dara@blueprint.ph",
      name: "Dara Cruz",
      role: "supplier",
      supplierName: "Dara Blueprint",
      verificationStatus: "suspended",
    },
    { id: "user_ops", email: "ana@gridgo.ph", name: "Ana Reyes", role: "ops_admin" },
  ]);
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
        decidedBy: "user_ops",
      },
    ],
    nextCursor: null,
  });

  render(<AdminRolesPage />);

  const link = await screen.findByRole("button", { name: "Review suspended accounts" });
  expect(link).toHaveAttribute("href", "/admin/verification?tab=signups&show=suspended");
  expect(
    screen.getByText("1 account is suspended.", { exact: false }),
  ).toBeInTheDocument();

  // The table may render as cards in jsdom; the account cell reads the same either way.
  expect(
    screen.getAllByText(
      `Suspended on ${formatDate(SEP_18)} by Ana Reyes: Unpaid shop rent`,
    ),
  ).not.toHaveLength(0);
  expect(
    screen.getAllByText("Suspended", { selector: "span, p" }).length,
  ).toBeGreaterThan(0);
  expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
  expect(listApprovalCases).toHaveBeenCalledWith({ status: "suspended" });
});
