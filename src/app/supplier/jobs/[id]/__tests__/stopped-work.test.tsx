// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Order, PayoutMilestone } from "@/lib/api/types";

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

/** The status chip. The Latest row repeats the current standing, so the bare text is not unique. */
function statusChip(label: string) {
  return screen.getAllByRole("status").find((el) => el.textContent?.trim() === label);
}

async function findStatusChip(label: string) {
  await waitFor(() => expect(statusChip(label)).toBeDefined());
  return statusChip(label);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function milestone(code: string, status: PayoutMilestone["status"]): PayoutMilestone {
  return {
    code,
    sharePercent: 25,
    status,
    pofFileIds: status === "pending_pof" ? [] : ["file-1"],
  };
}

const FILED = [milestone("printing", "pof_attached"), milestone("packaging_qc", "pof_attached")];

function job(patch: Partial<Order>): Order {
  return {
    id: "job-1",
    clientId: "c1",
    supplierId: "user_supplier",
    riderId: null,
    state: "production",
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
    payoutMilestones: FILED,
    productionProgress: {
      status: "photos_available",
      photos: [{ fileId: "photo-1", contentType: "image/jpeg", at: "2026-10-01T00:00:00.000Z" }],
    },
    ...patch,
  } as Order;
}

const acceptance = {
  supplierId: "user_supplier",
  assignedAt: "2026-10-05T06:00:00.000Z",
  deadlineAt: "2026-10-05T07:00:00.000Z",
  workingMinutes: 60,
  status: "pending" as const,
};

describe("stopped work on the job", () => {
  it.each([
    ["with a readiness list", { transitionReadiness: { ready_for_dispatch: { allowed: true, missing: [] } } }],
    ["without a readiness list", {}],
  ])("a refund offers no action, proof, or commitment, %s", async (_label, extra) => {
    getOrderMock.mockResolvedValue(job({ refundHold: true, ...extra }));
    render(<SupplierJobDetailPage />);
    expect(await findStatusChip("Paused for refund")).toBeInTheDocument();
    expect(screen.getByText(/until Operations settles it/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Package for pickup" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add proof photos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add another photo" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Your shop commits to this job/)).not.toBeInTheDocument();
  });

  it("a recovery names who has the job and keeps the step off this shop", async () => {
    getOrderMock.mockResolvedValue(
      job({
        shopAcceptance: { ...acceptance, status: "cancelled" },
        shopRecovery: { id: "e1", status: "ops_review" },
      }),
    );
    render(<SupplierJobDetailPage />);
    expect(await findStatusChip("Cancelled by you")).toBeInTheDocument();
    expect(screen.getByText(/Operations is working out the next step/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Package for pickup" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add proof photos" })).not.toBeInTheDocument();
  });

  it("a held deadline pauses the job over a failed counter check", async () => {
    getOrderMock.mockResolvedValue(
      job({
        state: "rider_assigned",
        pickupChecklist: {
          status: "failed_escalated",
          checks: [],
          evidenceFileIds: [],
          failureNote: null,
          completedAt: null,
          completedBy: null,
          escalationId: "esc-1",
        },
        rescheduleRequest: {
          id: "r1",
          orderId: "job-1",
          reason: "Laminator",
          status: "declined",
          requestedAt: "2026-10-05T06:00:00.000Z",
          expiresAt: "2026-10-06T06:00:00.000Z",
          answeredAt: "2026-10-05T08:00:00.000Z",
          resolution: "rematch_offered",
          refundRequestId: null,
          workHeld: true,
          originalReadyBy: "2026-10-07T09:00:00.000Z",
          proposedReadyBy: "2026-10-09T09:00:00.000Z",
        },
      }),
    );
    render(<SupplierJobDetailPage />);
    expect(await findStatusChip("Paused")).toBeInTheDocument();
    expect(screen.getByText(/GRIDGO is offering the client another shop/)).toBeInTheDocument();
    expect(screen.queryByText("Pickup blocked")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Package for pickup" })).not.toBeInTheDocument();
  });

  it("an hour that has already run out offers no accept or decline", async () => {
    const now = Date.now();
    getOrderMock.mockResolvedValue(
      job({
        state: "supplier_assigned",
        shopAcceptance: {
          ...acceptance,
          assignedAt: new Date(now - 60 * 60_000).toISOString(),
          deadlineAt: new Date(now - 1000).toISOString(),
        },
      }),
    );
    render(<SupplierJobDetailPage />);
    expect(await screen.findByText("The hour to answer has run out")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept job" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Decline" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Your shop commits to this job/)).not.toBeInTheDocument();
  });

  it("says the hour pauses across closed hours, and does not count it down", async () => {
    const now = Date.now();
    getOrderMock.mockResolvedValue(
      job({
        state: "supplier_assigned",
        payoutMilestones: [],
        shopAcceptance: {
          ...acceptance,
          assignedAt: new Date(now - 30 * 60_000).toISOString(),
          deadlineAt: new Date(now + 20 * 60 * 60_000).toISOString(),
        },
      }),
    );
    render(<SupplierJobDetailPage />);
    expect(await screen.findByText("Pauses while you are closed")).toBeInTheDocument();
    expect(screen.getByText(/stops while you are closed and carries on when you open/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept job" })).toBeInTheDocument();
    expect(screen.queryByText(/Time left to accept or decline/)).not.toBeInTheDocument();
  });

  it("an accepted replacement still belongs to this shop", async () => {
    const now = Date.now();
    getOrderMock.mockResolvedValue(
      job({
        state: "supplier_assigned",
        payoutMilestones: [],
        shopAcceptance: {
          ...acceptance,
          assignedAt: new Date(now - 10 * 60_000).toISOString(),
          deadlineAt: new Date(now + 50 * 60_000).toISOString(),
        },
        shopRecovery: { id: "e1", status: "accepted" },
      }),
    );
    render(<SupplierJobDetailPage />);
    expect(await screen.findByRole("button", { name: "Accept job" })).toBeInTheDocument();
    expect(screen.getByText(/Your shop commits to this job/)).toBeInTheDocument();
  });
});

describe("the hour expiring while the job is open", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("drops accept and decline without waiting for a live event, then reloads", async () => {
    const now = Date.now();
    const open = job({
      state: "supplier_assigned",
      payoutMilestones: [],
      shopAcceptance: {
        ...acceptance,
        assignedAt: new Date(now - 58 * 60_000).toISOString(),
        deadlineAt: new Date(now + 1500).toISOString(),
      },
    });
    const recovered = job({
      state: "supplier_assigned",
      payoutMilestones: [],
      shopAcceptance: { ...open.shopAcceptance!, status: "timed_out" },
      shopRecovery: { id: "e1", status: "awaiting_client" },
    });
    getOrderMock.mockResolvedValueOnce(open).mockResolvedValue(recovered);

    render(<SupplierJobDetailPage />);
    expect(await screen.findByRole("button", { name: "Accept job" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.queryByRole("button", { name: "Accept job" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Decline" })).not.toBeInTheDocument();
    expect(await screen.findByText("The hour to answer ran out")).toBeInTheDocument();
    expect(screen.getByText(/another vetted shop or a full refund/)).toBeInTheDocument();
    expect(getOrderMock.mock.calls.length).toBeGreaterThan(1);
  });
});
