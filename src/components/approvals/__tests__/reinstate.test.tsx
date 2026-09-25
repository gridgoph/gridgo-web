// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SignupApprovals } from "@/components/approvals/SignupApprovals";
import type {
  ApprovalCaseDetail,
  ApprovalCaseQueue,
  ApprovalCaseQueueItem,
  ApprovalDecisionResult,
  User,
} from "@/lib/api/types";
import { formatDate } from "@/lib/format";

vi.stubGlobal("React", React);

// Base UI's checkbox dispatches a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {
  constructor(type: string, init?: PointerEventInit) {
    super(type, init);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

const SEP_18 = "2026-09-18T02:00:00.000Z";

const listUsers = vi.hoisted(() =>
  vi.fn<(role?: string) => Promise<User[]>>(async () => []),
);
const listApprovalCases = vi.hoisted(() =>
  vi.fn<(params?: { status?: string; kind?: string }) => Promise<ApprovalCaseQueue>>(
    async () => ({ approvalCases: [], nextCursor: null }),
  ),
);
const getApprovalCase = vi.hoisted(() =>
  vi.fn<(caseId: string) => Promise<ApprovalCaseDetail>>(),
);
const decideApprovalCase = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<ApprovalDecisionResult>>(),
);
const setUserVerification = vi.hoisted(() => vi.fn(async () => ({}) as User));
const getTaxonomy = vi.hoisted(() =>
  vi.fn(async () => ({ categories: [], materials: [], finishes: [] })),
);

vi.mock("@/lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")),
  listUsers,
  listApprovalCases,
  getApprovalCase,
  decideApprovalCase,
  setUserVerification,
  getTaxonomy,
}));

const dara: User = {
  id: "user_dara",
  email: "dara@blueprint.ph",
  name: "Dara Cruz",
  role: "supplier",
  supplierName: "Dara Blueprint",
  verificationStatus: "suspended",
  verificationNote: "Unpaid shop rent",
  verifiedAt: SEP_18,
  verifiedBy: "user_ops",
};

const pendingRider: User = {
  id: "user_rider",
  email: "rafa@rider.ph",
  name: "Rafa Lim",
  role: "rider",
  verificationStatus: "pending",
};

const daraCase: ApprovalCaseQueueItem = {
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
  applicant: { id: "user_dara", email: dara.email, name: dara.name, createdAt: "" },
  decidedBy: "user_ops",
  decidedByName: "Ana Reyes",
};

const daraDetail: ApprovalCaseDetail = {
  approvalCase: { ...daraCase, version: 4 },
  applicant: daraCase.applicant,
  history: [],
  suspendedServiceLines: [
    {
      id: "svc_tarp",
      name: "Tarpaulin printing",
      suspendedAt: SEP_18,
      suspendReason: "supplier_verification_suspended",
      suspendedWithAccount: true,
    },
    {
      id: "svc_sticker",
      name: "Stickers",
      suspendedAt: SEP_18,
      suspendReason: "supplier_verification_suspended",
      suspendedWithAccount: true,
    },
    {
      id: "svc_mug",
      name: "Mugs",
      suspendedAt: "2026-09-02T00:00:00.000Z",
      suspendReason: "Ink smudging",
      suspendedWithAccount: false,
    },
  ],
};

function serve({ withCase = true } = {}) {
  listUsers.mockImplementation(async (role?: string) =>
    role === "supplier" ? [dara] : role === "rider" ? [pendingRider] : [],
  );
  listApprovalCases.mockImplementation(async (params) => ({
    approvalCases:
      withCase && params?.status === "suspended" && !params.kind ? [daraCase] : [],
    nextCursor: null,
  }));
  getApprovalCase.mockResolvedValue(daraDetail);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  listUsers.mockReset();
  listApprovalCases.mockReset();
  listApprovalCases.mockResolvedValue({ approvalCases: [], nextCursor: null });
});

const banner = `Suspended on ${formatDate(SEP_18)} by Ana Reyes:`;

async function openReinstate() {
  const note = await screen.findByRole("note", { name: "Dara Blueprint is suspended" });
  fireEvent.click(within(note).getByRole("button", { name: "Reinstate" }));
  return screen.findByRole("alertdialog");
}

it("filters the queue down to suspended accounts", async () => {
  serve();
  const onViewChange = vi.fn();
  const { rerender } = render(<SignupApprovals view="all" onViewChange={onViewChange} />);

  expect(await screen.findByText("Rafa Lim")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Suspended (1)" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^Suspended/ }));
  expect(onViewChange).toHaveBeenCalledWith("suspended");

  rerender(<SignupApprovals view="suspended" onViewChange={onViewChange} />);
  expect(screen.getByText("Dara Blueprint")).toBeInTheDocument();
  expect(screen.queryByText("Rafa Lim")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /Waiting for a decision/ })).toBeNull();
});

it("says nobody is suspended when the filter is empty", async () => {
  listUsers.mockResolvedValue([]);
  render(<SignupApprovals view="suspended" />);
  expect(await screen.findByText("Nobody is suspended")).toBeInTheDocument();
});

it("leads a suspended account with when, who and why", async () => {
  serve();
  render(<SignupApprovals />);
  const note = await screen.findByRole("note", { name: "Dara Blueprint is suspended" });
  expect(note).toHaveTextContent(`${banner} Unpaid shop rent`);
  expect(within(note).getAllByRole("button")).toHaveLength(1);
  // Not also listed as an ordinary decided account with a second reinstate.
  expect(screen.getAllByText("Dara Blueprint")).toHaveLength(1);
});

it("pre-ticks the lines suspended with the account and locks the others", async () => {
  serve();
  render(<SignupApprovals />);
  const dialog = await openReinstate();

  const tarp = await within(dialog).findByRole("checkbox", {
    name: "Tarpaulin printing",
  });
  const sticker = within(dialog).getByRole("checkbox", { name: "Stickers" });
  const mug = within(dialog).getByRole("checkbox", { name: "Mugs" });
  expect(tarp).toHaveAttribute("aria-checked", "true");
  expect(sticker).toHaveAttribute("aria-checked", "true");
  expect(mug).toHaveAttribute("aria-checked", "false");
  expect(mug).toHaveAttribute("aria-disabled", "true");
  expect(within(dialog).getByText(/Suspended on its own/)).toBeInTheDocument();
  expect(
    within(dialog).getByText(
      "Dara Blueprint can be matched to new work again and 2 service lines go back live; the other one stays suspended.",
    ),
  ).toBeInTheDocument();
});

it("requires a note before reinstating", async () => {
  serve();
  render(<SignupApprovals />);
  const dialog = await openReinstate();
  await within(dialog).findByRole("checkbox", { name: "Stickers" });

  fireEvent.click(within(dialog).getByRole("button", { name: "Reinstate" }));

  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Add a note for the record before reinstating this account.",
  );
  expect(decideApprovalCase).not.toHaveBeenCalled();
});

it("sends the note and only the ticked lines, then shows what came back", async () => {
  serve();
  decideApprovalCase.mockResolvedValue({
    ...daraDetail,
    restoredServiceIds: ["svc_tarp"],
  });
  render(<SignupApprovals />);
  const dialog = await openReinstate();

  fireEvent.click(await within(dialog).findByRole("checkbox", { name: "Stickers" }));
  fireEvent.change(within(dialog).getByLabelText("Note for the record (required)"), {
    target: { value: "Rent settled" },
  });
  const loadsBefore = listUsers.mock.calls.length;
  fireEvent.click(within(dialog).getByRole("button", { name: "Reinstate" }));

  await waitFor(() => expect(decideApprovalCase).toHaveBeenCalledTimes(1));
  const [caseId, action, body] = decideApprovalCase.mock.calls[0]!;
  expect(caseId).toBe("apc_dara");
  expect(action).toBe("restore");
  expect(body).toMatchObject({
    expectedVersion: 4,
    note: "Rent settled",
    restoreServiceIds: ["svc_tarp"],
  });
  expect(body).toHaveProperty("requestId");

  const status = await screen.findByText("Dara Blueprint is reinstated.");
  const notice = status.closest("[role=status]") as HTMLElement;
  expect(notice).toHaveTextContent("Back live: Tarpaulin printing.");
  expect(notice).toHaveTextContent("Still suspended: Stickers, Mugs.");
  await waitFor(() => expect(listUsers.mock.calls.length).toBeGreaterThan(loadsBefore));
});

it("reinstates the account alone, and says so, on an API without line restore", async () => {
  serve();
  const { suspendedServiceLines: _lines, ...oldDetail } = daraDetail;
  getApprovalCase.mockResolvedValue(oldDetail);
  decideApprovalCase.mockResolvedValue(oldDetail);
  render(<SignupApprovals />);
  const dialog = await openReinstate();

  expect(
    await within(dialog).findByText(/every suspended service line stays suspended/),
  ).toBeInTheDocument();
  expect(within(dialog).queryByRole("checkbox")).toBeNull();

  fireEvent.change(within(dialog).getByLabelText("Note for the record (required)"), {
    target: { value: "Rent settled" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Reinstate" }));
  await waitFor(() => expect(decideApprovalCase).toHaveBeenCalled());
  expect(decideApprovalCase.mock.calls[0]![2]).not.toHaveProperty("restoreServiceIds");
});

it("falls back to the verification route for a suspension with no case", async () => {
  serve({ withCase: false });
  listUsers.mockImplementation(async (role?: string) =>
    role === "supplier"
      ? [dara]
      : role === "rider"
        ? []
        : [
            {
              id: "user_ops",
              name: "Ana Reyes",
              email: "ana@gridgo.ph",
              role: "ops_admin",
            },
          ],
  );
  render(<SignupApprovals />);
  const note = await screen.findByRole("note", { name: "Dara Blueprint is suspended" });
  expect(note).toHaveTextContent(`${banner} Unpaid shop rent`);

  const dialog = await openReinstate();
  fireEvent.change(within(dialog).getByLabelText("Note for the record (required)"), {
    target: { value: "Rent settled" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Reinstate" }));

  await waitFor(() =>
    expect(setUserVerification).toHaveBeenCalledWith("user_dara", {
      status: "approved",
      note: "Rent settled",
      reason: "Rent settled",
    }),
  );
  expect(decideApprovalCase).not.toHaveBeenCalled();
});
