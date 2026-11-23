// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listSupplierVerificationQueue: vi.fn(),
  getSupplierVerificationDetail: vi.fn(),
  getApprovalCase: vi.fn(),
  decideApprovalCase: vi.fn(),
  getFileDownloadUrl: vi.fn(),
}));

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));

vi.stubGlobal("React", React);

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  useSearchParams: () => nav.params,
  usePathname: () => "/admin/shop-verification",
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, ...api };
});

import { ShopVerificationDesk } from "@/components/shop-verification/ShopVerificationDesk";
import { ApiError } from "@/lib/api/client";

function summary(over: Record<string, unknown> = {}) {
  return {
    verified: false,
    verificationState: "being_checked",
    startedAt: "2026-11-01T00:00:00Z",
    deadlineAt: "2026-12-01T00:00:00Z",
    daysLeft: 9,
    countdownDays: null,
    payoutCapMinor: 730000,
    paidBeforeVerificationMinor: 124000,
    remainingCapMinor: 606000,
    capReached: false,
    heldMinor: 86000,
    recoveryDueMinor: 0,
    paidOpenRegularJobs: 2,
    newOrdersPaused: false,
    ...over,
  };
}

const docs = [
  { fileId: "f_id", detectedContentType: "image/jpeg", readyAt: "2026-11-20T06:14:00Z", references: [{ documentType: "valid_id" }] },
  { fileId: "f_permit", detectedContentType: "application/pdf", readyAt: "2026-11-20T06:15:00Z", references: [{ documentType: "business_permit" }] },
];

function shop(over: Record<string, unknown> = {}) {
  return {
    supplierId: "usr_shop_a",
    approvalCaseId: "case_a",
    approvalStatus: "pending",
    shopName: "Shop A",
    verification: summary(),
    verificationDocuments: docs,
    ...over,
  };
}

const ledger = [
  { id: "l1", kind: "released", orderId: "ord_1", amountMinor: 124000, at: "2026-11-10T02:00:00Z" },
  { id: "l2", kind: "held", payoutKey: "stage:ord_2:delivered", orderId: "ord_2", amountMinor: 86000, at: "2026-11-21T02:00:00Z", data: { reason: "verification_payout_cap" } },
];

const approval = {
  approvalCase: { id: "case_a", kind: "supplier", status: "pending", version: 4 },
  applicant: null,
  history: [],
};

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.replace.mockReset();
  api.listSupplierVerificationQueue.mockResolvedValue({
    suppliers: [
      shop(),
      shop({ supplierId: "usr_shop_b", approvalCaseId: "case_b", shopName: "Shop B", verification: summary({ daysLeft: 0, newOrdersPaused: true, recoveryDueMinor: 86000 }), verificationDocuments: [] }),
    ],
    nextCursor: null,
  });
  api.getSupplierVerificationDetail.mockResolvedValue({ supplier: shop({ ledger }) });
  api.getApprovalCase.mockResolvedValue(approval);
  api.decideApprovalCase.mockResolvedValue({ ...approval, approvalCase: { ...approval.approvalCase, status: "approved" } });
  api.getFileDownloadUrl.mockImplementation(async (id: string) => `https://files.example/${id}?sig=1`);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Shop verification desk", () => {
  it("lists waiting shops, paused first, with days left, papers and amount paid", async () => {
    render(<ShopVerificationDesk canDecide={false} base="/ops" />);
    const rows = await screen.findAllByRole("button", { name: /^Open Shop/ });
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual(["Open Shop B", "Open Shop A"]);
    expect(within(rows[0]!).getByText("Paused: money to recover")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Window ended")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("9 days left")).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/2 of 3 papers · ₱1,240.00 paid/)).toBeInTheDocument();
    expect(api.listSupplierVerificationQueue).toHaveBeenCalledWith({ status: "pending", cursor: null });
  });

  it("opens a shop: papers through signed links, money, history; Operations cannot decide", async () => {
    nav.params = new URLSearchParams("shop=usr_shop_a");
    render(<ShopVerificationDesk canDecide={false} base="/ops" />);
    await screen.findByRole("heading", { name: "Shop A" });
    expect(screen.getByText("Paid before verification").nextSibling).toHaveTextContent("₱1,240.00");
    expect(screen.getByText("Cap ₱7,300.00")).toBeInTheDocument();
    expect(screen.getByText("Waiting on verification").nextSibling).toHaveTextContent("₱860.00");
    await waitFor(() => expect(api.getFileDownloadUrl).toHaveBeenCalledWith("f_id"));
    expect(await screen.findByRole("img", { name: "Government ID" })).toHaveAttribute("src", "https://files.example/f_id?sig=1");
    expect(screen.getByText("The shop has not sent it")).toBeInTheDocument();
    expect(screen.getByText("Waiting: over the payout cap until verified")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open the order" })[0]).toHaveAttribute("href", "/ops/orders/ord_2");
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.getByText(/Super Admin approves or rejects this shop/)).toBeInTheDocument();
    expect(api.getApprovalCase).not.toHaveBeenCalled();
  });

  it("lets Super Admin approve through the versioned approval case", async () => {
    nav.params = new URLSearchParams("shop=usr_shop_a");
    const user = userEvent.setup();
    render(<ShopVerificationDesk canDecide base="/admin" />);
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("₱860.00 waiting on verification becomes ready to pay");
    await user.click(within(dialog).getByRole("button", { name: "Verify shop" }));
    await waitFor(() => expect(api.decideApprovalCase).toHaveBeenCalled());
    const [caseId, action, input] = api.decideApprovalCase.mock.calls[0]!;
    expect(caseId).toBe("case_a");
    expect(action).toBe("approve");
    expect(input).toMatchObject({ expectedVersion: 4 });
    expect(typeof input.requestId).toBe("string");
    expect(await screen.findByText(/Shop A is verified/)).toBeInTheDocument();
  });

  it("needs a reason the shop reads before rejecting", async () => {
    nav.params = new URLSearchParams("shop=usr_shop_a");
    const user = userEvent.setup();
    render(<ShopVerificationDesk canDecide base="/admin" />);
    await user.click(await screen.findByRole("button", { name: "Reject" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Write the reason first");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await user.type(screen.getByLabelText("Note or reason"), "The permit photo is unreadable.");
    await user.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("The permit photo is unreadable.");
    await user.click(within(dialog).getByRole("button", { name: "Reject shop" }));
    await waitFor(() =>
      expect(api.decideApprovalCase).toHaveBeenCalledWith(
        "case_a",
        "reject",
        expect.objectContaining({ expectedVersion: 4, reason: "The permit photo is unreadable." }),
      ),
    );
  });

  it("shows who decided on a decided shop", async () => {
    nav.params = new URLSearchParams("status=approved&shop=usr_shop_a");
    api.getSupplierVerificationDetail.mockResolvedValue({
      supplier: shop({ approvalStatus: "approved", verification: summary({ verified: true }), ledger: [] }),
    });
    api.getApprovalCase.mockResolvedValue({
      ...approval,
      approvalCase: { ...approval.approvalCase, status: "approved", decidedBy: "usr_admin", decidedByName: "Admin One", decidedAt: "2026-11-22T03:00:00Z" },
    });
    render(<ShopVerificationDesk canDecide base="/admin" />);
    expect(await screen.findByText(/Verified by Admin One/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(api.listSupplierVerificationQueue).toHaveBeenCalledWith({ status: "approved", cursor: null });
  });

  it("says the server has no queue yet when the route is missing", async () => {
    api.listSupplierVerificationQueue.mockRejectedValue(new ApiError(404, { error: "not_found" }));
    render(<ShopVerificationDesk canDecide={false} base="/ops" />);
    expect(await screen.findByText("Shop verification is not on this server yet")).toBeInTheDocument();
  });
});
