// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import type { Order, RescheduleRequest } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "order1" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));

const AT = "2026-10-05T02:00:00.000Z";

const held: RescheduleRequest = {
  id: "resched_1",
  orderId: "order1",
  supplierId: "shop-a",
  reason: "Equipment repair",
  status: "declined",
  requestedAt: "2026-10-04T01:00:00.000Z",
  expiresAt: "2026-10-05T01:00:00.000Z",
  answeredAt: "2026-10-04T05:00:00.000Z",
  resolution: "operations_required",
  refundRequestId: null,
  workHeld: true,
  originalReadyBy: "2026-10-06T08:00:00.000Z",
  proposedReadyBy: "2026-10-08T08:00:00.000Z",
  originalPromiseBy: "2026-10-07T08:00:00.000Z",
  proposedPromiseBy: "2026-10-09T08:00:00.000Z",
  appliedDeductionMinor: 0,
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
    totalMinor: 10000,
    deliveryFeeMinor: 0,
    paymentMethod: "qr_manual",
    paymentStatus: "initial_payment_confirmed",
    promisedDate: null,
    artworkName: null,
    createdAt: AT,
    updatedAt: AT,
    timeline: [],
    shopAcceptance: {
      supplierId: "shop-a",
      assignedAt: "2026-10-04T00:00:00.000Z",
      deadlineAt: "2026-10-04T01:00:00.000Z",
      workingMinutes: 60,
      status: "cancelled",
    },
    shopRecovery: {
      id: "ev-1",
      status: "ops_review",
      originalSupplierId: "shop-a",
      stage: "production",
      createdAt: AT,
      originalSnapshot: { readyBy: null, promiseBy: "2026-10-07T08:00:00.000Z" },
      proposal: null,
    },
    rescheduleRequest: held,
    ...patch,
  };
}

let order: Order;
let posts: { path: string; body: unknown }[];

beforeEach(() => {
  vi.stubGlobal("React", React);
  order = fixture();
  posts = [];
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://gridgo.test").pathname;
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
      if (init?.method === "POST" && path.endsWith("/reschedule-request/resolve")) {
        posts.push({ path, body: JSON.parse(String(init.body)) });
        order = fixture({ rescheduleRequest: { ...held, workHeld: false, resolution: "resolved", resolutionReason: "Agreed." } });
        return json({ request: order.rescheduleRequest });
      }
      if (path === "/ops/shop-failures") {
        return json({
          events: [
            { id: "ev-1", orderId: "order1", supplierId: "shop-a", kind: "cancelled", stage: "production", reason: "Press broke down.", at: AT, actorId: "shop-a", recovery: order.shopRecovery },
            { id: "ev-x", orderId: "other", supplierId: "shop-b", kind: "declined", stage: "supplier_assigned", reason: "Busy.", at: AT, actorId: "shop-b", recovery: null },
          ],
        });
      }
      if (path.startsWith("/users/")) return json({ user: { id: "shop-a", name: "Shop A" } });
      return json({ order });
    }),
  );
});

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

it("opens the dropout and the held deadline request when they need Operations", async () => {
  render(<OrderWorkspace queueHref="/ops/orders" />);

  expect(
    await screen.findByText("Needs Operations: the shop dropped out after a share was paid."),
  ).toBeInTheDocument();
  const recovery = await screen.findByTestId("shop-recovery");
  expect(within(recovery).getByText(/already paid a share of this order/)).toBeInTheDocument();
  expect(await screen.findByText("Cancelled after accepting, at In production")).toBeInTheDocument();
  expect(screen.getByText("“Press broke down.”")).toBeInTheDocument();
  expect(screen.queryByText("“Busy.”")).not.toBeInTheDocument();

  const deadline = screen.getByTestId("deadline-request");
  expect(within(deadline).getByText(/A shop payout was already released/)).toBeInTheDocument();
  expect(within(deadline).getByText(formatDateTime(held.proposedReadyBy))).toBeInTheDocument();
});

it("records a resolution for the deadline request", async () => {
  render(<OrderWorkspace queueHref="/admin/orders" />);
  const deadline = await screen.findByTestId("deadline-request");
  fireEvent.click(within(deadline).getByRole("button", { name: "Record a resolution" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("What was agreed"), { target: { value: "Agreed." } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Record resolution" }));
  await waitFor(() =>
    expect(posts).toEqual([
      {
        path: "/orders/order1/reschedule-request/resolve",
        body: { requestId: "resched_1", reason: "Agreed." },
      },
    ]),
  );
  expect((await screen.findAllByText(/Resolved by Operations/)).length).toBeGreaterThan(0);
});

it("shows the file's live wait on the quality check", async () => {
  order = fixture({
    state: "needs_qa",
    shopAcceptance: null,
    shopRecovery: null,
    rescheduleRequest: null,
    fileCheck: {
      status: "pending",
      requestedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
      reviewedAt: null,
      reason: null,
      waitingSeconds: 0,
    },
  });
  render(<OrderWorkspace queueHref="/ops/orders" />);
  expect(await screen.findByText("File waiting 3 h. Pass it or send it back.")).toBeInTheDocument();
  expect(screen.queryByText("Shop acceptance")).not.toBeInTheDocument();
});
