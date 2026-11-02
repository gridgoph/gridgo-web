// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import type { Order, ShopMove, ShopMovePricing } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "order1" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));

const AT = "2026-11-02T02:00:00.000Z";
const FUTURE = "2099-01-01T08:00:00.000Z";
const PAST = "2026-01-01T08:00:00.000Z";

const abovecap: ShopMovePricing = {
  ruleApplies: true,
  fault: "gridgo",
  rule: "above_cap",
  originalPriceMinor: 10000,
  newPriceMinor: 11000,
  differenceMinor: 1000,
  gridgoCoverMinor: 500,
  clientPaysMinor: 500,
  refundMinor: 0,
  capBps: 5000,
  serviceFeeMinor: 1000,
  capByRateMinor: 500,
  serviceFeeCollectedMinor: 1000,
  capMinor: 500,
  capLimitedByCollection: false,
};

function fixture(patch: Partial<Order> = {}): Order {
  return {
    id: "order1",
    clientId: "client1",
    supplierId: "shop-a",
    riderId: null,
    state: "production",
    title: "Flyers",
    quantity: 2,
    deadline: null,
    address: "Davao",
    totalMinor: 11000,
    supplierSubtotalMinor: 10000,
    serviceFeeMinor: 1000,
    deliveryFeeMinor: 0,
    paymentMethod: "qr_manual",
    paymentStatus: "initial_payment_confirmed",
    promisedDate: null,
    artworkName: null,
    readyBy: FUTURE,
    createdAt: AT,
    updatedAt: AT,
    timeline: [],
    shopAcceptance: {
      supplierId: "shop-a",
      assignedAt: "2026-11-01T00:00:00.000Z",
      deadlineAt: "2026-11-01T01:00:00.000Z",
      workingMinutes: 60,
      status: "accepted",
      acceptedAt: "2026-11-01T00:30:00.000Z",
    },
    shopRecovery: null,
    rescheduleRequest: null,
    ...patch,
  } as Order;
}

let order: Order;
let posts: { path: string; body: unknown }[];
let startError: { status: number; error: string } | null;
let events: unknown[];

// Base UI radios dispatch a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {}

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("PointerEvent", FakePointerEvent);
  order = fixture();
  posts = [];
  startError = null;
  events = [];
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://gridgo.test").pathname;
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (init?.method === "POST" && path.endsWith("/shop-recovery/start")) {
        posts.push({ path, body: JSON.parse(String(init.body)) });
        if (startError) return json({ error: startError.error }, startError.status);
        order = fixture({
          shopRecovery: {
            id: "ev-9",
            kind: "gridgo",
            fault: "gridgo",
            status: "awaiting_client",
            originalSupplierId: "shop-a",
            stage: "production",
            createdAt: AT,
            proposal: {
              supplierId: "shop-b",
              readyBy: FUTURE,
              promiseBy: FUTURE,
              expiresAt: FUTURE,
              optionId: "option_1",
              pricing: abovecap,
              alternatives: [],
            },
          },
        });
        return json({ order: { id: "order1", state: "production" }, recovery: order.shopRecovery });
      }
      if (path === "/ops/shop-failures") return json({ events });
      if (path.startsWith("/files/")) return json({ error: "not_found" }, 404);
      if (path.startsWith("/users/")) {
        const id = path.split("/").pop();
        return json({ user: { id, name: id === "shop-b" ? "Shop B" : "Shop A" } });
      }
      return json({ order });
    }),
  );
});

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

async function openShopRow() {
  const trigger = await screen.findByRole("button", { name: /Shop acceptance/ });
  if (trigger.getAttribute("aria-expanded") !== "true") fireEvent.click(trigger);
}

it("starts a GRIDGO-caused move with its reason, and shows the offer's price rule", async () => {
  render(<OrderWorkspace queueHref="/ops/orders" />);
  await openShopRow();
  fireEvent.click(await screen.findByRole("button", { name: "Move to another shop" }));
  const dialog = await screen.findByRole("dialog");

  // Each cause has its one line of help; late is off until the ready-by passes.
  expect(within(dialog).getByText(/A reason on GRIDGO's side/)).toBeInTheDocument();
  expect(within(dialog).getByText(/No cover, no refund/)).toBeInTheDocument();
  const late = within(dialog).getByRole("radio", { name: "The shop is late" });
  expect(late).toHaveAttribute("aria-disabled", "true");

  // Nothing is sent without a cause and a reason.
  fireEvent.click(within(dialog).getByRole("button", { name: "Start the move" }));
  expect(await within(dialog).findByText("Pick why the order is moving.")).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("radio", { name: "GRIDGO is moving it" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Start the move" }));
  expect(await within(dialog).findByText(/Write why the order is moving/)).toBeInTheDocument();
  expect(posts).toEqual([]);

  fireEvent.change(within(dialog).getByLabelText("Reason"), {
    target: { value: "  Partner shop closed for repairs.  " },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Start the move" }));
  await waitFor(() =>
    expect(posts).toEqual([
      {
        path: "/orders/order1/shop-recovery/start",
        body: { cause: "gridgo", reason: "Partner shop closed for repairs." },
      },
    ]),
  );

  const recovery = await screen.findByTestId("shop-recovery");
  expect(within(recovery).getByText("Moved by GRIDGO")).toBeInTheDocument();
  const pricing = within(recovery).getByTestId("shop-move-pricing");
  expect(pricing).toHaveTextContent(
    "Dearer by ₱10.00. GRIDGO covers ₱5.00; the client pays ₱5.00, picks another shop, or takes a full refund.",
  );
  expect(pricing).toHaveTextContent("GRIDGO covers up to ₱5.00 (50% of the ₱10.00 service fee).");
  expect(screen.queryByRole("button", { name: "Move to another shop" })).toBeNull();
});

it("offers the late cause once the ready-by has passed, and explains a refusal", async () => {
  order = fixture({ readyBy: PAST });
  startError = { status: 409, error: "shop_late_not_eligible" };
  render(<OrderWorkspace queueHref="/admin/orders" />);
  await openShopRow();
  fireEvent.click(await screen.findByRole("button", { name: "Move to another shop" }));
  const dialog = await screen.findByRole("dialog");
  const late = within(dialog).getByRole("radio", { name: "The shop is late" });
  expect(late).not.toHaveAttribute("aria-disabled", "true");
  fireEvent.click(late);
  fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Two days late." } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Start the move" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "This order is not late enough to move for lateness",
  );
  expect(posts[0].body).toEqual({ cause: "late", reason: "Two days late." });
});

it("sends the client-caused cause unchanged", async () => {
  render(<OrderWorkspace queueHref="/ops/orders" />);
  await openShopRow();
  fireEvent.click(await screen.findByRole("button", { name: "Move to another shop" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("radio", { name: "The client asked" }));
  fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Client prefers Shop B." } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Start the move" }));
  await waitFor(() => expect(posts[0]?.body).toEqual({ cause: "client", reason: "Client prefers Shop B." }));
});

const move: ShopMove = {
  id: "shop_move_1",
  recoveryId: "ev-9",
  at: AT,
  kind: "gridgo",
  fault: "gridgo",
  fromSupplierId: "shop-a",
  toSupplierId: "shop-b",
  optionId: "option_1",
  choice: "replacement",
  paysDifference: true,
  status: "awaiting_payment",
  pricing: abovecap,
  gridgoCoverMinor: 500,
  refundMinor: 0,
  clientPaysMinor: 500,
  refundRequestId: null,
  refundStatus: null,
  topUpChangeRequestId: "change_1",
};

it("shows a move waiting on the client's top-up, and points to the payment to verify", async () => {
  order = fixture({
    supplierId: "shop-b",
    state: "supplier_assigned",
    shopRecovery: {
      id: "ev-9",
      kind: "gridgo",
      fault: "gridgo",
      status: "awaiting_payment",
      originalSupplierId: "shop-a",
      stage: "production",
      createdAt: AT,
      topUp: { changeRequestId: "change_1", amountMinor: 500 },
    },
    shopMoves: [move],
    changeRequests: [
      {
        id: "change_1",
        lineItemId: null,
        status: "pending_confirmation",
        version: 2,
        reason: "Replacement shop price above GRIDGO cover; the client chose to pay the rest.",
        proposedSpec: "",
        extraPrincipalMinor: 500,
        feeMinor: 0,
        totalMinor: 500,
        createdAt: AT,
        shopMoveTopUp: { recoveryId: "ev-9", moveId: "shop_move_1" },
        payment: { reference: "REF-1", proofFileId: "file_1", submittedAt: AT },
      },
    ],
  } as Partial<Order>);
  render(<OrderWorkspace queueHref="/ops/orders" />);

  expect(
    await screen.findByText(
      "Moved to a new shop. The client owes ₱5.00 more; work starts once it is verified.",
    ),
  ).toBeInTheDocument();
  const recovery = await screen.findByTestId("shop-recovery");
  expect(within(recovery).getByText("Moved, waiting for the client's payment")).toBeInTheDocument();
  expect(within(recovery).getByTestId("shop-move-top-up")).toHaveTextContent(
    "Their transfer is verified under Special instructions",
  );

  const moves = screen.getByTestId("shop-moves");
  expect(within(moves).getByText("Waiting for the client's payment")).toBeInTheDocument();
  expect(within(moves).getByText("Took the offered shop and pays the rest")).toBeInTheDocument();
  expect(
    within(moves).getByText("Dearer by ₱10.00. GRIDGO covers ₱5.00; the client pays the remaining ₱5.00."),
  ).toBeInTheDocument();
  expect(within(moves).getByText("Original price").nextSibling).toHaveTextContent("₱100.00");
  expect(within(moves).getByText("New price").nextSibling).toHaveTextContent("₱110.00");
  expect(within(moves).getByText("Difference").nextSibling).toHaveTextContent("+₱10.00");
  expect(within(moves).getByText("GRIDGO covers").nextSibling).toHaveTextContent("₱5.00");
  expect(within(moves).getByText("Client pays the rest").nextSibling).toHaveTextContent("₱5.00");

  // The top-up is confirmed through the existing change payment, in its own words.
  expect(await screen.findByText("Price difference for the new shop")).toBeInTheDocument();
  expect(screen.getByText(/for the new shop's price\. Verify it or reject it/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirm ₱5.00 received" })).toBeInTheDocument();
  // No second move while one is open.
  expect(screen.queryByRole("button", { name: "Move to another shop" })).toBeNull();
});

it("shows a cheaper move's refund and where it is reconciled", async () => {
  const cheaper: ShopMovePricing = {
    ...abovecap,
    fault: "shop",
    rule: "cheaper",
    newPriceMinor: 9000,
    differenceMinor: -1000,
    gridgoCoverMinor: 0,
    clientPaysMinor: 0,
    refundMinor: 1000,
  };
  order = fixture({
    supplierId: "shop-b",
    shopRecovery: {
      id: "ev-9",
      kind: "cancelled",
      fault: "shop",
      status: "accepted",
      originalSupplierId: "shop-a",
      acceptedAt: AT,
    },
    shopMoves: [
      {
        ...move,
        kind: "cancelled",
        fault: "shop",
        choice: "alternative",
        paysDifference: false,
        status: "applied",
        pricing: cheaper,
        gridgoCoverMinor: 0,
        clientPaysMinor: 0,
        refundMinor: 1000,
        refundRequestId: "refund_1",
        refundStatus: "reserved",
        topUpChangeRequestId: null,
      },
    ],
  });
  render(<OrderWorkspace queueHref="/ops/orders" />);
  await openShopRow();
  const moves = await screen.findByTestId("shop-moves");
  expect(within(moves).getByText("Moved")).toBeInTheDocument();
  expect(within(moves).getByText("The shop cancelled")).toBeInTheDocument();
  expect(within(moves).getByText("Picked another offered shop")).toBeInTheDocument();
  expect(within(moves).getByText("Cheaper by ₱10.00. The client gets ₱10.00 back.")).toBeInTheDocument();
  expect(within(moves).getByText("Back to the client").nextSibling).toHaveTextContent("₱10.00");
  expect(within(moves).getByRole("link", { name: "Open it in Refunds" })).toHaveAttribute(
    "href",
    "/ops/refunds?order=order1",
  );
});

it("never calls a move Operations started a shop dropout", async () => {
  order = fixture({
    shopRecovery: {
      id: "ev-9",
      kind: "gridgo",
      fault: "gridgo",
      status: "ops_review",
      originalSupplierId: "shop-a",
      stage: "production",
      createdAt: AT,
      proposal: null,
    },
  });
  events = [
    {
      id: "ev-9",
      orderId: "order1",
      supplierId: "shop-a",
      kind: "gridgo",
      fault: "gridgo",
      stage: "production",
      reason: "Partner shop closed for repairs.",
      at: AT,
      actorId: "ops1",
      recovery: order.shopRecovery,
    },
  ];
  render(<OrderWorkspace queueHref="/ops/orders" />);
  expect(
    await screen.findByText("Needs Operations: a share was already paid, so no replacement was offered."),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Paused: the order is moving to another shop. The rows below say what happens next."),
  ).toBeInTheDocument();
  expect(await screen.findByText("Shop dropouts and moves on this order")).toBeInTheDocument();
  expect(screen.getByText("Moved by GRIDGO (in production)")).toBeInTheDocument();
});
