// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ArtworkGuidanceRecord } from "@/components/orders/ArtworkGuidanceRecord";
import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import type { Order, ProductionItem } from "@/lib/api/types";
import { tarpaulinRecord } from "@/test/artwork-guidance";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "ag-order" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));

const at = "2026-10-15T07:30:00.000Z";

function item(overrides: Partial<ProductionItem> = {}): ProductionItem {
  return {
    id: "line-1",
    itemName: "Tarpaulin 3 x 6 ft",
    quantity: 1,
    measurement: null,
    artworkFileId: "file_tarp",
    artworkGuidance: tarpaulinRecord(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

it("shows the target, the ordered size, each file's figures and who accepted what", () => {
  render(<ArtworkGuidanceRecord order={{ productionItems: [item()] }} audience="staff" />);
  const record = screen.getByTestId("artwork-guidance-record");
  expect(within(record).getByText("Target: 100 DPI at the ordered size, expects CMYK")).toBeInTheDocument();
  expect(within(record).getByText("Ordered size 3 × 6 ft (914 × 1829 mm)")).toBeInTheDocument();
  expect(within(record).getByText("1200 × 2400 px")).toBeInTheDocument();
  expect(within(record).getByRole("img", { name: "33 DPI against a target of 100 DPI" })).toBeInTheDocument();
  expect(within(record).getByText("RGB")).toBeInTheDocument();
  const low = within(record).getByTestId("artwork-warning-low_resolution");
  expect(low).toHaveTextContent("Prints at 33 DPI at the ordered size; the target is 100 DPI.");
  expect(low).toHaveTextContent(/Client accepted on Oct 15, 2026/);
  const colour = within(record).getByTestId("artwork-warning-color_mode");
  expect(colour).toHaveTextContent("The file is RGB; this product type expects CMYK.");
  expect(colour).toHaveTextContent("Not accepted by the client");
  expect(within(record).getByText("2 artwork warnings, 1 accepted by the client")).toBeInTheDocument();
  expect(within(record).getByText(/not the shop's fault/)).toBeInTheDocument();
});

it("says why a file was not judged instead of inventing a figure", () => {
  const pdf = tarpaulinRecord({
    orderedSize: null,
    files: [
      { fileId: "a", colorMode: null, pixelWidth: null, pixelHeight: null, effectiveDpi: null, warnings: [] },
      { fileId: "b", colorMode: "cmyk", pixelWidth: 3000, pixelHeight: 6000, effectiveDpi: null, warnings: [] },
    ],
    openWarningCount: 0,
  });
  render(
    <ArtworkGuidanceRecord
      order={{ productionItems: [item({ artworkFileId: "a", artworkGuidance: pdf })] }}
      audience="shop"
    />,
  );
  expect(screen.getByText("No size on the order, so resolution was not judged")).toBeInTheDocument();
  expect(screen.getByText("Not judged: the file has no pixel size (a PDF or document)")).toBeInTheDocument();
  expect(screen.getByText("Not judged: no ordered size")).toBeInTheDocument();
  expect(screen.getByText("Not stated in the file")).toBeInTheDocument();
  expect(screen.getByText("File 1, main file")).toBeInTheDocument();
  expect(screen.getAllByText("No warning on this file")).toHaveLength(2);
  expect(screen.getByText("Meets its targets")).toBeInTheDocument();
  expect(screen.queryByText(/not the shop's fault/)).toBeNull();
});

it("renders nothing for an order placed before artwork guidance", () => {
  const { container } = render(
    <ArtworkGuidanceRecord order={{ productionItems: [item({ artworkGuidance: null })] }} audience="staff" />,
  );
  expect(container).toBeEmptyDOMElement();
});

describe("on the order workspace", () => {
  let order: Order;
  beforeEach(() => {
    order = {
      id: "ag-order",
      clientId: "client",
      supplierId: "shop",
      riderId: null,
      title: "Store opening tarpaulin",
      state: "needs_qa",
      quantity: 1,
      deadline: null,
      address: "Delivery address on file",
      totalMinor: 90000,
      deliveryFeeMinor: 0,
      paymentMethod: "qr_manual",
      paymentStatus: "paid",
      promisedDate: null,
      artworkName: null,
      artworkFileIds: ["file_tarp"],
      productionItems: [item()],
      createdAt: at,
      updatedAt: at,
      timeline: [],
      payoutMilestones: [],
      fileCheck: { status: "pending", requestedAt: at, waitingSeconds: 60 },
    } as unknown as Order;
    setTokenProvider(() => "fixture-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(String(input), "http://gridgo.test").pathname;
        const body = (value: unknown, status = 200) =>
          new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
        if (path.startsWith("/files/")) return body({ error: "not_found" }, 404);
        if (path.startsWith("/users/")) return body({ user: { id: "fixture", name: "Fixture account" } });
        if (path === "/audit" || path.endsWith("/audit")) return body({ audit: [] });
        if (path === "/escalations") return body({ escalations: [] });
        if (path.endsWith("/refund-requests")) return body({ refundRequests: [] });
        return body({ order });
      }),
    );
  });
  afterEach(() => {
    setTokenProvider(() => null);
    vi.unstubAllGlobals();
    vi.stubGlobal("React", React);
  });

  async function openQuality() {
    render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);
    const button = await screen.findByRole("button", { name: /^Quality check/ });
    if (button.getAttribute("aria-expanded") !== "true") fireEvent.click(button);
    return within(button.closest("section")!);
  }

  it("puts the record in the quality check before the file is passed, once", async () => {
    const qa = await openQuality();
    expect(qa.getByTestId("artwork-guidance-record")).toHaveTextContent("Not accepted by the client");
    expect(screen.getAllByTestId("artwork-guidance-record")).toHaveLength(1);
  });

  it("keeps the record beside the artwork after the check, for a later claim", async () => {
    order.state = "production";
    order.fileCheck = { status: "passed", requestedAt: at, reviewedAt: at, waitingSeconds: 0 } as Order["fileCheck"];
    render(<OrderWorkspace queueHref="/admin/orders" payoutsHref="/admin/payouts" />);
    const records = await screen.findAllByTestId("artwork-guidance-record");
    expect(records).toHaveLength(1);
    expect(records[0]).toHaveTextContent(/Client accepted on/);
  });
});
