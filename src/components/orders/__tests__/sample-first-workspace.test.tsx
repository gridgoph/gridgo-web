// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "ord_batch" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/components/orders/EvidencePreview", () => ({
  EvidencePlate: ({ label }: { label: string }) => <p>{label}</p>,
  EvidenceStrip: () => null,
}));
vi.mock("@/components/orders/ReceiptReferenceOcr", () => ({
  ReceiptReferenceOcr: () => null,
}));

const base: Order = {
  id: "ord_batch",
  clientId: "client1",
  supplierId: "shop1",
  riderId: null,
  state: "in_production",
  title: "Flyers A5",
  quantity: 500,
  size: "A5",
  material: "Paper",
  deadline: null,
  address: "Davao",
  supplierPriceMinor: 100000,
  supplierSubtotalMinor: 100000,
  serviceFeeRateBps: 1000,
  serviceFeeMinor: 10000,
  subtotalMinor: 110000,
  totalMinor: 112500,
  deliveryFeeMinor: 2500,
  paymentMethod: "qr_manual",
  paymentStatus: "paid",
  promisedDate: null,
  artworkName: null,
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
  timeline: [],
};

let order: Order;
beforeEach(() => {
  vi.stubGlobal("React", React);
  order = base;
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ order }), {
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
});
afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

it("tags a batch order, links its sample and shows the approval it is held to", async () => {
  order = {
    ...base,
    orderTags: ["batch_from_sample"],
    sampleOrderId: "ord_sample",
    sampleBatchDraftId: "sbd_1",
    sampleBatchPricing: { pricing: "held", heldUntil: "2026-11-15T02:00:00Z", heldPricingCapturedAt: null },
    sampleDecision: {
      draftId: "sbd_1",
      decision: "approved",
      method: "tick",
      at: "2026-11-01T02:00:00Z",
      samplePhotoFileId: "file_photo",
      note: "",
    },
  };
  render(<OrderWorkspace queueHref="/admin/orders" />);
  const row = await screen.findByRole("button", {
    name: /Batch from sample\s*Held to the sample the client approved/,
  });
  // The header chip, beside the row.
  expect(screen.getAllByText("Batch from sample").length).toBeGreaterThanOrEqual(2);
  fireEvent.click(row);
  expect(await screen.findByRole("link", { name: "Open the sample order" })).toHaveAttribute(
    "href",
    "/admin/orders/ord_sample",
  );
  expect(screen.getByRole("link", { name: "See the held batch price" })).toHaveAttribute(
    "href",
    "/admin/sample-batches/sbd_1",
  );
  expect(screen.getByText("Client's photo of the sample")).toBeInTheDocument();
});

it("leaves an ordinary order without a Sample row, and tags a test order on its own", async () => {
  order = { ...base, reviewData: true };
  render(<OrderWorkspace queueHref="/ops/orders" />);
  expect(await screen.findByText("Test")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Sample/ })).toBeNull();
  expect(screen.queryByText("Batch from sample")).toBeNull();
});
