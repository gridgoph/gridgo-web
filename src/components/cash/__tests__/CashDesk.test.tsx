// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CashTopupRow } from "@/lib/api/cash";
import type { Order } from "@/lib/api/types";

vi.setConfig({ testTimeout: 30_000 });
vi.stubGlobal("React", React);
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);
URL.createObjectURL = () => "blob:preview";
URL.revokeObjectURL = () => undefined;

const cash = vi.hoisted(() => ({
  listCashTopups: vi.fn(),
  listCashIncidents: vi.fn(),
  getCashReconciliation: vi.fn(),
  confirmCashTopup: vi.fn(),
  rejectCashTopup: vi.fn(),
  cashOrderAction: vi.fn(),
  uploadCashEvidence: vi.fn(),
  listCashEvidence: vi.fn(),
}));
const client = vi.hoisted(() => ({
  listOrders: vi.fn(),
  listIssues: vi.fn(),
  listUsers: vi.fn(),
  getFileDownloadUrl: vi.fn(),
  getSupplierPayoutAccount: vi.fn(),
}));
const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
  path: "/ops/cash",
}));
const toasts = vi.hoisted(() => ({ add: vi.fn() }));

vi.mock("@/lib/api/cash", () => cash);
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  ...client,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => nav.params,
  usePathname: () => nav.path,
}));
vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "staff-1" } }),
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => undefined }));
vi.mock("@/components/ui/toast", () => ({ toast: toasts }));

import { CashDesk } from "@/components/cash/CashDesk";

const waiting: CashTopupRow = {
  id: "cash_topup_1",
  kind: "topup_pending",
  rider_id: "rider-1",
  created_at: "2026-11-18T02:00:00.000Z",
  evidence: { reference: "GG1234", amountMinor: 50_000, screenshotFileId: "file-shot" },
  decision: null,
};
const decided: CashTopupRow = {
  ...waiting,
  id: "cash_topup_0",
  created_at: "2026-11-17T02:00:00.000Z",
  evidence: { reference: "OLD999", amountMinor: 20_000 },
  decision: "topup_confirmed",
};

const noShowOrder = {
  id: "order-ns",
  clientId: "client-1",
  clientName: "Client One",
  supplierId: "shop-1",
  riderId: "rider-1",
  state: "out_for_delivery",
  title: "Tarpaulin",
  totalMinor: 120_000,
  supplierContact: { shopName: "Shop A", contactName: null },
  cash: { method: "cash", version: 7, status: "due", noShowWaitSeconds: 600 },
  cashAmounts: {
    shopMinor: 80_000,
    collectMinor: 120_000,
    gridgoMinor: 24_000,
    riderMinor: 16_000,
  },
  cashProgress: {
    shopPaidAt: "2026-11-18T01:00:00.000Z",
    noShowStartedAt: "2026-11-18T03:00:00.000Z",
    noShowReportedAt: "2026-11-18T03:11:00.000Z",
    contactMethod: "call",
    noShowReason: "NO ANSWER",
    noShowPhotoFileId: "file-ns",
  },
} as unknown as Order;

// The rider's photo of the shop's cash return, as the staff picker lists it.
const returnPhoto = {
  fileId: "file-receipt",
  purpose: "cash_shop_return",
  ownerRole: "rider",
  uploadedAt: "2026-11-18T04:00:00.000Z",
  used: false,
  previewUrl: "https://storage.example.invalid/signed/file-receipt",
  expiresAt: "2099-01-01T00:00:00.000Z",
};

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.path = "/ops/cash";
  nav.replace.mockReset().mockImplementation((href: string) => {
    nav.params = new URLSearchParams(href.split("?")[1] ?? "");
  });
  for (const fn of [...Object.values(cash), ...Object.values(client)]) fn.mockReset();
  toasts.add.mockReset();
  cash.listCashEvidence.mockResolvedValue([returnPhoto]);
  cash.listCashTopups.mockResolvedValue([decided, waiting]);
  cash.listCashIncidents.mockResolvedValue([]);
  client.listOrders.mockResolvedValue([
    noShowOrder,
    { id: "online", state: "delivered" },
  ]);
  client.listIssues.mockResolvedValue([]);
  client.listUsers.mockResolvedValue([{ id: "rider-1", name: "Rider One" }]);
});
afterEach(cleanup);

describe("CashDesk top-ups", () => {
  it("lists waiting top-ups first with counts on the tabs", async () => {
    render(<CashDesk />);
    await screen.findAllByText("GG1234");
    expect(screen.getByRole("tab", { name: "Top-ups, 1 waiting" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Incidents, 1 waiting" })).toBeInTheDocument();
    const rows = screen.getAllByRole("row").map((row) => row.textContent ?? "");
    expect(rows.findIndex((t) => t.includes("GG1234"))).toBeLessThan(
      rows.findIndex((t) => t.includes("OLD999")),
    );
    // A decided top-up has nothing to decide.
    expect(screen.getAllByRole("button", { name: "Confirm" })).toHaveLength(2); // row + mobile card
  });

  it("confirms only after the bank check, naming the rider and amount", async () => {
    cash.confirmCashTopup.mockResolvedValue({
      topup: { id: waiting.id, status: "confirmed" },
    });
    render(<CashDesk />);
    await screen.findAllByText("GG1234");
    fireEvent.click(screen.getAllByRole("button", { name: "Confirm" })[0]);
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText("Confirm ₱500.00 for Rider One?"),
    ).toBeInTheDocument();
    expect(within(dialog).getByTestId("money-plate")).toHaveTextContent("₱500.00");
    expect(within(dialog).getByTestId("money-plate")).toHaveTextContent("GG1234");
    const submit = within(dialog).getByRole("button", { name: "Confirm ₱500.00" });
    fireEvent.change(within(dialog).getByLabelText("Bank check note"), {
      target: { value: "Matched in bank" },
    });
    expect(submit).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("checkbox"));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(cash.confirmCashTopup).toHaveBeenCalledTimes(1));
    const [id, body, key] = cash.confirmCashTopup.mock.calls[0];
    expect(id).toBe(waiting.id);
    expect(body).toEqual({ reason: "Matched in bank" });
    expect(typeof key).toBe("string");
    await waitFor(() =>
      expect(toasts.add).toHaveBeenCalledWith(
        expect.objectContaining({ title: "₱500.00 added to Rider One's wallet" }),
      ),
    );
    // The desk reads everything again after a decision.
    expect(cash.listCashTopups).toHaveBeenCalledTimes(2);
  });

  it("explains a reference already confirmed and keeps the dialog open", async () => {
    const { ApiError } = await import("@/lib/api/client");
    cash.rejectCashTopup.mockRejectedValue(
      new ApiError(409, { error: "cash_topup_already_decided" }),
    );
    render(<CashDesk />);
    await screen.findAllByText("GG1234");
    fireEvent.click(screen.getAllByRole("button", { name: "Reject" })[0]);
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "No transfer" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject top-up" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/already decided/);
  });
});

describe("CashDesk incidents", () => {
  it("approves a no-show with Operations' own return photo and the cash version", async () => {
    nav.params = new URLSearchParams("tab=incidents");
    cash.uploadCashEvidence.mockResolvedValue({ fileId: "file-return" });
    cash.cashOrderAction.mockResolvedValue({
      cash: { version: 8, status: "online_repayment_required" },
    });
    render(<CashDesk />);
    await screen.findByText("Rider One reported a no-show");
    fireEvent.click(screen.getByRole("button", { name: "Approve no-show" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByTestId("money-plate")).toHaveTextContent("₱800.00");
    const photo = new File(["x"], "return.jpg", { type: "image/jpeg" });
    fireEvent.change(
      within(dialog).getByLabelText("Photo of the parcel back at GRIDGO"),
      {
        target: { files: [photo] },
      },
    );
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "Waited 10 min" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reimburse ₱800.00" }));
    await waitFor(() => expect(cash.cashOrderAction).toHaveBeenCalledTimes(1));
    expect(cash.uploadCashEvidence).toHaveBeenCalledWith(photo, "cash_return_photo");
    const [orderId, action, body] = cash.cashOrderAction.mock.calls[0];
    expect(orderId).toBe("order-ns");
    expect(action).toBe("approve-no-show");
    expect(body).toEqual({
      expectedVersion: 7,
      reason: "Waited 10 min",
      returnPhotoFileId: "file-return",
    });
  });

  it("offers a claim, not a cancellation, once the rider has paid the shop", async () => {
    nav.params = new URLSearchParams("tab=incidents");
    client.listOrders.mockResolvedValue([
      {
        ...noShowOrder,
        id: "order-paid",
        state: "picked_up",
        cashProgress: { shopPaidAt: "t" },
      },
    ]);
    cash.uploadCashEvidence.mockResolvedValue({ fileId: "file-incident" });
    cash.cashOrderAction.mockResolvedValue({
      cash: { version: 8, status: "work_stopped" },
    });
    render(<CashDesk />);
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Shop cannot produce" }))[0],
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText("Open a claim on Shop A's cash?"),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("What happened"), {
      target: { value: "Press broke" },
    });
    fireEvent.change(within(dialog).getByLabelText("Photo of the problem"), {
      target: { files: [new File(["x"], "p.png", { type: "image/png" })] },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Open claim" }));
    await waitFor(() => expect(cash.cashOrderAction).toHaveBeenCalledTimes(1));
    expect(cash.cashOrderAction.mock.calls[0][1]).toBe("incident-open");
    expect(cash.cashOrderAction.mock.calls[0][2]).toEqual({
      expectedVersion: 7,
      reason: "Press broke",
      photoFileId: "file-incident",
    });
  });
});

describe("CashDesk wallets and ledger", () => {
  // Two accepted cash orders each hold ₱22.30 and a ₱500 top-up waits. The
  // fake answers filters the way the API does: an order filter narrows the
  // journals but not the accounts, and a rider filter drops the accounts that
  // carry no rider (the pending top-up, GRIDGO's bank).
  const journals = [
    { id: "j1", kind: "wallet_reserved", rider_id: "rider-1", order_id: "o1" },
    { id: "j2", kind: "wallet_reserved", rider_id: "rider-1", order_id: "o2" },
    { id: "j3", kind: "topup_pending", rider_id: "rider-1", order_id: null },
  ].map((j) => ({
    ...j,
    created_at: "2026-11-18T02:00:00.000Z",
    evidence: { amountMinor: j.kind === "topup_pending" ? 50_000 : 2_230 },
    difference: "0",
  }));
  const accounts = [
    { id: "wallet:rider-1", balanceMinor: 177_320, derivedMinor: 177_320, rider: true },
    { id: "held:o1", balanceMinor: 2_230, derivedMinor: 2_230, rider: true },
    { id: "held:o2", balanceMinor: 2_230, derivedMinor: 2_230, rider: true },
    { id: "pending_topup:rider-1", balanceMinor: -50_000, derivedMinor: -50_000, rider: false },
    { id: "gridgo_bank", balanceMinor: 120_000, derivedMinor: 120_000, rider: false },
  ];
  const fakeReconciliation = ({
    orderId,
    riderId,
  }: { orderId?: string | null; riderId?: string | null } = {}) => ({
    ok: true,
    orderChecks: [],
    journalChecks: [],
    invalidReservations: [],
    journals: journals.filter(
      (j) => (!orderId || j.order_id === orderId) && (!riderId || j.rider_id === riderId),
    ),
    accounts: accounts
      .filter((a) => !riderId || a.rider)
      .map(({ id, balanceMinor, derivedMinor }) => ({ id, balanceMinor, derivedMinor })),
  });

  it.each(["", "order=o1", "rider=rider-1"])(
    "keeps the wallet's own figures whatever the movement filter (%s)",
    async (filter) => {
      nav.params = new URLSearchParams(`tab=ledger&${filter}`);
      cash.getCashReconciliation.mockImplementation(async (q) => fakeReconciliation(q));
      render(<CashDesk />);
      const table = await screen.findByRole("table", { name: "Rider wallets" });
      const row = await within(table).findByRole("row", { name: /Rider One/ });
      await waitFor(() => expect(row).toHaveTextContent("₱1,773.20"));
      expect(row).toHaveTextContent("₱44.60");
      expect(row).toHaveTextContent("₱1,817.80");
      expect(row).toHaveTextContent("₱500.00");
      expect(row).not.toHaveTextContent("None");
      // GRIDGO's bank is never narrowed away either.
      expect(screen.getByText("₱1,200.00")).toBeInTheDocument();
      if (filter) {
        // The narrowed read still drives the movements.
        expect(cash.getCashReconciliation).toHaveBeenCalledWith(
          expect.objectContaining(
            filter.startsWith("order") ? { orderId: "o1" } : { riderId: "rider-1" },
          ),
        );
        expect(
          await screen.findByText("These movements reconcile"),
        ).toBeInTheDocument();
      }
    },
  );

  it("says so when held money names no rider instead of dropping it", async () => {
    nav.params = new URLSearchParams("tab=ledger");
    cash.getCashReconciliation.mockImplementation(async () => {
      const recon = fakeReconciliation();
      return { ...recon, journals: recon.journals.filter((j) => j.id !== "j2") };
    });
    render(<CashDesk />);
    expect(
      await screen.findByText(/₱22\.30 is held for orders whose reservation names no rider/),
    ).toBeInTheDocument();
  });
});

describe("CashDesk stale and repeated submissions", () => {
  const claimOrder = (version: number) =>
    ({
      ...noShowOrder,
      id: "order-claim",
      state: "picked_up",
      cash: { method: "cash", version, status: "work_stopped" },
      cashProgress: {
        shopPaidAt: "t",
        incident: {
          id: "inc-1",
          amountMinor: 1_000,
          resolvedMinor: 0,
          remainingMinor: 1_000,
          status: "outstanding",
        },
      },
    }) as unknown as Order;
  const incident = (resolvedMinor: number, status = "outstanding") => ({
    id: "inc-1",
    orderId: "order-claim",
    shopId: "shop-1",
    riderId: "rider-1",
    amountMinor: 1_000,
    resolvedMinor,
    remainingMinor: 1_000 - resolvedMinor,
    status,
    incidentVersion: 1,
    createdAt: "2026-11-18T01:00:00.000Z",
    reason: "Press broke",
    evidenceFileId: "file-inc",
  });

  async function openClaimReturn() {
    render(<CashDesk />);
    fireEvent.click(await screen.findByRole("button", { name: "Record cash return" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(
      await within(dialog).findByRole("radio", { name: /Rider One's photo uploaded/ }),
    );
    fireEvent.click(within(dialog).getByRole("checkbox"));
    return dialog;
  }

  it("never resends the old version after another return lands; the operator reviews the new amount", async () => {
    nav.params = new URLSearchParams("tab=incidents");
    client.listOrders.mockResolvedValue([claimOrder(3)]);
    cash.listCashIncidents.mockResolvedValue([incident(0)]);
    const { ApiError } = await import("@/lib/api/client");
    // Meanwhile another operator records ₱2: the server is at version 4, ₱8 owed.
    cash.cashOrderAction.mockImplementationOnce(async () => {
      client.listOrders.mockResolvedValue([claimOrder(4)]);
      cash.listCashIncidents.mockResolvedValue([incident(200)]);
      throw new ApiError(409, { error: "cash_stale" });
    });
    const dialog = await openClaimReturn();
    fireEvent.click(within(dialog).getByRole("button", { name: "Record ₱10.00" }));

    // The dialog now shows the latest figures and holds the submit for review.
    const notice = await within(dialog).findByText(/Someone else changed this cash order/);
    expect(notice).toBeInTheDocument();
    expect(within(dialog).getByTestId("money-plate")).toHaveTextContent("₱8.00");
    expect(within(dialog).getByRole("button", { name: "Record ₱10.00" })).toBeDisabled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "I’ve checked the new figures" }),
    );
    // ₱10 is more than is still owed, so the old amount cannot go either.
    expect(within(dialog).getByRole("button", { name: "Record ₱10.00" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Amount returned (₱)"), {
      target: { value: "8" },
    });
    cash.cashOrderAction.mockResolvedValue({ cash: { version: 5, status: "cancelled" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record ₱8.00" }));
    await waitFor(() => expect(cash.cashOrderAction).toHaveBeenCalledTimes(2));
    const [first, second] = cash.cashOrderAction.mock.calls;
    expect(first[2]).toMatchObject({ expectedVersion: 3, amountMinor: 1_000 });
    expect(second[2]).toMatchObject({ expectedVersion: 4, amountMinor: 800 });
    // A different request gets a different idempotency key.
    expect(second[3]).not.toBe(first[3]);
  });

  it("closes a dialog whose claim someone else settled, and says so", async () => {
    nav.params = new URLSearchParams("tab=incidents");
    client.listOrders.mockResolvedValue([claimOrder(3)]);
    cash.listCashIncidents.mockResolvedValue([incident(0)]);
    const { ApiError } = await import("@/lib/api/client");
    cash.cashOrderAction.mockImplementationOnce(async () => {
      cash.listCashIncidents.mockResolvedValue([incident(1_000, "resolved")]);
      throw new ApiError(409, { error: "cash_stale" });
    });
    const dialog = await openClaimReturn();
    fireEvent.click(within(dialog).getByRole("button", { name: "Record ₱10.00" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(toasts.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: "This changed while it was open" }),
    );
    expect(cash.cashOrderAction).toHaveBeenCalledTimes(1);
  });

  it("sends one request for two clicks in the same turn", async () => {
    let finish: (value: unknown) => void = () => undefined;
    cash.confirmCashTopup.mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );
    render(<CashDesk />);
    await screen.findAllByText("GG1234");
    fireEvent.click(screen.getAllByRole("button", { name: "Confirm" })[0]);
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.change(within(dialog).getByLabelText("Bank check note"), {
      target: { value: "Matched in bank" },
    });
    fireEvent.click(within(dialog).getByRole("checkbox"));
    const submit = within(dialog).getByRole("button", { name: "Confirm ₱500.00" });
    // Both clicks land before React re-renders the disabled button.
    React.act(() => {
      submit.click();
      submit.click();
    });
    finish({ topup: { id: waiting.id, status: "confirmed" } });
    await waitFor(() => expect(toasts.add).toHaveBeenCalledTimes(1));
    expect(cash.confirmCashTopup).toHaveBeenCalledTimes(1);
  });

  it("sends one cash order action for two clicks in the same turn", async () => {
    nav.params = new URLSearchParams("tab=incidents");
    client.listOrders.mockResolvedValue([claimOrder(3)]);
    cash.listCashIncidents.mockResolvedValue([incident(0)]);
    let finish: (value: unknown) => void = () => undefined;
    cash.cashOrderAction.mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const dialog = await openClaimReturn();
    const submit = within(dialog).getByRole("button", { name: "Record ₱10.00" });
    React.act(() => {
      submit.click();
      submit.click();
    });
    finish({ cash: { version: 4, status: "cancelled" } });
    await waitFor(() => expect(toasts.add).toHaveBeenCalledTimes(1));
    expect(cash.cashOrderAction).toHaveBeenCalledTimes(1);
  });
});

describe("CashDesk rider evidence picker", () => {
  const claimOrder = {
    ...noShowOrder,
    id: "order-claim",
    state: "picked_up",
    cash: { method: "cash", version: 3, status: "work_stopped" },
    cashProgress: {
      shopPaidAt: "t",
      incident: {
        id: "inc-1",
        amountMinor: 1_000,
        resolvedMinor: 0,
        remainingMinor: 1_000,
        status: "outstanding",
      },
    },
  } as unknown as Order;
  const claimIncident = {
    id: "inc-1",
    orderId: "order-claim",
    shopId: "shop-1",
    riderId: "rider-1",
    amountMinor: 1_000,
    resolvedMinor: 0,
    remainingMinor: 1_000,
    status: "outstanding",
    incidentVersion: 1,
    createdAt: "2026-11-18T01:00:00.000Z",
    reason: "Press broke",
    evidenceFileId: "file-inc",
  };
  beforeEach(() => {
    nav.params = new URLSearchParams("tab=incidents");
    client.listOrders.mockResolvedValue([claimOrder]);
    cash.listCashIncidents.mockResolvedValue([claimIncident]);
  });
  const openReturn = async () => {
    render(<CashDesk />);
    fireEvent.click(await screen.findByRole("button", { name: "Record cash return" }));
    return screen.findByRole("alertdialog");
  };

  it("offers only the rider's unused photos of the shop's return, with previews, and sends the one picked", async () => {
    cash.listCashEvidence.mockResolvedValue([
      returnPhoto,
      { ...returnPhoto, fileId: "file-used", used: true },
      { ...returnPhoto, fileId: "file-incident", purpose: "cash_incident_photo" },
      {
        ...returnPhoto,
        fileId: "file-missing",
        previewUrl: null,
        expiresAt: null,
        unavailable: true,
        error: "storage_object_missing",
      },
    ]);
    cash.cashOrderAction.mockResolvedValue({ cash: { version: 4, status: "cancelled" } });
    const dialog = await openReturn();
    await within(dialog).findAllByTestId("evidence-option");
    expect(cash.listCashEvidence).toHaveBeenCalledWith("order-claim");
    const options = within(dialog).getAllByTestId("evidence-option");
    expect(options).toHaveLength(2);
    expect(within(options[0]).getByRole("img")).toHaveAttribute(
      "src",
      returnPhoto.previewUrl,
    );
    // A picture missing from storage is listed, explained and cannot be picked.
    expect(within(options[1]).getByRole("radio")).toHaveAttribute("aria-disabled", "true");
    expect(within(options[1]).getByText(/missing from storage/)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/file ID/)).not.toBeInTheDocument();

    const submit = within(dialog).getByRole("button", { name: "Record ₱10.00" });
    fireEvent.click(within(dialog).getByRole("checkbox"));
    expect(submit).toBeDisabled();
    fireEvent.click(within(options[0]).getByRole("radio"));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(cash.cashOrderAction).toHaveBeenCalledTimes(1));
    expect(cash.cashOrderAction.mock.calls[0][2]).toMatchObject({
      expectedVersion: 3,
      receiptFileId: "file-receipt",
      amountMinor: 1_000,
    });
  });

  it("says when the rider has not uploaded yet and finds the photo on Check again", async () => {
    cash.listCashEvidence.mockResolvedValueOnce([]).mockResolvedValue([returnPhoto]);
    const dialog = await openReturn();
    expect(
      await within(dialog).findByText(/No photo from Rider One yet/),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Check again" }));
    expect(
      await within(dialog).findByRole("radio", { name: /Rider One's photo uploaded/ }),
    ).toBeInTheDocument();
  });

  it("reads the list again before the signed previews expire, and drops a pick that is gone", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const soon = new Date(Date.now() + 40_000).toISOString();
      cash.listCashEvidence
        .mockResolvedValueOnce([{ ...returnPhoto, expiresAt: soon }])
        .mockResolvedValue([]);
      const dialog = await openReturn();
      fireEvent.click(
        await within(dialog).findByRole("radio", { name: /Rider One's photo uploaded/ }),
      );
      fireEvent.click(within(dialog).getByRole("checkbox"));
      expect(within(dialog).getByRole("button", { name: "Record ₱10.00" })).toBeEnabled();
      await React.act(async () => {
        await vi.advanceTimersByTimeAsync(11_000);
      });
      await waitFor(() => expect(cash.listCashEvidence).toHaveBeenCalledTimes(2));
      expect(await within(dialog).findByText(/No photo from Rider One yet/)).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Record ₱10.00" })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels an assigned unpaid order with the rider's incident photo from the picker", async () => {
    client.listOrders.mockResolvedValue([
      { ...noShowOrder, id: "order-unpaid", state: "rider_assigned", cashProgress: {} },
    ]);
    cash.listCashIncidents.mockResolvedValue([]);
    cash.listCashEvidence.mockResolvedValue([
      { ...returnPhoto, fileId: "file-rider-incident", purpose: "cash_incident_photo" },
      returnPhoto,
    ]);
    cash.cashOrderAction.mockResolvedValue({ cash: { version: 8, status: "cancelled" } });
    render(<CashDesk />);
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Shop cannot produce" }))[0],
    );
    const dialog = await screen.findByRole("alertdialog");
    const options = await within(dialog).findAllByTestId("evidence-option");
    expect(options).toHaveLength(1);
    fireEvent.click(within(options[0]).getByRole("radio"));
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel order" }));
    await waitFor(() => expect(cash.cashOrderAction).toHaveBeenCalledTimes(1));
    expect(cash.cashOrderAction.mock.calls[0][1]).toBe("cancel-unpaid");
    expect(cash.cashOrderAction.mock.calls[0][2]).toMatchObject({
      photoFileId: "file-rider-incident",
    });
    expect(cash.uploadCashEvidence).not.toHaveBeenCalled();
  });
});
