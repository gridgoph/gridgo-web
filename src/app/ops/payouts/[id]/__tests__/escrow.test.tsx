// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OpsPayoutReviewPage from "@/app/ops/payouts/[id]/page";
import { setTokenProvider } from "@/lib/api/client";
import type { Claim, Order, PayoutMilestone } from "@/lib/api/types";
import { escrowStages, proofOnFile, released } from "@/test/payout-plans";

vi.stubGlobal("React", React);
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "ord_escrow" }) }));
vi.mock("@/components/orders/EvidencePreview", () => ({
  EvidencePlate: ({ fileId, label }: { fileId: string; label: string }) => (
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={label} src={`plate:${fileId}`} />
    </figure>
  ),
  EvidenceStrip: () => null,
}));

const DELIVERY = {
  fileId: "file_door",
  evidenceType: "photo",
  riderId: "r1",
  recordedAt: "2026-09-27T05:00:00Z",
};

let order: Order;
let claims: Claim[];
let posts: { path: string; body: unknown }[];

function escrowOrder(state: string, milestones: PayoutMilestone[], extra: Partial<Order> = {}) {
  return {
    id: "ord_escrow",
    clientId: "c1",
    supplierId: "s1",
    riderId: "r1",
    state,
    title: "Tarpaulin banner",
    deadline: null,
    address: "Davao",
    deliveryFeeMinor: 0,
    totalMinor: 0,
    paymentMethod: null,
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-09-25T10:00:00Z",
    updatedAt: "2026-09-25T10:00:00Z",
    timeline: [
      {
        at: "2026-09-25T11:00:00Z",
        state: "production",
        by: "user_supplier",
        note: "Proof of Fulfilment attached for start of production",
        fileId: "file_start",
        milestoneCode: "production_started",
      },
    ],
    payoutPlanVersion: 2,
    payoutMilestones: milestones,
    supplierPayoutAccount: null,
    ...extra,
  } as unknown as Order;
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  claims = [];
  posts = [];
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (init?.method === "POST" && path.endsWith("/release")) {
        const code = path.split("/").at(-2)!;
        posts.push({ path, body: JSON.parse(String(init.body)) });
        const milestones = order.payoutMilestones!.map((m) =>
          m.code === code ? { ...m, ...released(m.pofFileIds[0]) } : m,
        );
        order = { ...order, payoutMilestones: milestones };
        return json({ order, milestone: milestones.find((m) => m.code === code) });
      }
      if (path.endsWith("/orders/ord_escrow")) return json({ order });
      if (path.endsWith("/claims")) return json({ claims });
      return json({ error: "not_found" }, 404);
    }),
  );
});
afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

describe("an escrow-plan payout on the Operations desk", () => {
  it("counts three shares and releases start of production on the shop's proof", async () => {
    order = escrowOrder("production", escrowStages({ production_started: proofOnFile("file_start") }));
    render(<OpsPayoutReviewPage />);

    expect(
      await screen.findByRole("heading", { name: "Three shares of what the shop earns" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Four shares|four parts/i)).toBeNull();
    expect(
      screen.getByText("Start of production ready to release, ₱400.00."),
    ).toBeInTheDocument();
    expect(screen.getByText("Start of production")).toBeInTheDocument();
    expect(screen.getByText("Issue window closed")).toBeInTheDocument();
    // No "last share" action before the job is even delivered.
    expect(screen.queryByText("Everything looks good")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Release ₱400.00" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/^Start of production on Tarpaulin banner\./)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Release payout" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].path).toMatch(/\/milestones\/production_started\/release$/);
    expect(posts[0].body).toEqual({ note: "Proof of Fulfilment reviewed" });
  });

  it("releases delivered on the rider's evidence, and explains the window share is not yet due", async () => {
    order = escrowOrder(
      "issue_window_open",
      escrowStages({
        production_started: released("file_start"),
        delivered: proofOnFile("file_door"),
      }),
      { deliveryEvidence: DELIVERY },
    );
    render(<OpsPayoutReviewPage />);

    expect(await screen.findByText("Delivered ready to release, ₱350.00.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Release ₱350.00" })).toBeEnabled();
    expect(screen.queryByText("Everything looks good")).toBeNull();

    // Open the last share: it names what it waits on, and has no file to ask for.
    fireEvent.click(screen.getByRole("button", { name: /Issue window closed/ }));
    expect(
      await screen.findByText(/client can still report a problem/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nothing to file for this share/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Release ₱250.00" })).toBeDisabled();
  });

  it("gives one clear action for the last 25% once the window has closed (gridgo-web#58)", async () => {
    order = escrowOrder(
      "completed",
      escrowStages({
        production_started: released("file_start"),
        delivered: released("file_door"),
      }),
      { deliveryEvidence: DELIVERY },
    );
    render(<OpsPayoutReviewPage />);

    const group = await screen.findByRole("group", { name: "Everything looks good" });
    expect(within(group).getByText(/₱250\.00/)).toBeInTheDocument();
    const action = within(group).getByRole("button", { name: "Release the last 25%" });
    // One action, not two: the row points at it rather than repeating it.
    expect(screen.queryByRole("button", { name: "Release ₱250.00" })).toBeNull();
    expect(screen.getByText(/Release it with the action above/)).toBeInTheDocument();

    fireEvent.click(action);
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(/The complaint window has closed with no claim open\./),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Release payout" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].path).toMatch(/\/milestones\/issue_window\/release$/);
    expect(posts[0].body).toEqual({ note: "Complaint window closed with no claim open" });
    expect(await screen.findByText(/₱250\.00 released to the supplier/)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Everything looks good" })).toBeNull();
  });

  it("keeps the last share closed while a claim holds the payout", async () => {
    order = escrowOrder(
      "completed",
      escrowStages({
        production_started: released("file_start"),
        delivered: released("file_door"),
      }),
      { deliveryEvidence: DELIVERY },
    );
    claims = [
      {
        id: "clm_1",
        orderId: "ord_escrow",
        raisedBy: "c1",
        reason: "Banner torn",
        status: "payout_held",
        holdReason: "Client reported a tear",
        releaseReason: null,
        heldAt: null,
        heldBy: null,
        releasedAt: null,
        releasedBy: null,
        createdAt: "2026-09-27T10:00:00Z",
        updatedAt: "2026-09-27T10:00:00Z",
        issueId: null,
        timeline: [],
      } as Claim,
    ];
    render(<OpsPayoutReviewPage />);

    expect(await screen.findByText("A claim is holding this payout")).toBeInTheDocument();
    expect(screen.queryByText("Everything looks good")).toBeNull();
    expect(screen.queryByRole("button", { name: /Release the last/ })).toBeNull();
  });
});
