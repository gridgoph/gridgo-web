// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { ApplicationReviewSheet } from "@/components/approvals/ApplicationReview";
import type { ApprovalCaseDetail } from "@/lib/api/types";

vi.stubGlobal("React", React);

const decideApprovalCase = vi.hoisted(() => vi.fn(async () => ({}) as never));
const requestBusinessPermit = vi.hoisted(() =>
  vi.fn(async () => ({ businessPermitRequired: true as const, version: 2 })),
);

vi.mock("@/lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")),
  decideApprovalCase,
  requestBusinessPermit,
  getFile: vi.fn(async (fileId: string) => ({
    fileId,
    originalFilename: `${fileId}.pdf`,
    contentType: "application/pdf",
    state: "ready",
  })),
  getFileDownloadUrl: vi.fn(async (fileId: string) => `https://files.test/${fileId}`),
}));

afterEach(() => {
  cleanup();
  decideApprovalCase.mockClear();
  requestBusinessPermit.mockClear();
});

const officer = {
  fullName: "Officer Two",
  dateOfBirth: "2004-02-03",
  address: "12 Sample Street",
  phone: "0917 000 0000",
  governmentIdType: "passport",
  governmentIdExpiresOn: "2030-01-01",
  originalId: true,
  detailsMatchId: true,
  studentIdExpiresOn: "2027-06-30",
};

function organizationCase(patch: Partial<ApprovalCaseDetail> = {}): ApprovalCaseDetail {
  return {
    approvalCase: {
      id: "apc_org",
      kind: "business_client",
      status: "pending",
      version: 5,
      applicationRevision: 2,
      submittedAt: "2026-10-05T00:00:00.000Z",
      decidedAt: null,
      rejectionReason: null,
      suspensionReason: null,
      updatedAt: "2026-10-05T00:00:00.000Z",
    },
    applicant: {
      id: "user_org",
      email: "council@example.test",
      name: "Student Council",
      createdAt: "2026-08-01T00:00:00.000Z",
    },
    history: [],
    application: {
      schemaVersion: 1,
      businessName: "Student Council",
      businessNature: "School events",
      accountType: "organization",
      school: "City College",
      organizationEmail: "council@example.test",
      emailVerifiedAt: "2026-10-05T00:00:00.000Z",
      officer,
      documents: {
        government_id: "file_id",
        student_id: "file_student",
        enrollment_document: "file_enrol",
      },
    },
    organization: {
      userId: "user_org",
      name: "Student Council",
      school: "City College",
      email: "council@example.test",
      currentOfficer: {
        id: "officer_1",
        fullName: "Officer One",
        startedAt: "2026-07-01T00:00:00.000Z",
        endedAt: null,
        verifiedAt: "2026-07-01T00:00:00.000Z",
      },
      confirmedAt: null,
      nextConfirmationAt: null,
      confirmationRequestedAt: null,
      approvalCase: null,
      actions: [],
      officerHistory: [
        {
          id: "officer_1",
          fullName: "Officer One",
          startedAt: "2026-07-01T00:00:00.000Z",
          endedAt: null,
          verifiedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    },
    ...patch,
  };
}

it("approves a handover only after every document is marked as looking right", async () => {
  const onDecided = vi.fn();
  render(
    <ApplicationReviewSheet
      detail={organizationCase()}
      onOpenChange={() => {}}
      onDecided={onDecided}
    />,
  );

  expect(await screen.findByText("Incoming officer")).toBeInTheDocument();
  expect(
    screen.getByText(/Officer Two is taking over from Officer One/),
  ).toBeInTheDocument();
  expect(screen.getByText("Current officer")).toBeInTheDocument();
  expect(screen.getByText(/verified with a one-time code/)).toBeInTheDocument();
  // The organization checklist: three required, recognition optional and absent.
  expect(screen.getByText("Primary government ID")).toBeInTheDocument();
  expect(screen.getByText("Student ID")).toBeInTheDocument();
  expect(screen.getByText("Enrolment document")).toBeInTheDocument();
  expect(screen.getByText("School recognition certificate")).toBeInTheDocument();

  const approve = screen.getByRole("button", { name: "Approve" });
  expect(approve).toBeDisabled();
  for (const label of ["Primary government ID", "Student ID", "Enrolment document"]) {
    const group = screen.getByRole("group", { name: `${label}: your check` });
    await userEvent.click(within(group).getByRole("button", { name: "Looks right" }));
  }
  expect(screen.getByText("3 of 3 look right")).toBeInTheDocument();
  expect(approve).toBeEnabled();

  await userEvent.click(approve);
  expect(
    screen.getByText(/Officer Two becomes the officer of record from now/),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Approve application" }));

  expect(decideApprovalCase).toHaveBeenCalledWith(
    "apc_org",
    "approve",
    expect.objectContaining({ expectedVersion: 5 }),
  );
  expect(onDecided).toHaveBeenCalledWith(
    "Officer Two is now the verified officer of Student Council.",
  );
});

it("sends back with a reason written from the marked documents", async () => {
  render(
    <ApplicationReviewSheet
      detail={organizationCase()}
      onOpenChange={() => {}}
      onDecided={() => {}}
    />,
  );

  const group = await screen.findByRole("group", { name: "Student ID: your check" });
  await userEvent.click(within(group).getByRole("button", { name: "Send back" }));
  await userEvent.type(
    screen.getByPlaceholderText("e.g. Expired in August"),
    "Expired in August",
  );
  expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();

  await userEvent.click(screen.getAllByRole("button", { name: "Send back" }).at(-1)!);
  expect(screen.getByLabelText("What they need to fix")).toHaveValue(
    "Please upload these again:\n- Student ID: Expired in August",
  );
  expect(screen.getByText(/The current officer stays in place/)).toBeInTheDocument();
  await userEvent.click(screen.getAllByRole("button", { name: "Send back" }).at(-1)!);

  expect(decideApprovalCase).toHaveBeenCalledWith(
    "apc_org",
    "reject",
    expect.objectContaining({
      expectedVersion: 5,
      reason: "Please upload these again:\n- Student ID: Expired in August",
    }),
  );
});

it("asks a business for the permit, and blocks approval of a pre-checklist case", async () => {
  const business = organizationCase({
    organization: null,
    application: {
      schemaVersion: 1,
      businessName: "Print Buyer Co",
      businessNature: "Retail",
      accountType: "business",
      businessType: "sole_proprietor",
      signatory: officer,
      documents: {
        government_id: "a",
        payout_bank_proof: "b",
        bir_2303: "c",
        dti_certificate: "d",
      },
    },
  });
  const { unmount } = render(
    <ApplicationReviewSheet
      detail={business}
      onOpenChange={() => {}}
      onDecided={() => {}}
    />,
  );
  expect(await screen.findByText("Owner or signatory")).toBeInTheDocument();
  expect(screen.getByText("DTI business name certificate")).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Ask for a business permit" }),
  );
  await userEvent.type(
    screen.getByLabelText("Why the permit is needed"),
    "Address differs",
  );
  await userEvent.click(screen.getByRole("button", { name: "Ask for the permit" }));
  expect(requestBusinessPermit).toHaveBeenCalledWith("apc_org", {
    expectedVersion: 5,
    reason: "Address differs",
  });
  unmount();

  render(
    <ApplicationReviewSheet
      detail={organizationCase({
        organization: null,
        application: {
          businessName: "Old Org",
          businessNature: null,
          accountType: "organization",
        },
      })}
      onOpenChange={() => {}}
      onDecided={() => {}}
    />,
  );
  expect(
    await screen.findByText(/filed before the document checklist/),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
});
