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

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.path = "/ops/cash";
  nav.replace.mockReset().mockImplementation((href: string) => {
    nav.params = new URLSearchParams(href.split("?")[1] ?? "");
  });
  for (const fn of [...Object.values(cash), ...Object.values(client)]) fn.mockReset();
  toasts.add.mockReset();
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
