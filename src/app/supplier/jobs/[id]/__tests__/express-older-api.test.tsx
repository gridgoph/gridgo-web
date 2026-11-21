// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { Order, TransitionRequirement } from "@/lib/api/types";
import { escrowStages, proofOnFile } from "@/test/payout-plans";

const mocks = vi.hoisted(() => ({
  getOrder: vi.fn(),
  transitionOrder: vi.fn(),
  uploadFinished: vi.fn(),
  attachFinished: vi.fn(),
  submitFinished: vi.fn(),
  downloadUrl: vi.fn(),
}));

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "job-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));

vi.mock("@/lib/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    getOrder: mocks.getOrder,
    transitionOrder: mocks.transitionOrder,
    uploadFinishedProductPhoto: mocks.uploadFinished,
    attachFinishedProductPhoto: mocks.attachFinished,
    submitFinishedProducts: mocks.submitFinished,
    getFileDownloadUrl: mocks.downloadUrl,
  };
});

import SupplierJobDetailPage from "@/app/supplier/jobs/[id]/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const FINISHED: TransitionRequirement = {
  code: "production_finished_required",
  message: "Submit photos of the finished, unpacked products for GRIDGO review first.",
};
const REVIEW: TransitionRequirement = {
  code: "production_review_required",
  message:
    "Wait for GRIDGO to approve the finished-product photos before calling a rider. Do not pack yet.",
};

const SUBMISSION = {
  at: "2026-10-16T05:10:00.000Z",
  by: "user_supplier",
  supplierId: "user_supplier",
  photoFileIds: ["file_f1"],
};

/** An Express job the older API still gates like a regular rider-packs job. */
function job(extra: Partial<Order> = {}, missing = [FINISHED, REVIEW]): Order {
  return {
    id: "job-1",
    clientId: "c1",
    supplierId: "user_supplier",
    riderId: null,
    state: "production",
    title: "Document printing",
    deadline: null,
    address: "Somewhere",
    deliveryFeeMinor: 0,
    totalMinor: 0,
    paymentMethod: null,
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-10-16T04:00:00.000Z",
    updatedAt: "2026-10-16T04:00:00.000Z",
    timeline: [],
    payoutPlanVersion: 2,
    payoutMilestones: escrowStages({ production_started: proofOnFile("file_photo") }),
    handoverFlow: "rider_packs",
    shopHandover: {},
    productionProgress: {
      status: "photos_available",
      photos: [
        {
          fileId: "file_photo",
          contentType: "image/jpeg",
          at: "2026-10-16T04:52:00.000Z",
          downloadUrl: "https://files.test/photo",
          downloadUrlExpiresAt: "2999-01-01T00:00:00.000Z",
        },
      ],
    },
    packingProgress: { status: "waiting_for_photo", photos: [] },
    transitionReadiness: {
      ready_for_dispatch: {
        allowed: missing.length === 0,
        missing,
        receiptScan: { required: false, attached: false },
      },
    },
    // An Express document job on an API before gridgo-api#419.
    orderType: "express",
    fulfillmentMode: "pickup",
    shopAcceptance: {
      supplierId: "user_supplier",
      assignedAt: "2026-10-16T04:00:00.000Z",
      deadlineAt: "2026-10-16T04:05:00.000Z",
      workingMinutes: 5,
      status: "accepted",
    },
    expressOrder: {
      printSettings: [
        { fileId: "file_doc", pages: { printed: 4, total: 4 }, copies: 1, paper: "a4", colour: "bw", sides: "one" },
      ],
    },
    ...extra,
  } as Order;
}


describe("an Express job on an API that still gates it like a regular job", () => {
  it("keeps the shop's finished-work step, and finishes the job through it", async () => {
    // Accepted, not yet started: the card's It's ready runs first.
    const accepted = job({ state: "payment_authorized", transitionReadiness: null }, []);
    const gated = job();
    const sent = job(
      { state: "supplier_self_qc", shopHandover: { finished: SUBMISSION, review: null } },
      [REVIEW],
    );
    const approved = job(
      {
        state: "supplier_self_qc",
        shopHandover: {
          finished: SUBMISSION,
          review: { at: "2026-10-16T05:30:00.000Z", by: "ops1", decision: "approved", note: "" },
        },
      },
      [],
    );
    mocks.getOrder.mockResolvedValue(accepted);
    mocks.transitionOrder
      // The one-step jump is refused by the older API...
      .mockRejectedValueOnce(new ApiError(409, { error: "transition_not_allowed" }))
      // ...the press step goes through...
      .mockImplementationOnce(async () => {
        mocks.getOrder.mockResolvedValue(gated);
        return { ...accepted, state: "production" };
      })
      // ...and ready is refused until the finished work is reviewed.
      .mockRejectedValueOnce(
        new ApiError(409, { error: "production_finished_required", missing: [FINISHED, REVIEW] }),
      );
    const user = userEvent.setup();
    render(<SupplierJobDetailPage />);

    // A fresh Express job shows only its own card (the last test checks that).
    await user.click(await screen.findByRole("button", { name: /It's ready/ }));

    // The refusal brings back the step that finishes the job.
    const send = await screen.findByRole("button", { name: "Send finished work for review" });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Open the job/);
    expect(send).toBeEnabled();

    mocks.uploadFinished.mockResolvedValue({ fileId: "file_f1" });
    mocks.attachFinished.mockResolvedValue({ file: { fileId: "file_f1" } });
    mocks.submitFinished.mockResolvedValue(sent);
    await user.click(send);
    const dialog = await screen.findByRole("dialog");
    mocks.getOrder.mockResolvedValue(sent);
    await user.upload(
      within(dialog).getByLabelText("Photos of the finished work"),
      new File(["x"], "finished.jpg", { type: "image/jpeg" }),
    );
    await user.click(
      await within(dialog).findByRole("button", { name: "Send 1 photo for review" }),
    );
    await waitFor(() => expect(mocks.submitFinished).toHaveBeenCalledWith("job-1"));
    expect(await screen.findByText("Sent for review.")).toBeVisible();

    // GRIDGO approves; the regular Ready for rider pickup finishes it.
    cleanup();
    mocks.getOrder.mockResolvedValue(approved);
    mocks.transitionOrder.mockReset().mockResolvedValue({ ...approved, state: "ready_for_dispatch" });
    render(<SupplierJobDetailPage />);
    await user.click(await screen.findByRole("button", { name: "Ready for rider pickup" }));
    await waitFor(() =>
      expect(mocks.transitionOrder).toHaveBeenCalledWith(
        "job-1",
        "ready_for_dispatch",
        expect.objectContaining({ note: expect.stringMatching(/^Ready for rider pickup/) }),
      ),
    );
  });

  it("shows only the Express card where the API takes It's ready in one step", async () => {
    mocks.getOrder.mockResolvedValue(job({ state: "payment_authorized", transitionReadiness: null }, []));
    render(<SupplierJobDetailPage />);
    expect(await screen.findByRole("button", { name: /It's ready/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Send finished work/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Start production/ })).toBeNull();
  });
});
