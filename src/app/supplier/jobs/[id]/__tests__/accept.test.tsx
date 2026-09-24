// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Order } from "@/lib/api/types";
import { formatDateTime, formatPhp } from "@/lib/format";

const { getOrderMock, transitionOrderMock } = vi.hoisted(() => ({
  getOrderMock: vi.fn(),
  transitionOrderMock: vi.fn(),
}));

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "job-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return { ...actual, getOrder: getOrderMock, transitionOrder: transitionOrderMock };
});

import SupplierJobDetailPage from "@/app/supplier/jobs/[id]/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function assignedJob(partial: Partial<Order> = {}): Order {
  return {
    id: "job-1",
    clientId: "c1",
    supplierId: "user_supplier",
    riderId: null,
    state: "supplier_assigned",
    title: "Tarpaulin run",
    deadline: "2026-10-01T08:00:00.000Z",
    address: "Somewhere",
    deliveryFeeMinor: 0,
    totalMinor: 0,
    paymentMethod: null,
    paymentStatus: "unpaid",
    promisedDate: "2026-09-28T08:00:00.000Z",
    readyBy: "2026-09-25T08:00:00.000Z",
    supplierSubtotalMinor: 150000,
    supplierPriceMinor: 99900,
    artworkName: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    timeline: [],
    ...partial,
  } as Order;
}

describe("supplier assigned job accept", () => {
  it("confirms the job without asking for a price or a date", async () => {
    const user = userEvent.setup();
    const job = assignedJob();
    getOrderMock.mockResolvedValue(job);
    transitionOrderMock.mockResolvedValue({ ...job, state: "payment_authorized" });

    render(<SupplierJobDetailPage />);

    const accept = await screen.findByRole("button", { name: "Accept job" });
    expect(screen.queryByText("Your price (₱)")).not.toBeInTheDocument();
    expect(screen.queryByText(/Promise it by/)).not.toBeInTheDocument();
    expect(screen.queryByText("Accept and set price")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /Your shop commits to this job at the price already on your board/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(`Price: ${formatPhp(150000)}`)).toBeInTheDocument();
    expect(
      screen.getByText(`Date: ${formatDateTime("2026-09-25T08:00:00.000Z")}`),
    ).toBeInTheDocument();

    await user.click(accept);

    await waitFor(() => {
      expect(transitionOrderMock).toHaveBeenCalledWith("job-1", "payment_authorized", {
        note: "Accepted",
      });
    });
    const extra = transitionOrderMock.mock.calls[0][2] as Record<string, unknown>;
    expect(extra).not.toHaveProperty("supplierPriceMinor");
    expect(extra).not.toHaveProperty("supplierSubtotalMinor");
    expect(extra).not.toHaveProperty("promisedDate");
  });

  it("opens decline confirmation and does not accept", async () => {
    const user = userEvent.setup();
    getOrderMock.mockResolvedValue(assignedJob());

    render(<SupplierJobDetailPage />);

    await user.click(await screen.findByRole("button", { name: "Decline" }));

    expect(await screen.findByRole("heading", { name: "Decline this job?" })).toBeInTheDocument();
    expect(transitionOrderMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Your price (₱)")).not.toBeInTheDocument();
  });
});
