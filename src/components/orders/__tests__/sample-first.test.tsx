// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueueOrderCell, queueOrderFilterValue } from "@/components/orders/QueueOrderCell";
import {
  BatchStandard,
  SampleDecisionPanel,
  SampleTagChip,
  sampleRowSummary,
} from "@/components/orders/SampleFirst";
import { setTokenProvider } from "@/lib/api/client";
import type { Order, SampleDecision } from "@/lib/api/types";

vi.stubGlobal("React", React);

const approved: SampleDecision = {
  draftId: "sbd_1",
  decision: "approved",
  method: "tick",
  at: "2026-11-01T02:00:00.000Z",
  samplePhotoFileId: "file_photo",
  note: "Colour matches",
};

function order(patch: Partial<Order>): Order {
  return {
    id: "ord_x",
    clientId: "client_1",
    supplierId: "shop_1",
    riderId: null,
    state: "in_production",
    title: "Flyers A5",
    quantity: 500,
    ...patch,
  } as Order;
}

const sample = order({
  id: "ord_sample",
  quantity: 1,
  orderTags: ["sample"],
  sampleBatchDraftId: "sbd_1",
  batchOrderId: "ord_batch",
  sampleDecision: approved,
});
const batch = order({
  id: "ord_batch",
  orderTags: ["batch_from_sample"],
  sampleOrderId: "ord_sample",
  sampleBatchDraftId: "sbd_1",
  sampleBatchPricing: {
    pricing: "held",
    heldUntil: "2026-11-15T02:00:00.000Z",
    heldPricingCapturedAt: "2026-10-20T02:00:00.000Z",
  },
  sampleDecision: approved,
});

beforeEach(() => {
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      const json = (value: unknown) =>
        new Response(JSON.stringify(value), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      if (url.pathname.endsWith("/download-url")) return json({ url: "https://files.example/s.jpg" });
      return json({
        file: { id: "file_photo", originalFilename: "sample.jpg", detectedContentType: "image/jpeg", state: "ready" },
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.stubGlobal("React", React);
});

describe("tags", () => {
  it("tags a sample and a batch, and nothing else", () => {
    const { rerender } = render(<SampleTagChip order={sample} />);
    expect(screen.getByText("Sample")).toBeInTheDocument();
    rerender(<SampleTagChip order={batch} />);
    expect(screen.getByText("Batch from sample")).toBeInTheDocument();
    rerender(<SampleTagChip order={order({})} />);
    expect(screen.queryByText(/Sample/)).toBeNull();
  });

  it("shows the tag in the Orders queue and lets the filter box find it", () => {
    render(<QueueOrderCell order={batch} shopCounts={new Map()} />);
    expect(screen.getByText("Batch from sample")).toBeInTheDocument();
    expect(queueOrderFilterValue(batch, new Map())).toContain("Batch from sample");
    expect(queueOrderFilterValue(order({}), new Map())).not.toContain("Sample");
  });
});

describe("the sample row and its links", () => {
  it("links a sample to its batch and its held price", () => {
    render(<SampleDecisionPanel order={sample} tree="ops" />);
    expect(screen.getByRole("link", { name: "Open the batch order" })).toHaveAttribute(
      "href",
      "/ops/orders/ord_batch",
    );
    expect(screen.getByRole("link", { name: "See the held batch price" })).toHaveAttribute(
      "href",
      "/ops/sample-batches/sbd_1",
    );
    expect(sampleRowSummary(sample)).toBe("Approved with a tick");
  });

  it("links a batch back to its sample, inside the Super Admin tree", () => {
    render(<SampleDecisionPanel order={batch} tree="admin" />);
    expect(screen.getByRole("link", { name: "Open the sample order" })).toHaveAttribute(
      "href",
      "/admin/orders/ord_sample",
    );
    expect(screen.getByText(/Ordered at the held price/)).toBeInTheDocument();
    expect(sampleRowSummary(batch)).toBe("Held to the sample the client approved");
  });

  it("waits for the client before a decision", () => {
    const waiting = order({ orderTags: ["sample"], sampleBatchDraftId: "sbd_1" });
    render(<SampleDecisionPanel order={waiting} tree="ops" />);
    expect(screen.getByText(/approves or rejects the sample in the GRIDGO app/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open the/ })).toBeNull();
    expect(sampleRowSummary(waiting)).toBe("Waiting for the client's decision");
  });
});

describe("the decision as the batch standard", () => {
  it("shows the tick, date, note and photo in a dispute view", async () => {
    render(<BatchStandard order={batch} tree="ops" />);
    const block = screen.getByRole("region", { name: "The sample this batch is held to" });
    expect(block).toHaveTextContent("Approved with a tick");
    expect(block).toHaveTextContent("Colour matches");
    expect(block).toHaveTextContent(/Judge the batch against it/);
    expect(
      await within(block).findByRole("button", { name: /Open Client's photo of the sample/ }),
    ).toBeInTheDocument();
    expect(within(block).getByRole("link", { name: "Open the sample order" })).toHaveAttribute(
      "href",
      "/ops/orders/ord_sample",
    );
  });

  it("stays out of a sample order and an untagged order", () => {
    const { container, rerender } = render(<BatchStandard order={sample} tree="ops" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<BatchStandard order={order({ sampleDecision: approved })} tree="ops" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a rejection's reason without a photo", () => {
    render(
      <SampleDecisionPanel
        order={{
          ...sample,
          batchOrderId: null,
          sampleDecision: {
            draftId: "sbd_1",
            decision: "rejected",
            at: "2026-11-01T02:00:00.000Z",
            reason: "Too dark",
            next: "resample",
          },
        }}
        tree="ops"
      />,
    );
    expect(screen.getByText("Client will order another sample")).toBeInTheDocument();
    expect(screen.getByText("Too dark")).toBeInTheDocument();
    expect(screen.queryByText("Client's photo of the sample")).toBeNull();
  });
});
