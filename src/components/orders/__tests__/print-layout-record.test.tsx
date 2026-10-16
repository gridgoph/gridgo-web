// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JobTicket } from "@/components/handover/FinishedReviewPanel";
import { OrderMeta } from "@/components/orders/OrderMeta";
import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { PrintLayoutRecord } from "@/components/orders/PrintLayoutRecord";
import { setTokenProvider } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { layoutCheck, layoutLine } from "@/test/print-layout";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "pl-order" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));

const at = "2026-10-16T02:00:00.000Z";

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "pl-order",
    clientId: "client",
    supplierId: "shop",
    riderId: null,
    title: "Floor plans",
    state: "production",
    quantity: 2,
    size: "A4",
    deadline: null,
    address: "Delivery address on file",
    totalMinor: 30000,
    deliveryFeeMinor: 0,
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    artworkFileIds: [],
    productionItems: [layoutLine()],
    createdAt: at,
    updatedAt: at,
    timeline: [],
    payoutMilestones: [],
    ...overrides,
  } as unknown as Order;
}

afterEach(() => {
  cleanup();
});

it("shows the layout, what to do at the press, the paper, the page and the cut-off", () => {
  render(<PrintLayoutRecord order={order()} />);
  const record = screen.getByTestId("print-layout-record");
  expect(within(record).getByText("Print layout")).toBeInTheDocument();
  expect(within(record).getByText("Actual size, centred")).toBeInTheDocument();
  expect(within(record).getByText("Print at 100%, centred on the paper.")).toBeInTheDocument();
  expect(within(record).getByText("A4, 210 × 297 mm")).toBeInTheDocument();
  expect(within(record).getByText("A3, 297 × 420 mm")).toBeInTheDocument();
  expect(within(record).getByTestId("print-layout-warning")).toHaveTextContent(
    "The client's A3 page is bigger than A4, so its edges past the paper are cut off.",
  );
  expect(within(record).getByText("A3 would have printed it whole.")).toBeInTheDocument();
});

it("names each line on an order with several, and skips lines without a layout", () => {
  render(
    <PrintLayoutRecord
      order={order({
        productionItems: [
          layoutLine({
            printLayout: "fit_to_paper",
            printLayoutCheck: layoutCheck({ layout: "fit_to_paper", cutOff: false, scaleChanges: true }),
          }),
          layoutLine({ id: "line_2", itemName: "Flyers", printLayout: null, printLayoutCheck: null }),
        ],
      })}
    />,
  );
  expect(screen.getByText("Print layout · Floor plans")).toBeInTheDocument();
  expect(screen.queryByText(/Flyers/)).toBeNull();
  expect(screen.getByTestId("print-layout-warning")).toHaveTextContent(
    "The drawing scale changes: the client's A3 page is scaled to fit A4 (about 71%).",
  );
});

it("renders nothing for an order without a layout", () => {
  const { container } = render(
    <PrintLayoutRecord order={order({ productionItems: [layoutLine({ printLayout: null })] })} />,
  );
  expect(container).toBeEmptyDOMElement();
});

it("is part of the shop's job spec", () => {
  render(<OrderMeta order={order()} showMoney={false} />);
  expect(screen.getByTestId("print-layout-record")).toHaveTextContent("Actual size, centred");
});

it("puts the layout and its outcome on the job ticket", () => {
  render(<JobTicket order={order()} />);
  const ticket = screen.getByRole("complementary", { name: "Job ticket" });
  expect(within(ticket).getByText("Layout: Actual size, centred, cut off on A4")).toBeInTheDocument();
});

describe("on the order workspace", () => {
  let current: Order;
  beforeEach(() => {
    current = order({
      state: "needs_qa",
      fileCheck: { status: "pending", requestedAt: at, waitingSeconds: 60 },
    } as Partial<Order>);
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
        return body({ order: current });
      }),
    );
  });
  afterEach(() => {
    setTokenProvider(() => null);
    vi.unstubAllGlobals();
    vi.stubGlobal("React", React);
  });

  it("shows the agreed layout once, in the order's spec, while the file is checked", async () => {
    render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);
    const button = await screen.findByRole("button", { name: /^Quality check/ });
    if (button.getAttribute("aria-expanded") !== "true") fireEvent.click(button);
    const records = screen.getAllByTestId("print-layout-record");
    expect(records).toHaveLength(1);
    expect(records[0].closest("aside")).toHaveAccessibleName("Order details");
    expect(records[0]).toHaveTextContent("Actual size, centred");
  });
});
