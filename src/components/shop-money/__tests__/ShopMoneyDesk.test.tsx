// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ShopMoneyDesk as Desk, ShopMoneyShop, ShopMoneyTransfer } from "@/lib/api/types";

const api = vi.hoisted(() => ({
  getShopMoneyDesk: vi.fn(),
  getShopMoneyShop: vi.fn(),
  listUsers: vi.fn(),
  requestShopMoneyRun: vi.fn(),
  prepareShopTransfer: vi.fn(),
  confirmShopTransfer: vi.fn(),
  markShopTransferUnknown: vi.fn(),
  cancelShopTransfer: vi.fn(),
  confirmShopPayment: vi.fn(),
  updateShopMoneyPolicy: vi.fn(),
  uploadPayoutReceipt: vi.fn(),
  getFileDownloadUrl: vi.fn(),
}));

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
const auth = vi.hoisted(() => ({ id: "ops_1" }));

vi.stubGlobal("React", React);

// Base UI's checkbox and switch dispatch a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {
  constructor(type: string, init?: PointerEventInit) {
    super(type, init);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);
URL.createObjectURL = vi.fn(() => "blob:receipt");
URL.revokeObjectURL = vi.fn();

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
  usePathname: () => "/ops/shop-money",
}));

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: auth.id } }),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, ...api };
});

import { ShopMoneyDesk } from "@/components/shop-money/ShopMoneyDesk";
import { ApiError } from "@/lib/api/client";

const balances = { owedMinor: 0, owingMinor: 0, netMinor: 0, paidMinor: 0, overdue: false, paused: false, nextPayoutAt: "2026-11-25T08:00:00.000Z" };
const account = {
  supplierId: "shop_a",
  provider: "other",
  accountName: "Shop A Owner",
  accountNumber: "+639170000011",
  institution: "Test wallet",
  qr: { fileId: "qr_a", originalFilename: "qr.png", detectedContentType: "image/png", size: 100, readyAt: "2026-11-20T00:00:00Z" },
  version: 1,
  updatedAt: "2026-11-20T00:00:00Z",
  shopName: "Shop A",
};
const todayManila = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

function desk(over: Partial<Desk> = {}): Desk {
  return {
    shops: [
      { supplierId: "shop_a", ...balances, owedMinor: 120000, netMinor: 120000 },
      { supplierId: "shop_b", ...balances, owedMinor: 4800, netMinor: 4800 },
      { supplierId: "shop_e", ...balances, owingMinor: 25000, netMinor: -25000, paused: true, overdue: true },
    ],
    runs: [
      {
        id: "run_1",
        at: `${todayManila}T08:00:00.000Z`,
        key: `run:${todayManila}`,
        kind: "settlement_run",
        data: {
          date: todayManila,
          minimumMinor: 10000,
          payoutTime: "16:00",
          shops: [
            {
              supplierId: "shop_a",
              ...balances,
              owedMinor: 120000,
              netMinor: 120000,
              availableMinor: 120000,
              amountMinor: 120000,
              rolloverMinor: 0,
              items: [{ key: "stage:order_1:delivered", orderId: "order_1", amountMinor: 120000, netAmountMinor: 120000 }],
              held: [{ key: "stage:order_9:delivered", reason: "payout_held" }],
            },
            { supplierId: "shop_b", ...balances, availableMinor: 4800, amountMinor: 0, rolloverMinor: 4800, items: [], held: [] },
          ],
        },
      },
    ],
    transfers: [],
    ...over,
  };
}

function prepared(status: ShopMoneyTransfer["status"] = "transfer_reserved", payerId = "ops_1"): ShopMoneyTransfer {
  return {
    id: "money_t1",
    at: `${todayManila}T08:10:00.000Z`,
    key: "transfer:run_1:shop_a",
    supplierId: "shop_a",
    kind: "transfer_reserved",
    status,
    data: {
      items: [{ key: "stage:order_1:delivered", orderId: "order_1", amountMinor: 120000, netAmountMinor: 120000, recoveryMinor: 0 }],
      held: [],
      netAmountMinor: 120000,
      grossAmountMinor: 120000,
      runId: "run_1",
      payerId,
      payoutAccount: account,
    },
  };
}

function shop(over: Partial<ShopMoneyShop> = {}): ShopMoneyShop {
  return {
    balances: { ...balances, owedMinor: 120000, netMinor: 120000 },
    policy: { counterCashEnabled: false, version: 0 },
    history: [
      { id: "l1", at: "2026-11-23T02:00:00Z", key: "e1", supplierId: "shop_a", orderId: "order_1", kind: "entitlement", owedDeltaMinor: 100000, owingDeltaMinor: 0 },
      { id: "l2", at: "2026-11-23T02:00:00Z", key: "b1", supplierId: "shop_a", orderId: "order_1", kind: "bonus_award", owedDeltaMinor: 20000, owingDeltaMinor: 0 },
    ],
    jobs: [],
    earningsByDay: {},
    paymentMethods: { in_app_qr: 1 },
    payGridgo: null,
    ...over,
  };
}

function openShop(id: string) {
  nav.params = new URLSearchParams(`shop=${id}`);
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  nav.params = new URLSearchParams();
  nav.replace.mockReset();
  auth.id = "ops_1";
  api.listUsers.mockResolvedValue([
    { id: "shop_a", name: "Shop A", supplierName: "Shop A" },
    { id: "shop_b", name: "Shop B" },
    { id: "shop_e", name: "Shop E" },
  ]);
  api.getFileDownloadUrl.mockResolvedValue("https://files.test/qr.png");
  api.getShopMoneyDesk.mockResolvedValue(desk());
  api.getShopMoneyShop.mockResolvedValue(shop());
});
afterEach(cleanup);

describe("ShopMoneyDesk: the daily run", () => {
  it("lists shops by what they need: ready to prepare, then below the minimum", async () => {
    render(<ShopMoneyDesk base="/ops" superAdmin={false} />);
    expect(await screen.findByText("₱1,200.00 to prepare for 1 shop")).toBeInTheDocument();
    const shops = screen.getByRole("region", { name: "Shops" });
    expect(within(shops).getByRole("heading", { name: /Ready to prepare/ })).toBeInTheDocument();
    expect(within(shops).getByText("Below the minimum")).toBeInTheDocument();
    expect(within(shops).getByText("Rolls over")).toBeInTheDocument();
    expect(within(shops).getByText("A claim, issue or refund request holds it")).toBeInTheDocument();
  });

  it("says when today's run starts, before its cutoff", async () => {
    const later = new Date(Date.now() + 3600_000).toISOString();
    api.getShopMoneyDesk.mockResolvedValue(desk({ runs: [], shops: [{ supplierId: "shop_a", ...balances, nextPayoutAt: later }] }));
    render(<ShopMoneyDesk base="/ops" superAdmin={false} />);
    expect(await screen.findByText(/Today’s run starts/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get today's run" })).toBeNull();
  });

  it("asks for a late run and says so when none is due", async () => {
    api.getShopMoneyDesk.mockResolvedValue(desk({ runs: [] }));
    api.requestShopMoneyRun.mockResolvedValue(null);
    render(<ShopMoneyDesk base="/ops" superAdmin={false} />);
    await userEvent.click(await screen.findByRole("button", { name: "Get today's run" }));
    expect(await screen.findByText(/No run is due yet/)).toBeInTheDocument();
    expect(api.requestShopMoneyRun).toHaveBeenCalledTimes(1);
  });

  it("says plainly when the server has no shop money yet", async () => {
    api.getShopMoneyDesk.mockRejectedValue(new ApiError(404, { error: "not_found" }));
    render(<ShopMoneyDesk base="/ops" superAdmin={false} />);
    expect(await screen.findByText("Shop money is not on this server yet")).toBeInTheDocument();
  });
});

describe("ShopMoneyDesk: prepare", () => {
  it("restates the shop and amount, then prepares once however often it is pressed", async () => {
    openShop("shop_a");
    let release!: (v: unknown) => void;
    api.prepareShopTransfer.mockReturnValue(new Promise((r) => (release = r)));
    render(<ShopMoneyDesk base="/ops" superAdmin={false} />);
    await userEvent.click(await screen.findByRole("button", { name: "Prepare transfer" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Prepare ₱1,200.00 for Shop A?")).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Prepare transfer" });
    await userEvent.click(confirm);
    await userEvent.click(confirm);
    expect(api.prepareShopTransfer).toHaveBeenCalledTimes(1);
    expect(api.prepareShopTransfer).toHaveBeenCalledWith("run_1", "shop_a");
    api.getShopMoneyDesk.mockResolvedValue(desk({ transfers: [prepared()] }));
    release({ transfer: prepared(), status: null });
    expect(await screen.findByTestId("transfer-slip")).toBeInTheDocument();
    expect(screen.getByTestId("frozen-amount")).toHaveTextContent("₱1,200.00");
    expect(screen.getByText(/Prepared\. Send the frozen amount to Shop A once/)).toBeInTheDocument();
  });

  it("explains a shop that fell under the minimum since the run", async () => {
    openShop("shop_a");
    api.prepareShopTransfer.mockRejectedValue(new ApiError(409, { error: "settlement_minimum_not_met" }));
    render(<ShopMoneyDesk base="/ops" superAdmin={false} />);
    await userEvent.click(await screen.findByRole("button", { name: "Prepare transfer" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Prepare transfer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/now under the minimum/);
  });
});

describe("ShopMoneyDesk: a prepared transfer", () => {
  beforeEach(() => {
    openShop("shop_a");
    api.getShopMoneyDesk.mockResolvedValue(desk({ transfers: [prepared()] }));
  });

  it("records the exact frozen amount with the receipt, and reuses the upload on a retry", async () => {
    api.uploadPayoutReceipt.mockResolvedValue({ fileId: "file_receipt" });
    api.confirmShopTransfer
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({ transfer: {}, replayed: false });
    render(<ShopMoneyDesk base="/ops" superAdmin={false} />);
    await userEvent.click(await screen.findByRole("button", { name: "Record transfer" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Record ₱1,200.00 sent to Shop A?")).toBeInTheDocument();
    expect(within(dialog).getAllByText(/Shop A Owner/).length).toBeGreaterThan(0);

    // A different amount is refused before anything is sent.
    await userEvent.type(within(dialog).getByLabelText("Amount you sent (₱)"), "1,250");
    await userEvent.click(within(dialog).getByRole("button", { name: "Record transfer" }));
    expect(within(dialog).getByText(/not the prepared ₱1,200\.00/)).toBeInTheDocument();
    expect(api.confirmShopTransfer).not.toHaveBeenCalled();

    await userEvent.clear(within(dialog).getByLabelText("Amount you sent (₱)"));
    await userEvent.type(within(dialog).getByLabelText("Amount you sent (₱)"), "1200");
    await userEvent.upload(
      within(dialog).getByLabelText("Receipt screenshot"),
      new File(["png"], "receipt.png", { type: "image/png" }),
    );
    await userEvent.type(within(dialog).getByLabelText("Reference number"), " ref-778 ");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /I sent ₱1,200\.00 to Shop A Owner once/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Record transfer" }));
    expect(await within(dialog).findByText(/connection dropped/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Record transfer" }));
    await waitFor(() => expect(api.confirmShopTransfer).toHaveBeenCalledTimes(2));
    expect(api.uploadPayoutReceipt).toHaveBeenCalledTimes(1);
    const [first, second] = api.confirmShopTransfer.mock.calls;
    expect(first[0]).toBe("money_t1");
    expect(second[1]).toEqual(first[1]);
    expect(first[1]).toMatchObject({
      amountMinor: 120000,
      reference: "ref-778",
      receiptFileId: "file_receipt",
      fundsSentConfirmed: true,
      reason: "Sent the prepared daily transfer",
    });
    expect(Date.parse(first[1].paidAt)).toBeLessThanOrEqual(Date.now());
    expect(await screen.findByText(/Recorded: ₱1,200\.00 sent to Shop A/)).toBeInTheDocument();
  });

  it("marks an uncertain transfer unknown with a note, and keeps it reserved", async () => {
    api.markShopTransferUnknown.mockResolvedValue({});
    render(<ShopMoneyDesk base="/ops" superAdmin={false} />);
    await userEvent.click(await screen.findByRole("button", { name: "Outcome unknown" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Mark unknown" }));
    expect(within(dialog).getByText("Write a note for the record.")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("What happened"), "Wallet timed out");
    await userEvent.click(within(dialog).getByRole("button", { name: "Mark unknown" }));
    await waitFor(() => expect(api.markShopTransferUnknown).toHaveBeenCalledWith("money_t1", "Wallet timed out"));
    expect(await screen.findByText(/stays reserved; do not send it again/)).toBeInTheDocument();
  });

  it("records not sent only after the no-money check is ticked", async () => {
    api.cancelShopTransfer.mockResolvedValue({});
    api.getShopMoneyDesk.mockResolvedValue(desk({ transfers: [prepared("transfer_unknown")] }));
    render(<ShopMoneyDesk base="/ops" superAdmin={false} />);
    expect(await screen.findByText(/Do not send again/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Outcome unknown" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Not sent" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.type(within(dialog).getByLabelText("How you checked"), "No transfer in wallet history");
    await userEvent.click(within(dialog).getByRole("button", { name: "Record not sent" }));
    expect(within(dialog).getByText("Tick that you checked no money was sent.")).toBeInTheDocument();
    expect(api.cancelShopTransfer).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /no money was sent/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Record not sent" }));
    await waitFor(() => expect(api.cancelShopTransfer).toHaveBeenCalledWith("money_t1", "No transfer in wallet history"));
  });

  it("leaves another person's transfer to them, unless the reader is Super Admin", async () => {
    auth.id = "ops_2";
    const { unmount } = render(<ShopMoneyDesk base="/ops" superAdmin={false} />);
    expect(await screen.findByText(/Prepared by another team member\. Only they or Super Admin/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record transfer" })).toBeNull();
    unmount();
    render(<ShopMoneyDesk base="/admin" superAdmin />);
    expect(await screen.findByRole("button", { name: "Record transfer" })).toBeInTheDocument();
  });
});

describe("ShopMoneyDesk: Pay GRIDGO", () => {
  it("confirms the current amount with the bank reference", async () => {
    openShop("shop_e");
    api.getShopMoneyShop.mockResolvedValue(
      shop({
        balances: { ...balances, owingMinor: 25000, netMinor: -25000, paused: true, overdue: true },
        payGridgo: {
          requestId: "pay_1",
          amountMinor: 13000,
          reference: "GG-ABC123",
          deadlineAt: "2026-11-24T10:00:00.000Z",
          confirmation: "manual",
          qrImageUrl: null,
        },
      }),
    );
    api.confirmShopPayment.mockResolvedValue({ replayed: false });
    render(<ShopMoneyDesk base="/ops" superAdmin={false} />);
    expect(await screen.findAllByText("New orders paused")).not.toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Confirm payment received" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Confirm ₱130.00 received from Shop E?")).toBeInTheDocument();
    expect(within(dialog).getByText("GG-ABC123")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Bank reference of the payment"), "BANK-55");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /arrive in GRIDGO/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm payment" }));
    await waitFor(() =>
      expect(api.confirmShopPayment).toHaveBeenCalledWith("pay_1", {
        amountMinor: 13000,
        reference: "BANK-55",
        reason: "Payment seen in GRIDGO's account",
      }),
    );
    expect(await screen.findByText(/Confirmed ₱130\.00 from Shop E\. If new orders were paused, they reopen now\./)).toBeInTheDocument();
  });
});

describe("ShopMoneyDesk: counter cash", () => {
  it("is read-only for Operations and a confirmed, reasoned switch for Super Admin", async () => {
    openShop("shop_a");
    const { unmount } = render(<ShopMoneyDesk base="/ops" superAdmin={false} />);
    expect(await screen.findByText(/Super Admin turns it on per shop/)).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
    unmount();
    api.updateShopMoneyPolicy.mockResolvedValue({ counterCashEnabled: true, version: 1 });
    render(<ShopMoneyDesk base="/admin" superAdmin />);
    await userEvent.click(await screen.findByRole("switch", { name: "Cash at the counter for Shop A" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.type(within(dialog).getByLabelText("Reason"), "Pilot shop");
    await userEvent.click(within(dialog).getByRole("button", { name: "Turn on" }));
    await waitFor(() =>
      expect(api.updateShopMoneyPolicy).toHaveBeenCalledWith("shop_a", { expectedVersion: 0, counterCashEnabled: true, reason: "Pilot shop" }),
    );
  });
});
