// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SignupApprovals } from "@/components/approvals/SignupApprovals";
import type { ApprovalCaseDetail, ApprovalCaseQueue } from "@/lib/api/types";

vi.stubGlobal("React", React);

const listUsers = vi.hoisted(() => vi.fn(async () => []));
const listApprovalCases = vi.hoisted(() =>
  vi.fn<(params?: { status?: string; kind?: string }) => Promise<ApprovalCaseQueue>>(
    async () => ({ approvalCases: [], nextCursor: null }),
  ),
);
const getApprovalCase = vi.hoisted(() =>
  vi.fn<(caseId: string) => Promise<ApprovalCaseDetail>>(async () => {
    throw new Error("no case");
  }),
);
const getTaxonomy = vi.hoisted(() =>
  vi.fn(async () => ({ categories: [], materials: [], finishes: [] })),
);

vi.mock("@/lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")),
  listUsers,
  listApprovalCases,
  getApprovalCase,
  getTaxonomy,
}));

const pendingCase: ApprovalCaseDetail = {
  approvalCase: {
    id: "apc_business",
    kind: "business_client",
    status: "pending",
    version: 1,
    applicationRevision: 1,
    submittedAt: "2026-09-19T00:00:00.000Z",
    decidedAt: null,
    rejectionReason: null,
    suspensionReason: null,
    updatedAt: "2026-09-19T00:00:00.000Z",
  },
  applicant: {
    id: "user_client",
    email: "ana@bautista.ph",
    name: "Ana Bautista",
    createdAt: "2026-08-01T00:00:00.000Z",
  },
  history: [],
  clientProfile: {
    clientKind: "personal",
    businessName: "Bautista Trading",
    businessNature: "Events",
    updatedAt: "2026-09-19T00:00:00.000Z",
  },
  application: {
    businessName: "Bautista Trading",
    businessNature: "Events",
    accountType: "organization",
  },
};

afterEach(() => {
  cleanup();
  listUsers.mockReset();
  listUsers.mockResolvedValue([]);
  listApprovalCases.mockReset();
  listApprovalCases.mockResolvedValue({ approvalCases: [], nextCursor: null });
  getApprovalCase.mockReset();
  getTaxonomy.mockReset();
  getTaxonomy.mockResolvedValue({ categories: [], materials: [], finishes: [] });
});

it("shows a pending business application in the sign-up queue", async () => {
  listApprovalCases.mockImplementation(async ({ status } = {}) => ({
    approvalCases:
      status === "pending"
        ? [{ ...pendingCase.approvalCase, applicant: pendingCase.applicant }]
        : [],
    nextCursor: null,
  }));
  getApprovalCase.mockResolvedValue(pendingCase);

  render(<SignupApprovals />);

  expect(await screen.findByText("Bautista Trading")).toBeInTheDocument();
  expect(screen.getByText(/Organization client/)).toBeInTheDocument();
  expect(screen.getByText("Events")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
});
