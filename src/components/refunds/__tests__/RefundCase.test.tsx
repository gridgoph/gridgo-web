// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RefundCase } from "@/components/refunds/RefundCase";
import { setTokenProvider } from "@/lib/api/client";
import type { Order, RefundAttempt, RefundRequest } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "refund_1" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "ops_1" } }) }));
vi.mock("@/components/orders/EvidencePreview", () => ({
  EvidencePlate: ({ label }: { label: string }) => <div>{label}</div>,
  EvidenceStrip: () => null,
}));

const destination = {
  provider: "gcash",
  accountName: "Client Wallet Name",
  qrFileId: "file_qr",
  ownershipConfirmed: true,
  revision: 1,
};

function refund(patch: Partial<RefundRequest> = {}): RefundRequest {
  return {
    id: "refund_1",
    orderId: "order_1",
    status: "requested",
    version: 1,
    policyVersion: "available_funds_v1",
    kind: "cancellation",
    reason: "The shop cannot fulfill this order.",
    evidenceFileIds: [],
    destination,
    beforeProduction: false,
    late: false,
    filingDeadlineAt: null,
    createdAt: "2026-09-28T04:00:00.000Z",
    updatedAt: "2026-09-28T04:00:00.000Z",
    history: [
      { kind: "requested", reason: "The shop cannot fulfill this order.", at: "2026-09-28T04:00:00.000Z" },
    ],
    settlement: null,
    payment: null,
    clientId: "client_1",
    collections: { principalMinor: 100000, feeMinor: 10000, deliveryMinor: 5000 },
    releasedShopMinor: 40000,
    previousRefunds: [],
    supplierSettlementPayouts: [],
    supplierPayoutAccount: null,
    attempt: null,
    ...patch,
  };
}

const order = {
  id: "order_1",
  clientId: "client_1",
  supplierId: "shop_1",
  riderId: null,
  state: "production",
  title: "Tarpaulin 3x6",
  deadline: null,
  address: "Davao",
  deliveryFeeMinor: 5000,
  totalMinor: 115000,
  paymentMethod: "qr_manual",
  paymentStatus: "paid",
  promisedDate: null,
  artworkName: null,
  createdAt: "2026-09-27T04:00:00.000Z",
  updatedAt: "2026-09-28T04:00:00.000Z",
  timeline: [],
  refundHold: true,
} as unknown as Order;

const settlement = {
  id: "rsettle_1",
  requestId: "refund_1",
  principalMinor: 60000,
  feeMinor: 6000,
  deliveryMinor: 5000,
  totalMinor: 71000,
  disposition: "cancelled" as const,
  reason: "You get back the print work not done.",
  createdAt: "2026-09-28T04:20:00.000Z",
  createdBy: "ops_1",
};

function attempt(patch: Partial<RefundAttempt> = {}): RefundAttempt {
  return {
    id: "rattempt_1",
    requestId: "refund_1",
    settlementId: "rsettle_1",
    payerId: "ops_1",
    status: "in_progress",
    destination,
    amountMinor: 71000,
    provider: "gcash",
    sourceWallet: "ops-gcash-1",
    createdAt: "2026-09-28T04:25:00.000Z",
    updatedAt: "2026-09-28T04:25:00.000Z",
    ...patch,
  };
}

const preview = {
  amounts: {
    principalMinor: 60000,
    feeMinor: 6000,
    deliveryMinor: 5000,
    totalMinor: 71000,
    collected: { principalMinor: 100000, feeMinor: 10000, deliveryMinor: 5000 },
    previous: { principalMinor: 0, feeMinor: 0, deliveryMinor: 0 },
    releasedMinor: 40000,
    remainingShopMinor: 0,
    shopEntitlementMinor: 40000,
    riderEntitlementMinor: 0,
    availablePrincipalMinor: 60000,
  },
  availableTotalMinor: 71000,
  canSettle: true,
};

type Call = { method: string; path: string; body: unknown; key: string | null };
let current: RefundRequest;
let calls: Call[];
let answer: (call: Call) => Response | null;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Base UI's checkbox and radio dispatch a PointerEvent on click. jsdom has none.
class FakePointerEvent extends MouseEvent {
  constructor(type: string, init?: PointerEventInit) {
    super(type, init);
  }
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("PointerEvent", FakePointerEvent);
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  setTokenProvider(() => "fixture-token");
  calls = [];
  answer = () => null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : init?.body ? "form" : null;
      const call = { method, path: url.pathname.replace(/^\/api\/gridgo/, ""), body, key: headers["Idempotency-Key"] ?? null };
      calls.push(call);
      const custom = answer(call);
      if (custom) return custom;
      if (call.path === "/refund-requests/refund_1") return json({ refund: current });
      if (call.path === "/orders/order_1") return json({ order });
      if (call.path === "/claims") return json({ claims: [] });
      if (call.path.endsWith("/download-url")) return json({ url: "blob:qr" });
      if (call.path.startsWith("/users/")) return json({ user: { id: "ops_2", name: "Bea Santos" } });
      return json({ error: "not_found" }, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

describe("the refund case", { timeout: 20_000 }, () => {
  it("reviews the request against the client's own QR, with a note the client reads", async () => {
    current = refund();
    answer = (call) =>
      call.method === "POST" && call.path === "/refund-requests/refund_1/review"
        ? json({ refund: refund({ status: "reviewed", version: 2 }) })
        : null;
    const user = userEvent.setup();
    render(<RefundCase tree="ops" />);

    expect(await screen.findByRole("heading", { name: /Refund on Tarpaulin 3x6/ })).toBeInTheDocument();
    expect(screen.getAllByText("Client Wallet Name").length).toBeGreaterThan(0);
    const review = screen.getByRole("button", { name: "Mark reviewed" });
    expect(review).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /I scanned this QR in a wallet app/ }));
    await user.click(review);

    await waitFor(() =>
      expect(calls.find((c) => c.path === "/refund-requests/refund_1/review")).toBeTruthy(),
    );
    const sent = calls.find((c) => c.path === "/refund-requests/refund_1/review")!;
    expect(sent.key).toBeTruthy();
    expect(sent.body).toEqual({
      expectedVersion: 1,
      reason: "Your request and receiving account were checked.",
      destinationVerified: true,
    });
    expect(await screen.findByText(/Marked reviewed/)).toBeInTheDocument();
  });

  it("previews on the server, then approves exactly the previewed total with work stopped", async () => {
    current = refund({ status: "reviewed", version: 3 });
    answer = (call) => {
      if (call.path === "/refund-requests/refund_1/settlement-preview") return json(preview);
      if (call.path === "/refund-requests/refund_1/settle") {
        return json({ refund: refund({ status: "approved", version: 4, settlement }) });
      }
      return null;
    };
    const user = userEvent.setup();
    render(<RefundCase tree="ops" />);

    const shop = await screen.findByLabelText(/What the shop keeps in all/);
    expect(shop).toHaveValue("400.00");
    expect(screen.queryByRole("button", { name: /^Approve/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Preview the refund" }));
    const previewCall = await waitFor(() => {
      const found = calls.find((c) => c.path.endsWith("/settlement-preview"));
      expect(found).toBeTruthy();
      return found!;
    });
    expect(previewCall.body).toEqual({
      expectedVersion: 3,
      shopEntitlementMinor: 40000,
      riderEntitlementMinor: 0,
    });
    // A read-only calculation carries no idempotency key.
    expect(previewCall.key).toBeNull();

    const ledger = await screen.findByText("Refund to the client");
    expect(ledger.closest("div")).toHaveTextContent("₱710.00");
    expect(screen.getAllByText("Already paid to the shop").length).toBe(2);

    const approve = screen.getByRole("button", { name: "Approve ₱710.00 refund" });
    expect(approve).toBeDisabled();
    await user.type(screen.getByLabelText("The shop’s agreement"), "Shop keeps the ₱400 it has.");
    await user.type(screen.getByLabelText("Delivery and the rider"), "No trip started.");
    await user.type(screen.getByLabelText("Decision for the client"), "You get back the print work not done.");
    expect(approve).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Production and delivery have stopped/ }));
    await user.click(approve);

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/It sends nothing/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Approve ₱710.00" }));

    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/settle"))).toBeTruthy());
    const settle = calls.find((c) => c.path.endsWith("/settle"))!;
    expect(settle.key).toBeTruthy();
    expect(settle.body).toEqual({
      expectedVersion: 3,
      shopEntitlementMinor: 40000,
      riderEntitlementMinor: 0,
      totalMinor: 71000,
      reason: "You get back the print work not done.",
      workStopped: true,
      shopAgreement: "Shop keeps the ₱400 it has.",
      deliveryEvidence: "No trip started.",
    });
  });

  it("asks for a new preview when the figures change after one", async () => {
    current = refund({ status: "reviewed", version: 3 });
    answer = (call) => (call.path.endsWith("/settlement-preview") ? json(preview) : null);
    const user = userEvent.setup();
    render(<RefundCase tree="ops" />);
    await user.click(await screen.findByRole("button", { name: "Preview the refund" }));
    await screen.findByRole("button", { name: "Approve ₱710.00 refund" });

    const rider = screen.getByLabelText(/What the rider earned/);
    await user.clear(rider);
    await user.type(rider, "20");
    expect(screen.queryByRole("button", { name: /^Approve/ })).toBeNull();
    expect(screen.getByText(/Preview again before approving/)).toBeInTheDocument();
  });

  it("says there is no override when the funds do not stretch", async () => {
    current = refund({ status: "reviewed", version: 3 });
    answer = (call) =>
      call.path.endsWith("/settlement-preview")
        ? json(
            {
              error: "refund_exceeds_available_funds",
              availablePrincipalMinor: 60000,
              escalateTo: "super_admin",
            },
            409,
          )
        : null;
    const user = userEvent.setup();
    render(<RefundCase tree="ops" />);
    const principal = await screen.findByLabelText(/Print work to refund/);
    await user.type(principal, "900");
    await user.click(screen.getByRole("button", { name: "Preview the refund" }));
    expect(
      await screen.findByText(
        "At most ₱600.00 can go back for the print work. There is no override: refer anything larger to Super Admin.",
      ),
    ).toBeInTheDocument();
  });

  it("reserves one payer against the verified QR revision before anyone sends", async () => {
    current = refund({ status: "approved", version: 4, settlement });
    answer = (call) =>
      call.path.endsWith("/payment-attempts")
        ? json({ refund: refund({ status: "payment_in_progress", version: 5, settlement, attempt: attempt() }) })
        : null;
    const user = userEvent.setup();
    render(<RefundCase tree="ops" />);

    expect(await screen.findByText(/approved. No money has been sent/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Which of GRIDGO/), "ops-gcash-1");
    const reserve = screen.getByRole("button", { name: "Reserve this transfer for me" });
    expect(reserve).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /I will pay QR revision 1/ }));
    await user.click(reserve);

    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/payment-attempts"))).toBeTruthy());
    expect(calls.find((c) => c.path.endsWith("/payment-attempts"))!.body).toEqual({
      expectedVersion: 4,
      reason: "Your refund transfer is being sent.",
      destinationRevision: 1,
      destinationVerified: true,
      provider: "gcash",
      sourceWallet: "ops-gcash-1",
    });
  });

  it("never offers a second send on an unconfirmed transfer, and records the same one", async () => {
    current = refund({
      status: "payment_unknown",
      version: 6,
      settlement,
      attempt: attempt({ status: "unknown" }),
    });
    answer = (call) => {
      if (call.method === "POST" && call.path === "/files") {
        return json({ file: { fileId: "file_receipt", purpose: "refund_receipt" } }, 201);
      }
      if (call.path.endsWith("/payments")) {
        return json({
          refund: refund({
            status: "paid",
            version: 7,
            settlement,
            payment: {
              id: "rpay_1",
              reference: "WALLET-123",
              receiptFileId: "file_receipt",
              amountMinor: 71000,
              paidAt: "2026-09-28T04:30:00.000Z",
              evidenceLabel: "Wallet transfer evidence",
            },
          }),
        });
      }
      return null;
    };
    const user = userEvent.setup();
    render(<RefundCase tree="ops" />);

    expect(await screen.findByText("Do not send this refund again.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reserve/ })).toBeNull();
    expect(screen.getByRole("button", { name: "No money left the wallet" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Record the same transfer" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.type(within(dialog).getByLabelText("Wallet reference number"), "wallet-123");
    const evidence = new File(["png"], "sent.png", { type: "image/png" });
    await user.upload(within(dialog).getByLabelText("Wallet transfer evidence"), evidence);
    await user.click(within(dialog).getByRole("button", { name: "Record transfer" }));

    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/payments"))).toBeTruthy());
    const upload = calls.find((c) => c.path === "/files")!;
    expect(upload.body).toBe("form");
    const payment = calls.find((c) => c.path.endsWith("/payments"))!;
    expect(payment.body).toMatchObject({
      expectedVersion: 6,
      attemptId: "rattempt_1",
      amountMinor: 71000,
      reference: "wallet-123",
      receiptFileId: "file_receipt",
    });
    expect(typeof (payment.body as { paidAt: string }).paidAt).toBe("string");
  });

  it("leaves someone else's reserved transfer to them", async () => {
    current = refund({
      status: "payment_in_progress",
      version: 5,
      settlement,
      attempt: attempt({ payerId: "ops_2" }),
    });
    render(<RefundCase tree="ops" />);
    expect(
      await screen.findByText(/Only Bea Santos or Super Admin can record or reconcile/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Record the transfer/ })).toBeNull();
  });

  it("shows Operations a late case read-only and lets Super Admin decide it", async () => {
    current = refund({ late: true, filingDeadlineAt: "2026-09-27T04:00:00.000Z" });
    render(<RefundCase tree="ops" />);
    expect(await screen.findByText(/Filed after the complaint deadline/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark reviewed" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Reject/ })).toBeNull();
    cleanup();

    render(<RefundCase tree="admin" />);
    expect(await screen.findByText(/You decide this one/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark reviewed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject with a reason" })).toBeInTheDocument();
  });

  it("rejects with a reason written for the client", async () => {
    current = refund();
    answer = (call) =>
      call.path.endsWith("/reject")
        ? json({ refund: refund({ status: "rejected", version: 2 }) })
        : null;
    const user = userEvent.setup();
    render(<RefundCase tree="ops" />);
    await user.click(await screen.findByRole("button", { name: "Reject with a reason" }));
    const dialog = await screen.findByRole("alertdialog");
    const reject = within(dialog).getByRole("button", { name: "Reject request" });
    expect(reject).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Reason for the client"), "The job was delivered as ordered.");
    await user.click(reject);
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/reject"))).toBeTruthy());
    expect(calls.find((c) => c.path.endsWith("/reject"))!.body).toEqual({
      expectedVersion: 1,
      reason: "The job was delivered as ordered.",
    });
  });

  it("explains a stale version and reloads", async () => {
    current = refund();
    answer = (call) =>
      call.path.endsWith("/review") ? json({ error: "refund_stale", currentVersion: 2 }, 409) : null;
    const user = userEvent.setup();
    render(<RefundCase tree="ops" />);
    await user.click(await screen.findByRole("checkbox", { name: /I scanned this QR in a wallet app/ }));
    await user.click(screen.getByRole("button", { name: "Mark reviewed" }));
    expect(await screen.findByText(/Someone else changed this refund/)).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.filter((c) => c.path === "/refund-requests/refund_1" && c.method === "GET").length).toBeGreaterThan(1),
    );
  });
});
