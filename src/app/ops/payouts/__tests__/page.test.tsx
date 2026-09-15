// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OpsPayoutsPage from "@/app/ops/payouts/page";
import { setTokenProvider } from "@/lib/api/client";
import type { Claim, Order, PayoutMilestone } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));

function milestone(code: string, p: Partial<PayoutMilestone> = {}): PayoutMilestone {
  const share =
    { printing: 50, packaging_qc: 15, delivered: 25, retention: 10 }[code] ?? 25;
  return {
    code,
    sharePercent: share,
    amountMinor: share * 1000,
    status: "pending_pof",
    pofFileIds: [],
    releasedAt: null,
    releasedBy: null,
    ...p,
  };
}

function order(
  id: string,
  title: string,
  state: string,
  milestones: PayoutMilestone[],
  extra: Partial<Order> = {},
): Order {
  return {
    id,
    clientId: "c1",
    supplierId: "s1",
    riderId: null,
    state,
    title,
    deadline: null,
    address: "Davao",
    deliveryFeeMinor: 0,
    totalMinor: 0,
    paymentMethod: null,
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-09-15T10:00:00Z",
    updatedAt: "2026-09-15T10:00:00Z",
    timeline: [],
    payoutMilestones: milestones,
    ...extra,
  } as unknown as Order;
}

const proven = (code: string) =>
  milestone(code, { status: "pof_attached", pofFileIds: [`f_${code}`] });
const released = (code: string) =>
  milestone(code, { status: "released", pofFileIds: [`f_${code}`] });

const orders: Order[] = [
  order("ord_ready", "Business cards", "supplier_self_qc", [
    proven("printing"),
    proven("packaging_qc"),
    milestone("delivered"),
    milestone("retention"),
  ]),
  order("ord_wait", "Tarpaulin", "production", [
    milestone("printing"),
    milestone("packaging_qc"),
    milestone("delivered"),
    milestone("retention"),
  ]),
  order(
    "ord_held",
    "Stickers",
    "production",
    [
      proven("printing"),
      milestone("packaging_qc"),
      milestone("delivered"),
      milestone("retention"),
    ],
    { payoutHold: true },
  ),
  order("ord_done", "Flyers", "completed", [
    released("printing"),
    released("packaging_qc"),
    released("delivered"),
    released("retention"),
  ]),
  order("ord_early", "Posters", "needs_qa", [milestone("printing")]),
];

const claims: Claim[] = [
  {
    id: "clm_1",
    orderId: "ord_held",
    raisedBy: "user_client",
    reason: "Colour is off",
    status: "payout_held",
    holdReason: "Client reported the colour",
    releaseReason: null,
    heldAt: null,
    heldBy: null,
    releasedAt: null,
    releasedBy: null,
    createdAt: "2026-09-15T10:00:00Z",
    updatedAt: "2026-09-15T10:00:00Z",
    issueId: null,
    timeline: [],
  },
];

beforeEach(() => {
  vi.stubGlobal("React", React);
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/orders")) {
        return new Response(JSON.stringify({ orders }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (path.endsWith("/claims")) {
        return new Response(JSON.stringify({ claims }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    }),
  );
});
afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

describe("the payout desk", () => {
  it("sorts every order into the question Operations asks about it", async () => {
    render(<OpsPayoutsPage />);
    const ready = await screen.findByRole("region", { name: /Ready to release/ });
    expect(within(ready).getByRole("link", { name: /Business cards/ })).toHaveAttribute(
      "href",
      "/ops/payouts/ord_ready",
    );
    expect(
      within(ready).getByText("2 shares ready to release, ₱650.00 together."),
    ).toBeInTheDocument();

    const held = screen.getByRole("region", { name: /Held by a claim/ });
    expect(within(held).getByRole("link", { name: /Stickers/ })).toBeInTheDocument();

    const waiting = screen.getByRole("region", {
      name: /Waiting on the shop or the rider/,
    });
    expect(within(waiting).getByRole("link", { name: /Tarpaulin/ })).toBeInTheDocument();
    expect(within(waiting).getByText(/Waiting on the shop's proof/)).toBeInTheDocument();

    const settled = screen.getByRole("region", { name: /Fully paid/ });
    expect(
      within(settled).getByText("All 4 shares released, ₱1,000.00 paid."),
    ).toBeInTheDocument();

    // Too early for a payout: not on this desk at all.
    expect(screen.queryByText("Posters")).toBeNull();
    // No proof pictures or release buttons on the queue itself.
    expect(screen.queryByRole("button", { name: /^Release/ })).toBeNull();
  });

  it("says out loud when nothing can be released", async () => {
    orders.splice(0, 1);
    try {
      render(<OpsPayoutsPage />);
      expect(await screen.findByText(/Nothing to release right now/)).toBeInTheDocument();
    } finally {
      orders.unshift(
        order("ord_ready", "Business cards", "supplier_self_qc", [
          proven("printing"),
          proven("packaging_qc"),
          milestone("delivered"),
          milestone("retention"),
        ]),
      );
    }
  });
});
