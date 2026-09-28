// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OpsPayoutReviewPage from "@/app/ops/payouts/[id]/page";
import { setTokenProvider } from "@/lib/api/client";
import type { Order, RefundRequest } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "order_1" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/components/orders/EvidencePreview", () => ({
  EvidencePlate: ({ label }: { label: string }) => <div>{label}</div>,
  EvidenceStrip: () => null,
}));

class FakePointerEvent extends MouseEvent {
  constructor(type: string, init?: PointerEventInit) {
    super(type, init);
  }
}

const account = {
  supplierId: "shop_1",
  provider: "gcash",
  accountName: "Juan's Print Shop",
  accountNumber: "+639171234567",
  institution: null,
  qr: { fileId: "file_shop_qr", originalFilename: null, detectedContentType: null, size: null, readyAt: null },
  version: 3,
  updatedAt: "2026-09-20T00:00:00.000Z",
  shopName: "Juan's Print Shop",
};

const payout = {
  id: "rspay_1",
  settlementId: "rsettle_1",
  orderId: "order_1",
  supplierId: "shop_1",
  amountMinor: 20000,
  status: "pending",
  reference: null,
  receiptFileId: null,
  releasedAt: null,
  releasedBy: null,
  createdAt: "2026-09-28T04:20:00.000Z",
  code: "refund_settlement",
  label: "Agreed refund settlement payout",
  releaseRequires: "Operations records the exact remaining shop obligation.",
};

const order = {
  id: "order_1",
  clientId: "client_1",
  supplierId: "shop_1",
  riderId: null,
  state: "cancelled",
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
  updatedAt: "2026-09-28T04:20:00.000Z",
  timeline: [],
  payoutPlanVersion: 2,
  payoutMilestones: [
    { code: "production_started", label: "Start of production", sharePercent: 40, amountMinor: 40000, status: "released", pofFileIds: ["f1"], releaseRequires: "shop_proof" },
    { code: "delivered", label: "Delivered", sharePercent: 35, amountMinor: 35000, status: "superseded", pofFileIds: [], releaseRequires: "delivery_proof", supersededAt: "2026-09-28T04:20:00.000Z" },
    { code: "issue_window", label: "After the complaint window", sharePercent: 25, amountMinor: 25000, status: "superseded", pofFileIds: [], releaseRequires: "issue_window_closed", supersededAt: "2026-09-28T04:20:00.000Z" },
  ],
  supplierSettlementPayouts: [payout],
  supplierPayoutAccount: account,
} as unknown as Order;

const refund = {
  id: "refund_1",
  orderId: "order_1",
  status: "approved",
  version: 4,
  settlement: { id: "rsettle_1", totalMinor: 49000 },
  supplierPayoutAccount: account,
} as unknown as RefundRequest;

type Call = { method: string; path: string; body: unknown };
let calls: Call[];

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("PointerEvent", FakePointerEvent);
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  setTokenProvider(() => "fixture-token");
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://localhost").pathname.replace(/^\/api\/gridgo/, "");
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string"
          ? JSON.parse(init.body)
          : init?.body instanceof FormData
            ? Object.fromEntries([...init.body.entries()].filter(([k]) => k === "purpose"))
            : null;
      calls.push({ method, path, body });
      const reply = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
      if (path === "/orders/order_1") return reply({ order });
      if (path === "/claims") return reply({ claims: [] });
      if (path === "/orders/order_1/refund-requests") return reply({ refunds: [refund] });
      if (path.endsWith("/download-url")) return reply({ url: "blob:qr" });
      if (path === "/files" && method === "POST") return reply({ file: { fileId: "file_payout_receipt" } }, 201);
      if (path === "/refund-requests/refund_1/supplier-payout") return reply({ refund });
      return reply({ error: "not_found" }, 404);
    }),
  );
});
afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

describe("the payout review after a refund settlement", { timeout: 20_000 }, () => {
  it("shows replaced shares as unpaid and records the agreed settlement payout", async () => {
    const user = userEvent.setup();
    render(<OpsPayoutReviewPage />);

    expect(await screen.findAllByText("Replaced by settlement")).toHaveLength(2);
    // One chip for the paid share; the other "Released" is the earnings label.
    expect(screen.getAllByText("Released")).toHaveLength(2);
    expect(screen.getByText("After the client refund")).toBeInTheDocument();
    expect(screen.getByText("Earns, as settled")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Record ₱200.00 to the shop" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Agreed refund settlement payout: the exact amount/)).toBeInTheDocument();
    const record = within(dialog).getByRole("button", { name: "Record shop payout" });
    expect(record).toBeDisabled();

    await user.click(within(dialog).getByRole("checkbox", { name: /I scanned this QR/ }));
    await user.upload(
      within(dialog).getByLabelText("Wallet transfer evidence"),
      new File(["png"], "sent.png", { type: "image/png" }),
    );
    await user.type(within(dialog).getByLabelText("Wallet reference number"), "SHOP-200");
    await user.click(record);

    await waitFor(() =>
      expect(calls.find((c) => c.path.endsWith("/supplier-payout"))).toBeTruthy(),
    );
    expect(calls.find((c) => c.path === "/files")?.body).toEqual({ purpose: "payout_receipt" });
    expect(calls.find((c) => c.path.endsWith("/supplier-payout"))?.body).toEqual({
      expectedVersion: 4,
      reason: "Agreed remaining shop payment sent.",
      amountMinor: 20000,
      payoutAccountVersion: 3,
      destinationVerified: true,
      reference: "SHOP-200",
      receiptFileId: "file_payout_receipt",
    });
  });
});
