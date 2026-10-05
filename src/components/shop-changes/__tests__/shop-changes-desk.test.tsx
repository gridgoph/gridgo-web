// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { Order, RescheduleRequest, ShopFailureEvent } from "@/lib/api/types";

vi.stubGlobal("React", React);
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
const api = vi.hoisted(() => ({
  listShopFailures: vi.fn(),
  listRescheduleRequests: vi.fn(),
  listOrders: vi.fn(),
  getUser: vi.fn(),
  resolveRescheduleRequest: vi.fn(),
}));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  ...api,
}));
const { ShopChangesDesk } = await import("@/components/shop-changes/ShopChangesDesk");

const paidDropout: ShopFailureEvent = {
  id: "ev-paid",
  orderId: "o-paid",
  supplierId: "shop-a",
  kind: "cancelled",
  stage: "production",
  reason: "Our press broke down.",
  at: "2026-10-05T02:00:00.000Z",
  actorId: "shop-a",
  recovery: {
    id: "ev-paid",
    status: "ops_review",
    originalSupplierId: "shop-a",
    stage: "production",
    createdAt: "2026-10-05T02:00:00.000Z",
    proposal: null,
  },
};
const timeout: ShopFailureEvent = {
  id: "ev-late",
  orderId: "o-late",
  supplierId: "shop-b",
  kind: "timed_out",
  stage: "supplier_assigned",
  reason: "No response within one opening hour.",
  at: "2026-10-05T03:00:00.000Z",
  actorId: null,
  recovery: {
    id: "ev-late",
    status: "awaiting_client",
    proposal: {
      supplierId: "shop-c",
      readyBy: "2026-10-07T08:00:00.000Z",
      promiseBy: "2026-10-08T08:00:00.000Z",
      expiresAt: "2026-10-05T03:15:00.000Z",
    },
  },
};
const heldRequest: RescheduleRequest = {
  id: "resched_1",
  orderId: "o-resched",
  supplierId: "shop-b",
  reason: "Equipment repair",
  status: "operations_required",
  requestedAt: "2026-10-04T01:00:00.000Z",
  expiresAt: "2026-10-05T01:00:00.000Z",
  answeredAt: "2026-10-04T05:00:00.000Z",
  resolution: "operations_required",
  refundRequestId: null,
  workHeld: true,
  originalReadyBy: "2026-10-06T08:00:00.000Z",
  proposedReadyBy: "2026-10-08T08:00:00.000Z",
  appliedDeductionMinor: 25000,
};

const orders = [
  { id: "o-paid", title: "Event tarpaulin" },
  { id: "o-late", title: "Calling cards" },
  { id: "o-resched", title: "Menu boards" },
] as Order[];

beforeEach(() => {
  api.listShopFailures.mockResolvedValue([paidDropout, timeout]);
  api.listRescheduleRequests.mockResolvedValue({ totalRequests: 1, requests: [heldRequest] });
  api.listOrders.mockResolvedValue(orders);
  api.getUser.mockImplementation(async (id: string) => ({ id, name: `Shop ${id.slice(-1).toUpperCase()}` }));
});

afterEach(() => {
  cleanup();
  for (const fn of Object.values(api)) fn.mockReset();
});

function needsSection() {
  return screen.getByRole("heading", { name: "Needs Operations" }).closest("section")!;
}

it("puts the paid-share dropout and the held deadline request in Needs Operations, oldest first", async () => {
  render(<ShopChangesDesk tree="ops" />);
  await screen.findByRole("heading", { name: "Needs Operations" });
  const section = needsSection();
  expect(within(section).getByText("2 waiting on you")).toBeInTheDocument();

  const table = within(section).getByRole("table");
  const rows = within(table).getAllByRole("row").slice(1);
  expect(rows[0]).toHaveTextContent("Menu boards");
  expect(rows[0]).toHaveTextContent(/deduction of ₱250.00 was already taken/);
  expect(rows[1]).toHaveTextContent("Event tarpaulin");
  expect(rows[1]).toHaveTextContent("Cancelled after accepting, at");
  // The timeout is with the client, not Operations.
  expect(within(section).queryByText("Calling cards")).not.toBeInTheDocument();
  expect(rows[1].querySelector('a[href="/ops/orders/o-paid"]')).not.toBeNull();
});

it("records a resolution for a held deadline request", async () => {
  api.resolveRescheduleRequest.mockResolvedValue({ ...heldRequest, workHeld: false, resolution: "resolved" });
  render(<ShopChangesDesk tree="admin" />);
  await screen.findByRole("heading", { name: "Needs Operations" });

  fireEvent.click(within(needsSection()).getAllByRole("button", { name: "Record a resolution" })[0]);
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Record resolution" }));
  expect(within(dialog).getByRole("alert")).toHaveTextContent(/Write what was agreed/);

  fireEvent.change(within(dialog).getByLabelText("What was agreed"), {
    target: { value: "Client and shop agreed to continue on the original date." },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Record resolution" }));
  await waitFor(() =>
    expect(api.resolveRescheduleRequest).toHaveBeenCalledWith("o-resched", {
      requestId: "resched_1",
      reason: "Client and shop agreed to continue on the original date.",
    }),
  );
  await waitFor(() => expect(api.listShopFailures).toHaveBeenCalledTimes(2));
});

it("logs every dropout with its stage, reason and where it stands", async () => {
  render(<ShopChangesDesk tree="ops" />);
  const tab = await screen.findByRole("tab", { name: "Shop dropouts (2)" });
  expect(tab).toHaveAttribute("aria-selected", "true");
  const table = screen.getByRole("table", { name: "Shop dropouts, newest first" });
  const rows = within(table).getAllByRole("row").slice(1);
  expect(rows[0]).toHaveTextContent("Calling cards");
  expect(rows[0]).toHaveTextContent("No answer in time");
  expect(rows[0]).toHaveTextContent("Client choosing: replacement or refund");
  expect(rows[1]).toHaveTextContent("“Our press broke down.”");
  await waitFor(() => expect(rows[1]).toHaveTextContent("Shop A"));
});

it("is honest when the API has no deadline requests yet", async () => {
  api.listRescheduleRequests.mockRejectedValue(new ApiError(404, { error: "not_found" }));
  render(<ShopChangesDesk tree="ops" />);
  fireEvent.click(await screen.findByRole("tab", { name: "Deadline requests" }));
  expect(await screen.findByTestId("deadlines-unavailable")).toBeInTheDocument();
  // Recoveries still count.
  expect(within(needsSection()).getByText("1 waiting on you")).toBeInTheDocument();
});

it("says nothing is waiting when nothing is", async () => {
  api.listShopFailures.mockResolvedValue([timeout]);
  api.listRescheduleRequests.mockResolvedValue({ totalRequests: 0, requests: [] });
  render(<ShopChangesDesk tree="ops" />);
  expect(await screen.findByTestId("needs-operations-empty")).toBeInTheDocument();
});
