// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { Order, PayoutMilestone } from "@/lib/api/types";

const { getOrderMock, transitionOrderMock, uploadMock } = vi.hoisted(() => ({
  getOrderMock: vi.fn(),
  transitionOrderMock: vi.fn(),
  uploadMock: vi.fn(),
}));

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "job-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")),
  getOrder: getOrderMock,
  transitionOrder: transitionOrderMock,
  uploadFulfilmentProof: uploadMock,
}));

import SupplierJobDetailPage from "@/app/supplier/jobs/[id]/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function milestone(code: string, status: PayoutMilestone["status"]): PayoutMilestone {
  return {
    code,
    sharePercent: 25,
    status,
    pofFileIds: status === "pending_pof" ? [] : ["file-1"],
  };
}

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
    ...patch,
  } as Order;
}

it("disables Package for pickup with the reason while a claim holds payouts", async () => {
  getOrderMock.mockResolvedValue(
    job({
      payoutHold: true,
      payoutMilestones: [
        milestone("printing", "pof_attached"),
        milestone("packaging_qc", "pof_attached"),
      ],
    }),
  );
  render(<SupplierJobDetailPage />);

  const pack = await screen.findByRole("button", { name: "Package for pickup" });
  expect(pack).toBeDisabled();
  expect(pack).toHaveAccessibleDescription(
    "A claim is holding payouts on this order. Operations must clear the claim before you package it for pickup.",
  );
  await userEvent.click(pack);
  expect(transitionOrderMock).not.toHaveBeenCalled();
});

it("explains a claim hold the API reports when packing", async () => {
  getOrderMock.mockResolvedValue(
    job({
      payoutMilestones: [
        milestone("printing", "pof_attached"),
        milestone("packaging_qc", "pof_attached"),
      ],
    }),
  );
  transitionOrderMock.mockRejectedValue(
    new ApiError(409, { error: "claim_hold_active" }),
  );
  render(<SupplierJobDetailPage />);

  await userEvent.click(
    await screen.findByRole("button", { name: "Package for pickup" }),
  );
  expect(
    await screen.findByText(
      /Operations must clear the claim before you package it for pickup/,
    ),
  ).toBeInTheDocument();
});

it("names the size limit when a proof is too large, not file storage", async () => {
  getOrderMock.mockResolvedValue(
    job({
      payoutMilestones: [
        milestone("printing", "pending_pof"),
        milestone("packaging_qc", "pending_pof"),
      ],
    }),
  );
  uploadMock.mockRejectedValue(
    new ApiError(413, {
      error: "file_too_large",
      purpose: "fulfilment_proof",
      maxBytes: 26214400,
      maxMiB: 25,
    }),
  );
  const user = userEvent.setup();
  render(<SupplierJobDetailPage />);

  await user.click(await screen.findByRole("button", { name: "Add printing proof" }));
  const input = document.querySelector("input[type=file]") as HTMLInputElement;
  await user.upload(input, new File(["x"], "huge.jpg", { type: "image/jpeg" }));

  expect(
    await screen.findByText(/larger than 25 MB, the limit for this upload/),
  ).toBeInTheDocument();
  expect(screen.queryByText(/File storage is unavailable/)).not.toBeInTheDocument();
});
