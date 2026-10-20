// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Order } from "@/lib/api/types";

const { getOrderMock } = vi.hoisted(() => ({ getOrderMock: vi.fn() }));

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "job-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")),
  getOrder: getOrderMock,
}));

import SupplierJobDetailPage from "@/app/supplier/jobs/[id]/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function job(patch: Partial<Order>): Order {
  return {
    id: "job-1",
    clientId: "c1",
    supplierId: "user_supplier",
    riderId: "rider-1",
    state: "rider_assigned",
    title: "Tarpaulin run",
    deadline: null,
    address: "Somewhere",
    deliveryFeeMinor: 0,
    totalMinor: 0,
    paymentMethod: null,
    paymentStatus: "unpaid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    timeline: [],
    handoverFlow: "legacy",
    ...patch,
  } as Order;
}

describe("supplier handover readback", () => {
  it("reads a failed check with no count, and offers the shop no rider or staff action", async () => {
    getOrderMock.mockResolvedValue(
      job({
        pickupChecklist: {
          status: "failed_escalated",
          checks: [{ code: "quantity_match", passed: false }],
          evidenceFileIds: [],
          failureNote: "Short",
          completedAt: "2026-10-15T04:00:00.000Z",
          completedBy: "rider-1",
          escalationId: "esc-1",
        },
        forcedByGridgo: true,
        forcedSteps: [
          {
            at: "2026-10-15T02:00:00.000Z",
            by: "ops",
            role: "operations",
            from: "production",
            to: "ready_for_dispatch",
            reasonCode: "operational_correction",
            note: "Photos checked in the shop",
            skippedChecks: ["packing_photo_required"],
          },
        ],
      }),
    );
    render(<SupplierJobDetailPage />);

    expect((await screen.findAllByText("Pickup blocked")).length).toBeGreaterThan(0);
    const counter = screen.getByRole("region", { name: "Counter check" });
    expect(within(counter).getByText("Not recorded")).toBeInTheDocument();
    expect(within(counter).getByText(/stays with you/)).toBeInTheDocument();
    expect(within(counter).queryByText(/released to transport/i)).not.toBeInTheDocument();
    expect(within(counter).queryByRole("button")).not.toBeInTheDocument();

    const forced = screen.getByRole("region", { name: "Forced step" });
    expect(within(forced).getByText("Moved on to rider pickup")).toBeInTheDocument();
    expect(within(forced).queryByRole("button")).not.toBeInTheDocument();

    expect(screen.getByRole("list", { name: "Handover steps" })).toBeInTheDocument();
    expect(screen.queryByText(/Waiting on you/)).not.toBeInTheDocument();
  });

  it("reads a declined offer as passed on, not as an assigned job", async () => {
    getOrderMock.mockResolvedValue(
      job({
        state: "supplier_assigned",
        riderId: null,
        handoverFlow: undefined,
        shopAcceptance: {
          supplierId: "user_supplier",
          assignedAt: "2026-10-05T06:00:00.000Z",
          deadlineAt: "2026-10-05T07:00:00.000Z",
          workingMinutes: 60,
          status: "declined",
        },
      }),
    );
    render(<SupplierJobDetailPage />);
    expect((await screen.findAllByText("Passed on")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Awaiting supplier decision")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept job" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Decline" })).not.toBeInTheDocument();
  });
});
