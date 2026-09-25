// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Order, PayoutMilestone } from "@/lib/api/types";

const { getOrderMock, transitionOrderMock, uploadMock, attachMock } = vi.hoisted(() => ({
  getOrderMock: vi.fn(),
  transitionOrderMock: vi.fn(),
  uploadMock: vi.fn(),
  attachMock: vi.fn(),
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
  return {
    ...actual,
    getOrder: getOrderMock,
    transitionOrder: transitionOrderMock,
    uploadFulfilmentProof: uploadMock,
    attachFulfilmentProof: attachMock,
  };
});

import SupplierJobDetailPage from "@/app/supplier/jobs/[id]/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function milestone(
  code: PayoutMilestone["code"],
  status: PayoutMilestone["status"],
): PayoutMilestone {
  return {
    code,
    sharePercent: 25,
    status,
    pofFileIds: status === "pending_pof" ? [] : ["file-1"],
  };
}

function productionJob(milestones: PayoutMilestone[]): Order {
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
    payoutMilestones: milestones,
  } as Order;
}

describe("supplier production proofs", () => {
  it("files printing proof without moving the order", async () => {
    const user = userEvent.setup();
    const open = productionJob([
      milestone("printing", "pending_pof"),
      milestone("packaging_qc", "pending_pof"),
    ]);
    const afterPrint = productionJob([
      milestone("printing", "pof_attached"),
      milestone("packaging_qc", "pending_pof"),
    ]);
    getOrderMock.mockResolvedValueOnce(open).mockResolvedValueOnce(afterPrint);
    uploadMock.mockResolvedValue({ fileId: "file-print" });
    attachMock.mockResolvedValue({ file: { fileId: "file-print" }, order: afterPrint });

    render(<SupplierJobDetailPage />);

    expect(await screen.findByRole("button", { name: "Add printing proof" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Package for pickup" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add printing proof" }));
    expect(transitionOrderMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "File this evidence" })).toBeDisabled();

    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    await user.upload(input, new File(["photo"], "print.jpg", { type: "image/jpeg" }));

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    const uploaded = uploadMock.mock.calls[0][0] as File;
    expect(uploaded.name).toBe("print.jpg");
    expect(uploadMock.mock.invocationCallOrder[0]).toBeLessThan(
      attachMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );

    const fileEvidence = await screen.findByRole("button", { name: "File this evidence" });
    await waitFor(() => expect(fileEvidence).toBeEnabled());
    await user.click(fileEvidence);

    await waitFor(() => {
      expect(attachMock).toHaveBeenCalledWith("file-print", "job-1", "printing");
    });
    expect(transitionOrderMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Add packaging proof" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Package for pickup" })).not.toBeInTheDocument();
    expect(screen.getByText(/GRIDGO has your printing evidence/)).toBeInTheDocument();
  });

  it("packages for pickup only after both shop proofs are filed", async () => {
    const user = userEvent.setup();
    const ready = productionJob([
      milestone("printing", "pof_attached"),
      milestone("packaging_qc", "pof_attached"),
    ]);
    getOrderMock.mockResolvedValue(ready);
    transitionOrderMock.mockResolvedValue({ ...ready, state: "ready_for_dispatch" });

    render(<SupplierJobDetailPage />);

    await user.click(await screen.findByRole("button", { name: "Package for pickup" }));

    await waitFor(() => {
      expect(transitionOrderMock).toHaveBeenCalledWith("job-1", "ready_for_dispatch", {
        note: "Packaging ready — packed and staged for joint pickup checks with the rider",
      });
    });
    expect(uploadMock).not.toHaveBeenCalled();
    expect(attachMock).not.toHaveBeenCalled();
  });
});
