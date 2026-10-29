// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SignupApprovals } from "@/components/approvals/SignupApprovals";
import type { User } from "@/lib/api/types";

vi.stubGlobal("React", React);

const listUsers = vi.hoisted(() => vi.fn<(role?: string) => Promise<User[]>>(async () => []));

vi.mock("@/lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")),
  listUsers,
  listApprovalCases: vi.fn(async () => ({ approvalCases: [], nextCursor: null })),
  getApprovalCase: vi.fn(async () => {
    throw new Error("no case");
  }),
  getTaxonomy: vi.fn(async () => ({ categories: [], materials: [], finishes: [] })),
}));

const shop: User = {
  id: "user_shop",
  email: "ana@alphaprint.ph",
  name: "Ana Cruz",
  role: "supplier",
  supplierName: "Alpha Print",
  verificationStatus: "pending",
  createdAt: "2026-10-01T00:00:00.000Z",
};

function withSuppliers(suppliers: User[]) {
  listUsers.mockImplementation(async (role) => (role === "supplier" ? suppliers : []));
}

afterEach(() => {
  cleanup();
  listUsers.mockReset();
});

it("names the contact person from the shop details, not the sign-up name", async () => {
  withSuppliers([{ ...shop, contactName: "Bea Lim" }]);

  render(<SignupApprovals />);

  expect(await screen.findByText("Alpha Print")).toBeInTheDocument();
  expect(screen.getByText("Supplier · Bea Lim · ana@alphaprint.ph")).toBeInTheDocument();
  expect(screen.queryByText(/Ana Cruz/)).not.toBeInTheDocument();
});

it("falls back to the account holder when the shop has no contact person", async () => {
  withSuppliers([shop]);

  render(<SignupApprovals />);

  expect(await screen.findByText("Alpha Print")).toBeInTheDocument();
  expect(screen.getByText("Supplier · Ana Cruz · ana@alphaprint.ph")).toBeInTheDocument();
});
