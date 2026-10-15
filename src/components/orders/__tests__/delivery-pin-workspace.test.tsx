// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import type { DeliveryPin, DeliveryPinChange, Order, RefundRequest } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "order1" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/components/orders/EvidencePreview", () => ({
  EvidencePlate: ({ fileId }: { fileId: string }) => <div>Proof {fileId}</div>,
  EvidenceStrip: () => null,
}));
vi.mock("@/components/orders/ReceiptReferenceOcr", () => ({
  ReceiptReferenceOcr: () => null,
}));
// Leaflet loads from a CDN; the list under the map carries every point.
vi.mock("@/components/maps/leaflet", async (original) => ({
  ...(await original<typeof import("@/components/maps/leaflet")>()),
  ensureLeaflet: () => new Promise(() => {}),
}));

class FakePointerEvent extends MouseEvent {
  constructor(type: string, init?: PointerEventInit) {
    super(type, init);
  }
}

const SHOP = { lat: 7.07, lng: 125.61, label: "Shop, Bajada" };
const ORIGINAL = { lat: 7.1, lng: 125.62, label: "Lanang, blue gate" };
const MOVED = { lat: 7.13, lng: 125.6, label: "Main entrance, Buhangin" };

function pin(patch: Partial<DeliveryPin> = {}): DeliveryPin {
  return {
    version: 4,
    status: "confirmed",
    requestedAt: "2026-10-15T06:00:00.000Z",
    confirmedAt: "2026-10-15T06:05:00.000Z",
    point: ORIGINAL,
    zone: "nearby",
    notes: "Blue gate beside the pharmacy",
    receiverName: "Alex",
    changeUsed: false,
    canConfirm: true,
    canChange: false,
    original: ORIGINAL,
    change: null,
    ...patch,
  };
}

const awaitingCheck: DeliveryPinChange = {
  id: "pin_1",
  status: "pending_confirmation",
  point: MOVED,
  zone: "away",
  distanceMeters: 7_400,
  deliveryFeeMinor: 11_000,
  feeDifferenceMinor: 6_000,
  createdAt: "2026-10-15T06:10:00.000Z",
  riderDifferenceMinor: 5_100,
  platformDifferenceMinor: 900,
  payment: {
    proofFileId: "file_pin_proof",
    reference: "WALLET-123",
    submittedAt: "2026-10-15T06:20:00.000Z",
  },
};

function base(extra: Partial<Order> = {}): Order {
  return {
    id: "order1",
    clientId: "client1",
    supplierId: "shop1",
    riderId: null,
    state: "ready_for_dispatch",
    title: "Tarpaulin 3x6",
    deadline: null,
    address: ORIGINAL.label,
    pickup: SHOP,
    dropoff: ORIGINAL,
    totalMinor: 115_000,
    deliveryFeeMinor: 5_000,
    riderCommissionBps: 8_500,
    riderPayoutMinor: 4_250,
    platformDeliveryShareMinor: 750,
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-10-14T10:00:00Z",
    updatedAt: "2026-10-15T06:20:00Z",
    timeline: [],
    downpaymentPercent: 100,
    deliveryPin: pin(),
    effectiveDeliveryFeeMinor: 5_000,
    effectiveTotalMinor: 115_000,
    ...extra,
  } as unknown as Order;
}

let order: Order;
let refunds: RefundRequest[];
let posted: { path: string; body: Record<string, unknown>; key: string | null }[];
let reply409: string | null;

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("PointerEvent", FakePointerEvent);
  setTokenProvider(() => "fixture-token");
  posted = [];
  refunds = [];
  reply409 = null;
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
          body: JSON.parse(String(init.body)),
          key: headers["Idempotency-Key"] ?? null,
        });
        if (reply409) return reply({ error: reply409 }, 409);
        const current = order.deliveryPin!;
        const next: DeliveryPin = path.endsWith("/confirm")
          ? {
              ...current,
              version: current.version + 1,
              point: MOVED,
              changeUsed: true,
              confirmedAt: "2026-10-15T06:30:00.000Z",
              change: {
                ...current.change!,
                status: "applied",
                appliedAt: "2026-10-15T06:30:00.000Z",
                payment: {
                  ...current.change!.payment!,
                  amountMinor: 6_000,
                  confirmedAt: "2026-10-15T06:30:00.000Z",
                  confirmedBy: "ops_1",
                },
              },
            }
          : {
              ...current,
              version: current.version + 1,
              change: {
                ...current.change!,
                status: "pending_payment",
                rejectionReason: String(JSON.parse(String(init.body)).reason),
              },
            };
        order = { ...order, deliveryPin: next, address: next.point.label };
        return reply({ deliveryPin: next });
      }
      if (path === "/orders/order1") return reply({ order });
      if (path === "/orders/order1/refund-requests") return reply({ refunds });
      if (path === "/escalations") return reply({ escalations: [] });
      if (path === "/users/ops_1") return reply({ user: { id: "ops_1", name: "Rina Ops" } });
      return reply({ error: "not_found" }, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

async function openPinRow() {
  const user = userEvent.setup();
  render(<OrderWorkspace queueHref="/ops/orders" />);
  const trigger = await screen.findByRole("button", { name: /Delivery pin/ });
  if (trigger.getAttribute("aria-expanded") !== "true") await user.click(trigger);
  return user;
}

describe("the order workspace's delivery pin row", { timeout: 20_000 }, () => {
  it("shows who confirmed, when, the receiver, the notes and the pin", async () => {
    order = base();
    await openPinRow();
    const row = screen.getByRole("region", { name: /Delivery pin/ });
    expect(within(row).getByText("Client confirmed")).toBeInTheDocument();
    expect(within(row).getByText(/^Confirmed /)).toBeInTheDocument();
    expect(within(row).getByText("Alex")).toBeInTheDocument();
    expect(within(row).getByText("Blue gate beside the pharmacy")).toBeInTheDocument();
    expect(within(row).getAllByText(ORIGINAL.label).length).toBeGreaterThan(0);
    expect(within(row).getByText("7.10000, 125.62000")).toBeInTheDocument();
    // Nothing waits on Operations: no decision is offered.
    expect(within(row).queryByRole("button", { name: /received/ })).toBeNull();
  });

  it("opens itself when a pin payment waits, and verifies the exact amount", async () => {
    order = base({ deliveryPin: pin({ change: awaitingCheck }) });
    const user = userEvent.setup();
    render(<OrderWorkspace queueHref="/ops/orders" />);
    const confirm = await screen.findByRole("button", { name: "Confirm ₱60.00 received" });
    expect(screen.getByText(/Dispatch is held until you verify or reject it/)).toBeInTheDocument();
    expect(screen.getByText("+₱60.00")).toBeInTheDocument();
    expect(screen.getByText("+₱51.00")).toBeInTheDocument();
    expect(screen.getByText("+₱9.00")).toBeInTheDocument();

    await user.click(confirm);
    const dialog = await screen.findByRole("alertdialog");
    const save = within(dialog).getByRole("button", { name: "Confirm and save the pin" });
    expect(save).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(save);

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].path).toBe("/orders/order1/delivery-pin/payment/confirm");
    expect(posted[0].body).toEqual({
      expectedVersion: 4,
      amountMinor: 6_000,
      reason: "Exact wallet transfer verified.",
    });
    expect(posted[0].key).toBeTruthy();
    expect(
      await screen.findByText("Payment verified. The new pin is saved and the rider will go there."),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Collected ₱60\.00 by QR, verified .* by Rina Ops/)).toBeInTheDocument();
    const rail = screen.getByRole("complementary", { name: "Order details" });
    expect(within(rail).getByText("Paid for the pin change")).toBeInTheDocument();
  });

  it("rejects with a reason the client reads, and never sends money back", async () => {
    order = base({ deliveryPin: pin({ change: awaitingCheck }) });
    const user = userEvent.setup();
    render(<OrderWorkspace queueHref="/ops/orders" />);
    await user.click(await screen.findByRole("button", { name: "Reject the payment" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/rejecting does not send any money back/)).toBeInTheDocument();
    const reason = within(dialog).getByLabelText("Reason for the client");
    await user.clear(reason);
    await user.type(reason, "No transfer of ₱60.00 arrived.");
    await user.click(within(dialog).getByRole("button", { name: "Reject payment" }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].path).toBe("/orders/order1/delivery-pin/payment/reject");
    expect(posted[0].body).toEqual({ expectedVersion: 4, reason: "No transfer of ₱60.00 arrived." });
    expect(await screen.findByText(/Last screenshot rejected/)).toBeInTheDocument();
  });

  it("reloads a stale pin instead of retrying it", async () => {
    order = base({ deliveryPin: pin({ change: awaitingCheck }) });
    reply409 = "delivery_pin_stale";
    const user = userEvent.setup();
    render(<OrderWorkspace queueHref="/ops/orders" />);
    await user.click(await screen.findByRole("button", { name: "Confirm ₱60.00 received" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Confirm and save the pin" }));
    expect(
      await screen.findByText(/The delivery pin changed while you were reading it/),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("links a cheaper pin's credit to its refund case and shows the fee now", async () => {
    order = base({
      deliveryPin: pin({
        point: MOVED,
        changeUsed: true,
        change: {
          ...awaitingCheck,
          status: "applied",
          deliveryFeeMinor: 1_000,
          feeDifferenceMinor: -4_000,
          riderDifferenceMinor: -3_400,
          platformDifferenceMinor: -600,
          appliedAt: "2026-10-15T06:30:00.000Z",
          refundRequestId: "refund_pin",
          payment: null,
        },
      }),
      riderPayoutMinor: 850,
      platformDeliveryShareMinor: 150,
      effectiveDeliveryFeeMinor: 1_000,
      effectiveTotalMinor: 111_000,
    });
    refunds = [
      {
        id: "refund_pin",
        orderId: "order1",
        status: "destination_review",
        version: 1,
        kind: "delivery_pin",
        destination: null,
        createdAt: "2026-10-15T06:30:00.000Z",
        settlement: { totalMinor: 4_000, disposition: "delivery_adjustment" },
        payment: null,
      } as unknown as RefundRequest,
    ];
    await openPinRow();
    const row = screen.getByRole("region", { name: /Delivery pin/ });
    expect(
      within(row).getByText("₱40.00 credit. Waiting on the client's QR."),
    ).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Open the credit’s refund case" })).toHaveAttribute(
      "href",
      "/ops/refunds/refund_pin",
    );
    expect(within(row).getByText("Checkout pin")).toBeInTheDocument();
    expect(within(row).getByText("Delivery pin now")).toBeInTheDocument();

    // The money rail keeps the checkout figures and adds the change beside them.
    const rail = screen.getByRole("complementary", { name: "Order details" });
    expect(within(rail).getByText("Delivery at checkout")).toBeInTheDocument();
    expect(within(rail).getByTestId("pin-change-difference")).toHaveTextContent("−₱40.00");
    expect(within(rail).getByTestId("delivery-now")).toHaveTextContent("₱10.00");
    expect(within(rail).getByTestId("total-now")).toHaveTextContent("₱1,110.00");
    expect(
      screen.getByText("Delivery-fee credit: Waiting on the client's QR, ₱40.00."),
    ).toBeInTheDocument();
    // An open credit is the one open request: filing another is explained, not offered.
    expect(screen.queryByRole("button", { name: "File a refund for the client" })).toBeNull();
  });
});
