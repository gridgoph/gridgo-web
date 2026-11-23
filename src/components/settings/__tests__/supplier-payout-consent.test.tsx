// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SupplierPayoutAccount } from "@/lib/api/types";

vi.stubGlobal("React", React);
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => undefined }));

const getMyPayoutAccount = vi.hoisted(() => vi.fn());
const updateMyPayoutAccount = vi.hoisted(() => vi.fn());
const uploadPayoutQr = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  getMyPayoutAccount,
  updateMyPayoutAccount,
  uploadPayoutQr,
  getFileDownloadUrl: vi.fn(async () => "https://files.test/qr.png"),
}));

const WORDING = "I agree that GRIDGO pays this shop's earnings to the QR above. (test wording)";
const loadGuidedSignup = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/supplier-signup", () => ({ loadGuidedSignup }));

const { SupplierPayoutSettings } = await import("@/components/settings/SupplierPayoutSettings");

const WALLET = "other" satisfies SupplierPayoutAccount["provider"];
const firstWallet = () => screen.getByRole("radio", { name: /^Another wallet/ });

const ACCOUNT = {
  supplierId: "s1",
  provider: WALLET,
  accountName: "Test Holder",
  accountNumber: "+639171234567",
  institution: null,
  qr: { fileId: "file_qr", originalFilename: "qr.png", detectedContentType: "image/png", size: 10, readyAt: null },
  holder: "mine",
  consent: { accepted: true, wording: WORDING },
  payoutStatus: { held: false, pausedUntil: null },
  version: 2,
  updatedAt: "2026-11-01T00:00:00Z",
} as unknown as SupplierPayoutAccount;

beforeEach(() => {
  vi.stubGlobal("React", React);
  getMyPayoutAccount.mockReset();
  updateMyPayoutAccount.mockReset();
  uploadPayoutQr.mockReset();
  loadGuidedSignup.mockReset();
  loadGuidedSignup.mockResolvedValue({
    status: "ok",
    signup: { version: 1, supplierId: "s1", steps: {}, nextStep: "payout" },
    terms: { printGroups: ["documents"], locationConsentWording: "", payoutConsentWording: WORDING, documentRates: { bwMinor: 1, colourMinor: 1 } },
  });
});
afterEach(cleanup);

describe("where you get paid, with GRIDGO's payout consent", () => {
  it("asks whose QR it is and needs GRIDGO's exact consent before the first save", async () => {
    getMyPayoutAccount.mockResolvedValue(null);
    updateMyPayoutAccount.mockResolvedValue({ ...ACCOUNT, holder: "family" });
    const user = userEvent.setup();
    render(<SupplierPayoutSettings setup />);

    expect(await screen.findByText(WORDING)).toBeInTheDocument();
    expect(screen.getByLabelText("Name on the QR")).toBeInTheDocument();
    await user.click(firstWallet());
    fireEvent.change(screen.getByLabelText("Name on the QR"), { target: { value: "Test Relative" } });
    fireEvent.change(screen.getByLabelText("Account number"), { target: { value: "0917 123 4567" } });
    await user.click(screen.getByRole("radio", { name: /^Family/ }));

    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText(/Tick the box to let GRIDGO pay to this QR/)).toBeInTheDocument();
    expect(updateMyPayoutAccount).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: WORDING }));
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() =>
      expect(updateMyPayoutAccount).toHaveBeenCalledWith(null, {
        provider: WALLET,
        accountName: "Test Relative",
        accountNumber: "0917 123 4567",
        holder: "family",
        consent: { accepted: true, wording: WORDING },
      }),
    );
  });

  it("says only the owner can change it, and warns of the 24-hour pause before a change", async () => {
    getMyPayoutAccount.mockResolvedValue(ACCOUNT);
    updateMyPayoutAccount.mockResolvedValue({ ...ACCOUNT, holder: "staff" });
    const user = userEvent.setup();
    render(<SupplierPayoutSettings />);

    expect(await screen.findByTestId("owner-only-note")).toHaveTextContent(
      "Only the owner can change this. A change pauses payouts for 24 hours.",
    );
    await user.click(screen.getByRole("radio", { name: /^Staff/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Change where GRIDGO pays you?")).toBeInTheDocument();
    expect(updateMyPayoutAccount).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep the old one" }));
    await waitFor(() => expect(screen.queryByText("Change where GRIDGO pays you?")).not.toBeInTheDocument());
    expect(updateMyPayoutAccount).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Change it" }));
    await waitFor(() =>
      expect(updateMyPayoutAccount).toHaveBeenCalledWith(2, {
        holder: "staff",
        consent: { accepted: true, wording: WORDING },
      }),
    );
  });

  it("shows when payouts are paused after a change", async () => {
    getMyPayoutAccount.mockResolvedValue({
      ...ACCOUNT,
      payoutStatus: { held: true, reason: "destination_changed", pausedUntil: "2026-11-25T10:30:00Z" },
    });
    render(<SupplierPayoutSettings />);
    expect(await screen.findByTestId("payout-paused")).toHaveTextContent(/Payouts paused until .*Nothing is lost/);
  });

  it("keeps the older screen on a GRIDGO without the consent", async () => {
    loadGuidedSignup.mockResolvedValue({ status: "not_open_yet" });
    getMyPayoutAccount.mockResolvedValue({ ...ACCOUNT, holder: undefined, consent: undefined, payoutStatus: undefined });
    render(<SupplierPayoutSettings />);
    expect(await screen.findByLabelText("Account name")).toBeInTheDocument();
    expect(screen.queryByText("Whose QR is this?")).not.toBeInTheDocument();
    expect(screen.queryByTestId("payout-consent")).not.toBeInTheDocument();
  });
});
