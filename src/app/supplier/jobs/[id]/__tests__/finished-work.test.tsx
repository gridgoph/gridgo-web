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

/** The reported order: rider-packs, in production, a progress photo, nothing sent. */
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
    ...extra,
  } as Order;
}

function checklist(): HTMLElement {
  return screen.getByRole("region", { name: "Before a rider is called" });
}

/** The status chip. The Latest row repeats the current standing, so the bare text is not unique. */
function statusChip(label: string) {
  return screen.getAllByRole("status").find((el) => el.textContent?.trim() === label);
}

describe("the shop's finished work on a rider-packs job", () => {
  it("names the shop's own next step instead of 'Waiting on Operations' or a packing photo", async () => {
    mocks.getOrder.mockResolvedValue(job());
    render(<SupplierJobDetailPage />);

    const send = await screen.findByRole("button", { name: "Send finished work for review" });
    expect(send).toBeEnabled();
    const list = within(checklist());
    expect(list.getByText("Photos of the finished work")).toBeVisible();
    expect(list.getByText("Needed")).toBeVisible();
    expect(list.getByText("GRIDGO's review")).toBeVisible();
    expect(list.getByText("Not yet")).toBeVisible();
    // The reported screen ticked a packing photo that was never taken.
    expect(list.queryByText("Packing photo")).not.toBeInTheDocument();
    expect(screen.queryByText(/Waiting on Operations/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Package for pickup/ })).not.toBeInTheDocument();
  });

  it("stores each photo, puts it on the job, then asks GRIDGO to review it", async () => {
    mocks.getOrder.mockResolvedValue(job());
    mocks.uploadFinished.mockResolvedValue({ fileId: "file_f1" });
    mocks.attachFinished.mockResolvedValue({ file: { fileId: "file_f1" } });
    const sent = job(
      { state: "supplier_self_qc", shopHandover: { finished: SUBMISSION, review: null } },
      [REVIEW],
    );
    mocks.submitFinished.mockResolvedValue(sent);
    const user = userEvent.setup();
    render(<SupplierJobDetailPage />);

    await user.click(
      await screen.findByRole("button", { name: "Send finished work for review" }),
    );
    const dialog = await screen.findByRole("dialog");
    const sendButton = within(dialog).getByRole("button", { name: "Send for review" });
    expect(sendButton).toBeDisabled();

    mocks.getOrder.mockResolvedValue(sent);
    await user.upload(
      within(dialog).getByLabelText("Photos of the finished work"),
      new File(["x"], "finished.jpg", { type: "image/jpeg" }),
    );
    await user.click(
      await within(dialog).findByRole("button", { name: "Send 1 photo for review" }),
    );

    await waitFor(() => expect(mocks.submitFinished).toHaveBeenCalledWith("job-1"));
    expect(mocks.attachFinished).toHaveBeenCalledWith("file_f1", "job-1");
    expect(mocks.attachFinished.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.submitFinished.mock.invocationCallOrder[0],
    );
    expect(await screen.findByText("Sent for review.")).toBeVisible();
    expect(statusChip("GRIDGO reviewing")).toBeVisible();
    expect(within(checklist()).getByText("With GRIDGO")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Send finished work/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps the photos on the job and only asks again when the review request failed", async () => {
    mocks.getOrder.mockResolvedValue(job());
    mocks.uploadFinished.mockResolvedValue({ fileId: "file_f1" });
    mocks.attachFinished.mockResolvedValue({ file: { fileId: "file_f1" } });
    mocks.submitFinished
      .mockRejectedValueOnce(new ApiError(500, { error: "server_error" }))
      .mockResolvedValueOnce(
        job({ state: "supplier_self_qc", shopHandover: { finished: SUBMISSION } }, [REVIEW]),
      );
    const user = userEvent.setup();
    render(<SupplierJobDetailPage />);

    await user.click(
      await screen.findByRole("button", { name: "Send finished work for review" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.upload(
      within(dialog).getByLabelText("Photos of the finished work"),
      new File(["x"], "finished.jpg", { type: "image/jpeg" }),
    );
    await user.click(
      await within(dialog).findByRole("button", { name: "Send 1 photo for review" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /could not take the photos just now/,
    );
    expect(within(dialog).getByText("On the job")).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Send 1 photo for review" }));
    await waitFor(() => expect(mocks.submitFinished).toHaveBeenCalledTimes(2));
    expect(mocks.attachFinished).toHaveBeenCalledTimes(1);
  });

  it("shows GRIDGO's reason word for word after a send-back and asks for new photos", async () => {
    mocks.getOrder.mockResolvedValue(
      job({
        shopHandover: {
          finished: null,
          review: null,
          attempts: [
            {
              finished: SUBMISSION,
              review: {
                at: "2026-10-16T05:20:00.000Z",
                by: "ops1",
                decision: "rejected",
                note: "Page 12 is smudged. Reprint it and photograph the full run.",
              },
            },
          ],
        },
      }),
    );
    const user = userEvent.setup();
    render(<SupplierJobDetailPage />);

    const list = within(
      await screen.findByRole("region", { name: "Before a rider is called" }),
    );
    expect(list.getByText("Sent back")).toBeVisible();
    expect(
      list.getByText("Page 12 is smudged. Reprint it and photograph the full run."),
    ).toBeVisible();
    expect(statusChip("Needs a fix")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Send new photos for review" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Page 12 is smudged. Reprint it and photograph the full run."),
    ).toBeVisible();
  });

  it("offers Ready for rider pickup once approved, and says not to pack yet", async () => {
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
    mocks.getOrder.mockResolvedValue(approved);
    mocks.transitionOrder.mockResolvedValue({ ...approved, state: "ready_for_dispatch" });
    const user = userEvent.setup();
    render(<SupplierJobDetailPage />);

    const ready = await screen.findByRole("button", { name: "Ready for rider pickup" });
    expect(ready).toBeEnabled();
    expect(screen.getAllByText(/Do not pack yet; the rider checks the unpacked items first\./).length).toBeGreaterThan(0);
    await user.click(ready);
    await waitFor(() =>
      expect(mocks.transitionOrder).toHaveBeenCalledWith(
        "job-1",
        "ready_for_dispatch",
        expect.objectContaining({ note: expect.stringMatching(/^Ready for rider pickup/) }),
      ),
    );
  });
});
