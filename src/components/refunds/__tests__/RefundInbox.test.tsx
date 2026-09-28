// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RefundInbox, refundForOrder } from "@/components/refunds/RefundInbox";
import { setTokenProvider } from "@/lib/api/client";
import type { RefundRequest } from "@/lib/api/types";

vi.stubGlobal("React", React);
const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => search,
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "ops_1" } }) }));

function refund(id: string, orderId: string, patch: Partial<RefundRequest> = {}): RefundRequest {
  return {
    id,
    orderId,
    status: "requested",
    version: 1,
    policyVersion: "available_funds_v1",
    kind: "cancellation",
    reason: "Changed my mind",
    evidenceFileIds: [],
    destination: {
      provider: "gcash",
      accountName: "Client",
      qrFileId: "f",
      ownershipConfirmed: true,
      revision: 1,
    },
    beforeProduction: true,
    late: false,
    filingDeadlineAt: null,
    createdAt: "2026-09-28T04:00:00.000Z",
    updatedAt: "2026-09-28T04:00:00.000Z",
    history: [],
    settlement: null,
    payment: null,
    ...patch,
  };
}

const settlement = {
  id: "rsettle_1",
  principalMinor: 40000,
  feeMinor: 4000,
  deliveryMinor: 5000,
  totalMinor: 49000,
  disposition: "cancelled" as const,
  reason: "Agreed",
};

const refunds: RefundRequest[] = [
  refund("r_review", "o_review"),
  refund("r_unknown", "o_unknown", { status: "payment_unknown", settlement }),
  refund("r_late", "o_late", { late: true }),
  refund("r_qr", "o_qr", { destination: null }),
  refund("r_pay", "o_pay", {
    status: "approved",
    settlement,
    supplierSettlementPayouts: [
      {
        id: "rspay_1",
        settlementId: "rsettle_1",
        orderId: "o_pay",
        supplierId: "s",
        amountMinor: 20000,
        status: "pending",
        reference: null,
        receiptFileId: null,
        releasedAt: null,
        releasedBy: null,
        createdAt: "2026-09-28T04:20:00.000Z",
        code: "refund_settlement",
        label: "Agreed refund settlement payout",
        releaseRequires: "",
      },
    ],
  }),
  refund("r_old", "o_review", { status: "rejected", createdAt: "2026-09-20T04:00:00.000Z" }),
];

const titles: Record<string, string> = {
  o_review: "Business cards",
  o_unknown: "Stickers",
  o_late: "Flyers",
  o_qr: "Posters",
  o_pay: "Tarpaulin",
};

beforeEach(() => {
  search = new URLSearchParams();
  replace.mockReset();
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), "http://localhost").pathname;
      const body = path.endsWith("/refund-requests")
        ? { refunds }
        : path.endsWith("/orders")
          ? { orders: Object.entries(titles).map(([id, title]) => ({ id, title })) }
          : { error: "not_found" };
      return new Response(JSON.stringify(body), {
        status: "error" in body ? 404 : 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});
afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
  vi.stubGlobal("React", React);
});

describe("the refund inbox", () => {
  it("sorts requests by what they wait on, an unconfirmed transfer first", async () => {
    render(<RefundInbox tree="ops" />);
    const groups = await screen.findAllByRole("region");
    expect(groups.map((g) => g.getAttribute("aria-labelledby"))).toEqual([
      "refund-group-reconcile",
      "refund-group-review",
      "refund-group-pay",
      "refund-group-client-qr",
      "refund-group-super-admin",
      "refund-group-closed",
      "refund-group-shop",
    ]);
    const reconcile = screen.getByRole("region", { name: /Transfer unconfirmed/ });
    expect(within(reconcile).getByRole("link", { name: /Stickers/ })).toHaveAttribute(
      "href",
      "/ops/refunds/r_unknown",
    );
    expect(within(reconcile).getByText(/Do not send again/)).toBeInTheDocument();

    const late = screen.getByRole("region", { name: /Late, with Super Admin/ });
    expect(within(late).getByText("Filed late")).toBeInTheDocument();

    const shop = screen.getByRole("region", { name: /Shop settlement payouts to record/ });
    expect(within(shop).getByText("₱200.00")).toBeInTheDocument();
    expect(within(shop).getByText("Agreed refund settlement payout")).toBeInTheDocument();
  });

  it("gives Super Admin its late cases to decide", async () => {
    render(<RefundInbox tree="admin" />);
    const review = await screen.findByRole("region", { name: /Needs a review/ });
    expect(within(review).getByRole("link", { name: /Flyers/ })).toHaveAttribute(
      "href",
      "/admin/refunds/r_late",
    );
    expect(screen.queryByRole("region", { name: /Late, with Super Admin/ })).toBeNull();
  });

  it("opens the order's open request from an inbox notice", async () => {
    search = new URLSearchParams("order=o_review");
    render(<RefundInbox tree="ops" />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/ops/refunds/r_review"));
  });

  it("picks the open request over an older closed one", () => {
    expect(refundForOrder(refunds, "o_review")?.id).toBe("r_review");
    expect(refundForOrder(refunds, "nothing")).toBeNull();
  });
});
