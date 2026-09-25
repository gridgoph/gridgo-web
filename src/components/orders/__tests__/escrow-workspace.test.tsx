// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { escrowStages, legacyStages, proofOnFile, released } from "@/test/payout-plans";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "order1" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/components/orders/EvidencePreview", () => ({
  EvidencePlate: ({ fileId }: { fileId: string }) => <div>Proof {fileId}</div>,
  EvidenceStrip: () => null,
}));

const DELIVERY = {
  fileId: "file_door",
  evidenceType: "photo",
  riderId: "r1",
  recordedAt: "2026-09-27T05:00:00Z",
};

let order: Order;

function base(extra: Partial<Order>): Order {
  return {
    id: "order1",
    clientId: "client1",
    supplierId: "shop1",
    riderId: "r1",
    state: "completed",
    title: "Flyers",
    quantity: 2,
    deadline: null,
    address: "Davao",
    totalMinor: 55020,
    deliveryFeeMinor: 0,
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-09-25T10:00:00Z",
    updatedAt: "2026-09-25T10:00:00Z",
    timeline: [],
    supplierPayoutAccount: null,
    deliveryEvidence: DELIVERY,
    ...extra,
  } as unknown as Order;
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          headers: { "Content-Type": "application/json" },
        });
      if (path.endsWith("/claims")) return json({ claims: [] });
      return json({ order });
    }),
  );
});
afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

describe("the order workspace on an escrow-plan order", () => {
  it("offers one clear release of the last share once the window has closed", async () => {
    order = base({
      payoutPlanVersion: 2,
      payoutMilestones: escrowStages({
        production_started: released("file_start"),
        delivered: released("file_door"),
      }),
    });
    render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);

    const group = await screen.findByRole("group", { name: "Everything looks good" });
    fireEvent.click(within(group).getByRole("button", { name: "Release the last 25%" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Issue window closed on Flyers\./)).toBeInTheDocument();
    expect(
      within(dialog).getByPlaceholderText("e.g. Window closed, the client raised nothing"),
    ).toBeInTheDocument();
  });

  it("shows the shop's start-of-production photo on the production step", async () => {
    order = base({
      state: "production",
      deliveryEvidence: null,
      payoutPlanVersion: 2,
      payoutMilestones: escrowStages({ production_started: proofOnFile("file_start") }),
    });
    render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);

    expect(await screen.findByText("Production started")).toBeInTheDocument();
    expect(screen.getByText("Proof file_start")).toBeInTheDocument();
    expect(screen.queryByText("Everything looks good")).toBeNull();
  });

  it("never offers the one-press release on a legacy order", async () => {
    order = base({
      payoutPlanVersion: 1,
      payoutMilestones: legacyStages({
        printing: released("a"),
        packaging_qc: released("b"),
        delivered: released("c"),
        retention: proofOnFile("c"),
      }),
    });
    render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);

    expect(await screen.findByRole("button", { name: "Release ₱100.00" })).toBeEnabled();
    expect(screen.queryByText("Everything looks good")).toBeNull();
  });
});
