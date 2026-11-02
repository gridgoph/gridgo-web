// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SampleBatchDetail } from "@/components/sample-batches/SampleBatchDetail";
import { SampleBatchQueue } from "@/components/sample-batches/SampleBatchQueue";
import { setTokenProvider } from "@/lib/api/client";
import type { SampleBatch } from "@/lib/api/types";

vi.stubGlobal("React", React);
const replace = vi.fn();
let search = new URLSearchParams();
let routeId = "sbd_open";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => search,
  useParams: () => ({ id: routeId }),
}));

const DAY = 86_400_000;

function batch(id: string, patch: Partial<SampleBatch> = {}): SampleBatch {
  return {
    id,
    status: "awaiting_sample",
    tags: ["sample_batch"],
    catalogItemId: "ci_1",
    itemName: "Flyers A5",
    sampleOrderId: `ord_s_${id}`,
    sampleOrderState: "in_production",
    batchOrderId: null,
    previousDraftId: null,
    replacedByDraftId: null,
    batch: { quantity: 500, specialInstructions: "Trim to bleed" },
    holdDays: 14,
    sampleDeliveredAt: null,
    heldUntil: null,
    holdActive: false,
    holdExpired: false,
    heldPrice: { quantity: 500, clientItemMinor: 230000, lineSubtotalMinor: 200000, unitRateMinor: 400, volumeTierApplied: { minQuantity: 500, unitPriceMinor: 400 } },
    currentPrice: { quantity: 500, clientItemMinor: 287500, lineSubtotalMinor: 250000, unitRateMinor: 500, volumeTierApplied: null },
    canOrderAtHeldPrice: false,
    heldPriceBlocker: "sample_batch_not_approved",
    canOrderAtCurrentPrice: false,
    approval: null,
    rejection: null,
    clientId: "client_1",
    supplierId: "shop_1",
    heldPricing: {
      version: 1,
      capturedAt: "2026-10-20T02:00:00.000Z",
      catalogItemId: "ci_1",
      catalogItemVersion: 4,
      pricingUnit: "per_unit",
      packageQty: null,
      basePriceMinor: 500,
      minimumOrderQuantity: 100,
      minimumMeasurement: { width: null, height: null, length: null },
      options: [
        {
          optionId: "opt_gloss",
          optionGroupId: "grp_paper",
          groupName: "Paper",
          label: "Glossy",
          priceModifierMinor: 200,
          priceMultiplierBps: null,
        },
      ],
      volumeTiers: [
        { minQuantity: 500, unitPriceMinor: 400 },
        { minQuantity: 1000, unitPriceMinor: 350 },
      ],
      speedTier: null,
    },
    version: 2,
    createdAt: "2026-10-20T02:00:00.000Z",
    updatedAt: "2026-10-20T02:00:00.000Z",
    ...patch,
  };
}

const now = Date.now();
const rows = [
  batch("sbd_waiting"),
  batch("sbd_open", {
    status: "approved",
    sampleOrderState: "issue_window_open",
    sampleDeliveredAt: new Date(now - 4 * DAY).toISOString(),
    heldUntil: new Date(now + 10 * DAY + 3_600_000).toISOString(),
    holdActive: true,
    canOrderAtHeldPrice: true,
    heldPriceBlocker: null,
    canOrderAtCurrentPrice: true,
    approval: {
      version: 1,
      method: "tick",
      accepted: true,
      samplePhotoFileId: "file_photo",
      note: "Colour matches",
      at: new Date(now - 2 * DAY).toISOString(),
      by: "client_1",
    },
  }),
  batch("sbd_ordered", { status: "ordered", batchOrderId: "ord_batch" }),
  batch("sbd_rejected", {
    status: "rejected",
    rejection: { version: 1, reason: "Too dark", next: "resample", at: "2026-10-25T00:00:00.000Z", by: "client_1" },
    replacedByDraftId: "sbd_waiting",
  }),
];

const calls: string[] = [];

beforeEach(() => {
  search = new URLSearchParams();
  routeId = "sbd_open";
  replace.mockReset();
  calls.length = 0;
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      calls.push(`${url.pathname}${url.search}`);
      const json = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (url.pathname.endsWith("/settings")) {
        return json({ version: 2, settings: { sampleBatchHoldDays: 14 } });
      }
      if (url.pathname.endsWith("/ops/sample-batches")) return json({ sampleBatches: rows });
      const one = /\/ops\/sample-batches\/([^/]+)$/.exec(url.pathname);
      if (one) {
        const found = rows.find((row) => row.id === decodeURIComponent(one[1]));
        if (!found) return json({ error: "sample_batch_not_found" }, 404);
        const quantity = url.searchParams.get("quantity");
        return json({
          sampleBatch: quantity
            ? { ...found, heldPrice: { quantity: Number(quantity), clientItemMinor: 402500 } }
            : found,
        });
      }
      if (url.pathname.endsWith("/users/client_1")) return json({ user: { id: "client_1", name: "Dana Client" } });
      if (url.pathname.endsWith("/users/shop_1")) {
        return json({ user: { id: "shop_1", name: "Owner", supplierName: "Print Hub" } });
      }
      if (/\/files\/file_photo/.test(url.pathname)) {
        return url.pathname.endsWith("/download-url")
          ? json({ url: "https://files.example/photo.jpg" })
          : json({ file: { id: "file_photo", originalFilename: "sample.jpg", detectedContentType: "image/jpeg", state: "ready" } });
      }
      return json({ error: "not_found" }, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.stubGlobal("React", React);
});

describe("Sample batches list", () => {
  it("opens on open drafts, approved holds first, with counts, names and the hold clock", async () => {
    render(<SampleBatchQueue tree="ops" />);
    const list = await screen.findByRole("list", { name: "Sample batches" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Sample approved");
    expect(items[0]).toHaveTextContent("10 days left");
    expect(items[1]).toHaveTextContent("Waiting for the sample");
    expect(items[1]).toHaveTextContent("Not started");
    await waitFor(() => expect(items[0]).toHaveTextContent("Dana Client · Print Hub"));
    expect(within(items[0]).getByRole("link")).toHaveAttribute(
      "href",
      "/ops/sample-batches/sbd_open",
    );
    expect(screen.getByRole("tab", { name: "Open, 2" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Rejected or cancelled, 1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "All, 4" })).toBeInTheDocument();
    // Operations reads the setting; it cannot change it.
    expect(screen.getByTestId("sample-hold-line")).toHaveTextContent(
      "The batch price is held for 14 days after delivery. Super Admin sets this.",
    );
  });

  it("filters from the URL and offers Super Admin the setting", async () => {
    search = new URLSearchParams("status=ordered");
    render(<SampleBatchQueue tree="admin" />);
    const list = await screen.findByRole("list", { name: "Sample batches" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByRole("link")).toHaveAttribute(
      "href",
      "/admin/sample-batches/sbd_ordered",
    );
    expect(
      screen.getByRole("link", { name: "Change it in Operational settings" }),
    ).toHaveAttribute("href", "/admin/settings");
  });
});

describe("One sample batch", () => {
  it("shows the hold, both prices, the full held price list, the decision and both order links", async () => {
    render(<SampleBatchDetail tree="ops" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Flyers A5" })).toBeInTheDocument();

    const orders = screen.getByRole("region", { name: "Orders" });
    expect(within(orders).getByRole("link", { name: "Open the sample order" })).toHaveAttribute(
      "href",
      "/ops/orders/ord_s_sbd_open",
    );
    expect(orders).toHaveTextContent("Not ordered yet");

    const hold = screen.getByRole("region", { name: "Price hold" });
    expect(hold).toHaveTextContent("10 days left");
    expect(hold).toHaveTextContent("14 days");

    const prices = screen.getByRole("region", { name: "Batch price" });
    expect(prices).toHaveTextContent("₱2,300.00 for 500");
    expect(prices).toHaveTextContent("₱2,875.00 for 500");
    expect(prices).toHaveTextContent("bulk price from 500");

    const list = screen.getByRole("region", { name: "Held price list" });
    expect(list).toHaveTextContent("₱5.00 per piece");
    expect(list).toHaveTextContent("Paper: Glossy");
    expect(list).toHaveTextContent("+₱2.00");
    expect(list).toHaveTextContent("From 1,000");
    expect(list).toHaveTextContent("₱3.50 each");

    const decision = screen.getByRole("region", { name: "Client's decision" });
    expect(decision).toHaveTextContent("Approved with a tick");
    expect(decision).toHaveTextContent("Colour matches");
    expect(
      await within(decision).findByRole("button", { name: /Open Client's photo of the sample/ }),
    ).toBeInTheDocument();
  });

  it("previews both prices for another quantity", async () => {
    render(<SampleBatchDetail tree="admin" />);
    const field = await screen.findByLabelText("Try another quantity");
    fireEvent.change(field, { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Show prices" }));
    await waitFor(() => expect(calls).toContain("/ops/sample-batches/sbd_open?quantity=1000"));
    expect(await screen.findByText("₱4,025.00 for 1,000")).toBeInTheDocument();
  });

  it("links an ordered batch and a resample chain, and shows a rejection", async () => {
    routeId = "sbd_rejected";
    render(<SampleBatchDetail tree="admin" />);
    const decision = await screen.findByRole("region", { name: "Client's decision" });
    expect(decision).toHaveTextContent("Client will order another sample");
    expect(decision).toHaveTextContent("Reason: Too dark");
    expect(
      screen.getByRole("link", { name: "The new sample the client ordered" }),
    ).toHaveAttribute("href", "/admin/sample-batches/sbd_waiting");

    cleanup();
    routeId = "sbd_ordered";
    render(<SampleBatchDetail tree="admin" />);
    expect(await screen.findByRole("link", { name: "Open the batch order" })).toHaveAttribute(
      "href",
      "/admin/orders/ord_batch",
    );
  });

  it("says plainly when the draft no longer exists", async () => {
    routeId = "sbd_gone";
    render(<SampleBatchDetail tree="ops" />);
    expect(await screen.findByText("This sample batch no longer exists.")).toBeInTheDocument();
  });
});
