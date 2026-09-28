// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderWorkspace, refundFilingLate } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import type { Order, RefundRequest } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "order1" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/components/orders/EvidencePreview", () => ({
  EvidencePlate: () => null,
  EvidenceStrip: () => null,
}));

class FakePointerEvent extends MouseEvent {
  constructor(type: string, init?: PointerEventInit) {
    super(type, init);
  }
}

const confirmed = {
  amountMinor: 115000,
  method: "qr_manual",
  status: "confirmed",
  reference: "REF",
  submittedAt: "2026-09-27T04:00:00Z",
  confirmedAt: "2026-09-27T05:00:00Z",
  confirmedBy: "ops_1",
  confirmationSource: "manual_ops",
};

function base(extra: Partial<Order> = {}): Order {
  return {
    id: "order1",
    clientId: "client1",
    supplierId: "shop1",
    riderId: null,
    state: "production",
    title: "Tarpaulin 3x6",
    deadline: null,
    address: "Davao",
    totalMinor: 115000,
    deliveryFeeMinor: 5000,
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-09-25T10:00:00Z",
    updatedAt: "2026-09-25T10:00:00Z",
    timeline: [],
    downpaymentPercent: 100,
    payments: { downpayment: confirmed },
    ...extra,
  } as unknown as Order;
}

let order: Order;
let refunds: RefundRequest[];
let posted: { path: string; body: unknown; key: string | null }[];

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("PointerEvent", FakePointerEvent);
  setTokenProvider(() => "fixture-token");
  posted = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://localhost").pathname.replace(
        /^\/api\/gridgo/,
        "",
      );
      const reply = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (init?.method === "POST") {
        const headers = (init.headers ?? {}) as Record<string, string>;
        posted.push({
          path,
          body: typeof init.body === "string" ? JSON.parse(init.body) : null,
          key: headers["Idempotency-Key"] ?? null,
        });
        return reply({ refund: { id: "refund_new" } }, 201);
      }
      if (path === "/orders/order1") return reply({ order });
      if (path === "/orders/order1/refund-requests") return reply({ refunds });
      if (path === "/escalations") return reply({ escalations: [] });
      return reply({ error: "not_found" }, 404);
    }),
  );
});
afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

describe("the order workspace's client refund row", { timeout: 20_000 }, () => {
  it("says work is paused and links the open refund case", async () => {
    order = base({ refundHold: true });
    refunds = [
      {
        id: "refund_1",
        orderId: "order1",
        status: "requested",
        version: 1,
        kind: "complaint",
        createdAt: "2026-09-28T04:00:00Z",
        settlement: null,
        payment: null,
      } as unknown as RefundRequest,
    ];
    render(<OrderWorkspace queueHref="/admin/overview" />);
    const banner = await screen.findByText("A client refund request is open");
    expect(banner.closest("[role=status]")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Open the refund case" });
    for (const link of links)
      expect(link).toHaveAttribute("href", "/admin/refunds/refund_1");
    expect(screen.getByText("Complaint: Waiting for review.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "File a refund for the client" }),
    ).toBeNull();
  });

  it("files a refund for the client, without a destination", async () => {
    order = base();
    refunds = [];
    const user = userEvent.setup();
    render(<OrderWorkspace queueHref="/ops/orders" />);
    await user.click(await screen.findByRole("button", { name: /Client refund/ }));
    await user.click(
      screen.getByRole("button", { name: "File a refund for the client" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.type(
      within(dialog).getByLabelText("The client’s reason"),
      "Wrong size ordered.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "File and pause the order" }),
    );
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].path).toBe("/orders/order1/refund-requests");
    expect(posted[0].key).toBeTruthy();
    expect(posted[0].body).toEqual({
      kind: "cancellation",
      reason: "Wrong size ordered.",
      evidenceFileIds: [],
    });
  });

  it("knows when filing has closed and leaves late filing to Super Admin", () => {
    const now = Date.parse("2026-09-28T12:00:00Z");
    expect(refundFilingLate(base(), now)).toBe(false);
    expect(
      refundFilingLate(
        base({
          state: "issue_window_open",
          issueWindowExpiresAt: "2026-09-29T00:00:00Z",
        }),
        now,
      ),
    ).toBe(false);
    expect(
      refundFilingLate(
        base({
          state: "issue_window_open",
          issueWindowExpiresAt: "2026-09-28T12:00:00Z",
        }),
        now,
      ),
    ).toBe(true);
    expect(refundFilingLate(base({ state: "completed" }), now)).toBe(true);
  });
});
