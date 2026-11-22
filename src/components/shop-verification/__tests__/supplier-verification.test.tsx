// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ShopRole } from "@/lib/api/types";

const access = vi.hoisted(() => ({ role: "owner" as string }));
const api = vi.hoisted(() => ({
  getMySupplierVerification: vi.fn(),
  uploadVerificationDocument: vi.fn(),
  attachVerificationDocument: vi.fn(),
  getSupplierReadiness: vi.fn(),
  listJobs: vi.fn(),
  listIssues: vi.fn(),
}));

vi.stubGlobal("React", React);
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  ...api,
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => undefined }));
vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => ({ user: { name: "Owner", verificationStatus: "pending" } }) }));
vi.mock("@/lib/auth/shop-access", async () => {
  const { shopCapabilities } = await import("@/lib/shop-team");
  return {
    useShopAccess: () => ({
      shop: { id: "shop_1", name: "Test Print Shop", role: access.role, status: "active" },
      staff: access.role !== "owner",
      manager: access.role === "manager",
      role: access.role,
      worker: null,
      can: shopCapabilities(access.role as ShopRole),
    }),
  };
});

import SupplierDocumentsPage from "@/app/supplier/documents/page";
import SupplierPayoutsPage from "@/app/supplier/payouts/page";
import SupplierTodayPage from "@/app/supplier/dashboard/page";
import { ApiError } from "@/lib/api/client";

function setWidth(desktop: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: desktop && query === "(min-width: 1280px)",
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function read(over: Record<string, unknown> = {}, documents: unknown[] = [], ledger: unknown[] = []) {
  return {
    verification: {
      verified: false,
      verificationState: documents.length ? "being_checked" : "not_submitted",
      startedAt: "2026-11-01T00:00:00Z",
      deadlineAt: "2026-12-01T00:00:00Z",
      daysLeft: 22,
      countdownDays: null,
      payoutCapMinor: 730000,
      paidBeforeVerificationMinor: 124000,
      remainingCapMinor: 606000,
      capReached: false,
      heldMinor: 0,
      recoveryDueMinor: 0,
      paidOpenRegularJobs: 1,
      newOrdersPaused: false,
      ...over,
    },
    verificationDocuments: documents,
    ledger,
  };
}

const selfie = { fileId: "f_selfie", readyAt: "2026-11-20T06:14:00Z", references: [{ documentType: "id_selfie" }] };

beforeEach(() => {
  access.role = "owner";
  setWidth(false);
  api.getMySupplierVerification.mockResolvedValue(read());
  api.uploadVerificationDocument.mockResolvedValue({ fileId: "f_selfie" });
  api.attachVerificationDocument.mockResolvedValue({ fileId: "f_selfie" });
  api.getSupplierReadiness.mockResolvedValue({});
  api.listJobs.mockResolvedValue([]);
  api.listIssues.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.stubGlobal("React", React);
});

describe("Get verified (shop papers)", () => {
  it("shows the benefits, the three papers and the cap from the server", async () => {
    render(<SupplierDocumentsPage />);
    expect(await screen.findByRole("heading", { name: "Verified shops get more jobs" })).toBeInTheDocument();
    expect(screen.getByText("Until then, payouts stop at ₱7,300.00")).toBeInTheDocument();
    for (const paper of ["valid_id", "id_selfie", "business_permit"]) {
      expect(within(screen.getByTestId(`paper-${paper}`)).getByRole("button", { name: /^Upload/ })).toBeInTheDocument();
    }
    expect(screen.getByText("₱1,240.00 of ₱7,300.00 paid out so far.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Not now, back to To do" })).toHaveAttribute("href", "/supplier/dashboard");
    expect(screen.getByTestId("get-verified")).toHaveAttribute("data-layout", "phone");
  });

  it("uploads a paper, attaches it by type, then reads Checking", async () => {
    const user = userEvent.setup();
    render(<SupplierDocumentsPage />);
    await screen.findByTestId("paper-id_selfie");
    api.getMySupplierVerification.mockResolvedValue(read({}, [selfie]));
    const photo = new File(["x"], "selfie.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("Selfie with your ID file"), photo);
    await waitFor(() => expect(api.attachVerificationDocument).toHaveBeenCalledWith("f_selfie", "id_selfie"));
    expect(api.uploadVerificationDocument).toHaveBeenCalledWith(photo);
    const row = screen.getByTestId("paper-id_selfie");
    expect(await within(row).findByText("Checking")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: /Send a new/ })).toBeInTheDocument();
  });

  it("says why an upload failed and keeps the paper unsent", async () => {
    api.uploadVerificationDocument.mockRejectedValue(new ApiError(413, { error: "file_too_large", maxMiB: 15 }));
    const user = userEvent.setup();
    render(<SupplierDocumentsPage />);
    await screen.findByTestId("paper-valid_id");
    await user.upload(screen.getByLabelText("Your ID file"), new File(["x"], "id.jpg", { type: "image/jpeg" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("larger than 15 MB");
    expect(api.attachVerificationDocument).not.toHaveBeenCalled();
  });

  it("uses the side panel layout at 1280px and wider", async () => {
    setWidth(true);
    render(<SupplierDocumentsPage />);
    expect(await screen.findByTestId("get-verified")).toHaveAttribute("data-layout", "desktop");
  });

  it("tells a verified shop it is verified", async () => {
    api.getMySupplierVerification.mockResolvedValue(read({ verified: true, verificationState: "verified" }));
    render(<SupplierDocumentsPage />);
    expect(await screen.findByRole("heading", { name: "Your shop is verified" })).toBeInTheDocument();
  });

  it("keeps the older papers screen when the server has no verification route", async () => {
    api.getMySupplierVerification.mockRejectedValue(new ApiError(404, { error: "not_found" }));
    render(<SupplierDocumentsPage />);
    expect(await screen.findByRole("heading", { name: "Accreditation" })).toBeInTheDocument();
  });

  it("never asks for verification as Staff or a Manager", async () => {
    for (const role of ["staff", "manager"]) {
      access.role = role;
      render(<SupplierDocumentsPage />);
      expect(await screen.findByRole("heading", { name: "Accreditation" })).toBeInTheDocument();
      cleanup();
    }
    expect(api.getMySupplierVerification).not.toHaveBeenCalled();
  });
});

describe("Money while unverified", () => {
  it("shows the cap banner and what is waiting, never lost", async () => {
    api.getMySupplierVerification.mockResolvedValue(
      read({ capReached: true, paidBeforeVerificationMinor: 730000, heldMinor: 86000 }, [], [
        { id: "1", kind: "held", payoutKey: "stage:ord_2:delivered", orderId: "ord_2", amountMinor: 86000, data: { reason: "verification_payout_cap" } },
      ]),
    );
    render(<SupplierPayoutsPage />);
    const banner = await screen.findByTestId("money-verify");
    expect(banner).toHaveTextContent("Payouts over ₱7,300.00 are waiting");
    expect(banner).toHaveTextContent("₱7,300.00 of ₱7,300.00 paid out so far.");
    expect(within(banner).getByText("Get verified").closest("a")).toHaveAttribute("href", "/supplier/documents");
    const waiting = screen.getByTestId("waiting-payouts");
    expect(waiting).toHaveTextContent("Waiting for your verification. Paid once you're verified.");
    expect(within(waiting).getByRole("link")).toHaveAttribute("href", "/supplier/jobs/ord_2");
  });

  it("shows nothing new for a verified shop", async () => {
    api.getMySupplierVerification.mockResolvedValue(read({ verified: true, verificationState: "verified" }));
    render(<SupplierPayoutsPage />);
    await waitFor(() => expect(api.getMySupplierVerification).toHaveBeenCalled());
    await screen.findByText(/You are paid in parts/);
    expect(screen.queryByTestId("money-verify")).toBeNull();
  });
});

describe("Today's To do card", () => {
  it("pitches verification with no countdown before the last week", async () => {
    render(<SupplierTodayPage />);
    const card = await screen.findByTestId("todo-verify");
    expect(card).toHaveTextContent("Get verified, get more jobs");
    expect(card).not.toHaveTextContent("days left");
  });

  it("counts down in the last week, beside the day's work on a desktop", async () => {
    setWidth(true);
    api.getMySupplierVerification.mockResolvedValue(read({ daysLeft: 5, countdownDays: 5 }));
    render(<SupplierTodayPage />);
    const card = await screen.findByTestId("todo-verify");
    expect(card).toHaveTextContent("Get verified to keep getting orders");
    expect(card).toHaveTextContent("5 days left");
  });

  it("tells a shop paused after a dropped job how much comes out of its next payouts", async () => {
    api.getMySupplierVerification.mockResolvedValue(read({ newOrdersPaused: true, recoveryDueMinor: 86000 }));
    render(<SupplierTodayPage />);
    const card = await screen.findByTestId("todo-verify");
    expect(card).toHaveTextContent("New orders are paused");
    expect(card).toHaveTextContent("₱860.00 will come out of your next payouts");
    expect(within(card).getByText("New orders paused")).toBeInTheDocument();
  });

  it("shows Staff no card and asks nothing", async () => {
    access.role = "staff";
    render(<SupplierTodayPage />);
    await screen.findByText(/Nothing waiting on you/);
    expect(screen.queryByTestId("todo-verify")).toBeNull();
    expect(api.getMySupplierVerification).not.toHaveBeenCalled();
  });
});
