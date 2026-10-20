// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { SupplierPayoutAccount } from "@/lib/api/types";

vi.stubGlobal("React", React);

// Base UI radios dispatch a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);
const liveLoad = vi.hoisted(() => ({
  current: null as null | ((adopt?: boolean) => Promise<void>),
}));
vi.mock("@/lib/live/useLiveReload", () => ({
  useLiveReload: (_resource: unknown, load: (adopt?: boolean) => Promise<void>) => {
    liveLoad.current = load;
  },
}));

const getMyPayoutAccount = vi.hoisted(() => vi.fn());
const updateMyPayoutAccount = vi.hoisted(() => vi.fn());
const uploadPayoutQr = vi.hoisted(() => vi.fn());
const getFileDownloadUrl = vi.hoisted(() =>
  vi.fn(async () => "https://files.test/qr.png"),
);
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  getMyPayoutAccount,
  updateMyPayoutAccount,
  uploadPayoutQr,
  getFileDownloadUrl,
}));

const { SupplierPayoutSettings } =
  await import("@/components/settings/SupplierPayoutSettings");

const ACCOUNT: SupplierPayoutAccount = {
  supplierId: "s1",
  provider: "gcash",
  accountName: "Ben S.",
  accountNumber: "+639171234567",
  institution: null,
  qr: {
    fileId: "file_qr",
    originalFilename: "gcash.png",
    detectedContentType: "image/png",
    size: 10,
    readyAt: null,
  },
  version: 2,
  updatedAt: "2026-09-15T00:00:00Z",
};

beforeEach(() => {
  vi.stubGlobal("React", React);
  getMyPayoutAccount.mockReset();
  updateMyPayoutAccount.mockReset();
  uploadPayoutQr.mockReset();
});
afterEach(cleanup);

describe("where the shop gets paid, from the portal", () => {
  it("creates the account from an empty form against no version", async () => {
    getMyPayoutAccount.mockResolvedValue(null);
    updateMyPayoutAccount.mockResolvedValue({ ...ACCOUNT, qr: null, version: 1 });

    const user = userEvent.setup();
    render(<SupplierPayoutSettings />);
    expect(
      await screen.findByRole("img", { name: /No payout QR on file/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /^GCash/ }));
    fireEvent.change(screen.getByLabelText("Account name"), {
      target: { value: "Ben S." },
    });
    fireEvent.change(screen.getByLabelText("Wallet mobile number"), {
      target: { value: "0917 123 4567" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save where you get paid" }));

    await waitFor(() =>
      expect(updateMyPayoutAccount).toHaveBeenCalledWith(null, {
        provider: "gcash",
        accountName: "Ben S.",
        accountNumber: "0917 123 4567",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/Saved\./);
  });

  it("stores a picked plate at once and binds it only on save, against the version read", async () => {
    getMyPayoutAccount.mockResolvedValue(ACCOUNT);
    uploadPayoutQr.mockResolvedValue({ fileId: "file_new" });
    updateMyPayoutAccount.mockResolvedValue({
      ...ACCOUNT,
      qr: { ...ACCOUNT.qr!, fileId: "file_new" },
      version: 3,
    });

    render(<SupplierPayoutSettings />);
    expect(await screen.findByLabelText("Account name")).toHaveValue("Ben S.");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

    const file = new File(["png"], "qr.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Replace the QR"), {
      target: { files: [file] },
    });
    await waitFor(() => expect(uploadPayoutQr).toHaveBeenCalledWith(file));
    expect(
      await screen.findByText(/Save below to make it the one Operations scans/),
    ).toBeInTheDocument();
    expect(updateMyPayoutAccount).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(updateMyPayoutAccount).toHaveBeenCalledWith(2, { qrFileId: "file_new" }),
    );
  });

  it("catches a wallet number that is not a mobile number before spending a round trip", async () => {
    getMyPayoutAccount.mockResolvedValue(ACCOUNT);

    render(<SupplierPayoutSettings />);
    fireEvent.change(await screen.findByLabelText("Wallet mobile number"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText(/Enter the mobile number this wallet/),
    ).toBeInTheDocument();
    expect(updateMyPayoutAccount).not.toHaveBeenCalled();
  });

  it("asks for the bank's name once a bank is chosen", async () => {
    getMyPayoutAccount.mockResolvedValue(ACCOUNT);

    const user = userEvent.setup();
    render(<SupplierPayoutSettings />);
    await screen.findByLabelText("Account name");
    expect(screen.queryByLabelText("Bank")).toBeNull();
    await user.click(screen.getByRole("radio", { name: /^Bank transfer/ }));
    expect(screen.getByLabelText("Bank")).toBeInTheDocument();
    expect(screen.getByLabelText("Account number")).toBeInTheDocument();
  });

  it("keeps a dirty draft when a newer version arrives, until the shop loads it", async () => {
    getMyPayoutAccount.mockResolvedValue(ACCOUNT);
    updateMyPayoutAccount.mockRejectedValue(
      new ApiError(409, { error: "payout_account_stale" }),
    );

    render(<SupplierPayoutSettings />);
    const name = await screen.findByLabelText("Account name");
    fireEvent.change(name, { target: { value: "Ben edited" } });

    getMyPayoutAccount.mockResolvedValue({
      ...ACCOUNT,
      version: 4,
      accountName: "From the phone",
    });
    await act(async () => {
      await liveLoad.current?.();
    });

    expect(screen.getByLabelText("Account name")).toHaveValue("Ben edited");
    expect(screen.getByRole("alert")).toHaveTextContent(/changed somewhere else/);
    expect(getMyPayoutAccount).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(updateMyPayoutAccount).toHaveBeenCalledWith(2, { accountName: "Ben edited" }),
    );
    expect(screen.getByLabelText("Account name")).toHaveValue("Ben edited");
    expect(getMyPayoutAccount).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Load the latest" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Account name")).toHaveValue("From the phone"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(getMyPayoutAccount).toHaveBeenCalledTimes(3);
  });

  it("says plainly when GRIDGO has not opened this yet", async () => {
    getMyPayoutAccount.mockRejectedValue(
      Object.assign(new Error("not_found"), {
        status: 404,
        code: "not_found",
        kind: "not_found",
      }),
    );
    render(<SupplierPayoutSettings />);
    expect(
      await screen.findByText(/Could not load where you get paid/),
    ).toBeInTheDocument();
  });
});
