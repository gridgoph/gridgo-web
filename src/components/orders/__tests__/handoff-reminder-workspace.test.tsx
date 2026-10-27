// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "order1" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
// The strip is the private-attachment plate; here it only names what it shows.
vi.mock("@/components/orders/EvidencePreview", () => ({
  EvidencePlate: ({ fileId }: { fileId: string }) => <div>Proof {fileId}</div>,
  EvidenceStrip: ({ items }: { items: { fileId: string; label: string }[] }) => (
    <ul>
      {items.map((item) => (
        <li key={item.fileId}>
          {item.label}: {item.fileId}
        </li>
      ))}
    </ul>
  ),
}));

let order: Order;

function base(extra: Record<string, unknown>): Order {
  return {
    id: "order1",
    clientId: "client1",
    supplierId: "shop1",
    riderId: "r1",
    state: "issue_window_open",
    fulfillmentMode: "delivery",
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
    createdAt: "2026-10-26T10:00:00Z",
    updatedAt: "2026-10-27T10:00:00Z",
    timeline: [],
    supplierPayoutAccount: null,
    deliveryEvidence: {
      fileId: "file_door",
      evidenceType: "photo",
      riderId: "r1",
      recordedAt: "2026-10-27T05:00:00Z",
    },
    ...extra,
  } as unknown as Order;
}

const reminder = (extra: Record<string, unknown> = {}) => ({
  orderId: "order1",
  clientId: "client1",
  riderId: "r1",
  deliveredAt: "2026-10-27T05:00:00Z",
  protocolVersion: 1,
  remindedClient: true,
  clientAgreedToPhoto: true,
  packagePhotoFileId: "file_package",
  ...extra,
});

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

describe("the rider's handoff reminder on the order workspace", () => {
  it("shows the package photo beside the delivery proof, through the evidence strip", async () => {
    order = base({
      deliveryReminder: reminder(),
      deliveryPackagePhotoFileIds: ["file_package"],
    });
    render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);

    expect(await screen.findByText("Delivery photo: file_door")).toBeInTheDocument();
    expect(screen.getByText("Package photo: file_package")).toBeInTheDocument();
    expect(screen.getByText("Rider reminded the client")).toBeInTheDocument();
    expect(screen.getByText("Client agreed to a package photo.")).toBeInTheDocument();
  });

  it("says when the client agreed but no photo was taken", async () => {
    order = base({ deliveryReminder: reminder({ packagePhotoFileId: null }) });
    render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);

    expect(await screen.findByText("Rider reminded the client")).toBeInTheDocument();
    expect(screen.getByText("Client agreed to a photo; none was taken.")).toBeInTheDocument();
    expect(screen.queryByText(/Package photo:/)).toBeNull();
  });

  it("reads an older rider app as no reminder step, never as a skipped reminder", async () => {
    order = base({
      deliveryReminder: reminder({
        protocolVersion: 0,
        remindedClient: false,
        clientAgreedToPhoto: false,
        packagePhotoFileId: null,
      }),
    });
    render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);

    expect(
      await screen.findByText("Delivered from an older rider app, which has no reminder step."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Rider reminded the client")).toBeNull();
  });

  it("adds nothing to an order from an API without reminders", async () => {
    order = base({});
    render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);

    expect(await screen.findByText("Delivery photo: file_door")).toBeInTheDocument();
    expect(screen.queryByText(/reminded the client|older rider app|Package photo/)).toBeNull();
  });
});
