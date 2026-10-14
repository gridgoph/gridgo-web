// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { Order, ProductionProgress, TransitionRequirement } from "@/lib/api/types";
import { escrowStages, proofOnFile } from "@/test/payout-plans";

const mocks = vi.hoisted(() => ({
  getOrder: vi.fn(),
  transitionOrder: vi.fn(),
  uploadPacking: vi.fn(),
  attachPacking: vi.fn(),
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
    uploadPackingPhoto: mocks.uploadPacking,
    attachPackingPhoto: mocks.attachPacking,
    getFileDownloadUrl: mocks.downloadUrl,
  };
});

import SupplierJobDetailPage from "@/app/supplier/jobs/[id]/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const PRODUCTION_PHOTO: TransitionRequirement = {
  code: "production_photo_required",
  message:
    "Attach at least one production progress photo before marking this job packed or ready for dispatch. A start-of-production photo counts.",
};
const PACKING_PHOTO: TransitionRequirement = {
  code: "packing_photo_required",
  message:
    "Add a photo of the finished prints packed and ready before marking Ready for dispatch.",
};
const CLAIM: TransitionRequirement = {
  code: "claim_hold_active",
  message:
    "This order cannot be packaged for pickup while a claim holds payouts. Operations must clear the claim first.",
};

const PHOTOS: ProductionProgress = {
  status: "photos_available",
  photos: [
    {
      fileId: "file_photo",
      contentType: "image/jpeg",
      at: "2026-10-15T01:00:00.000Z",
      downloadUrl: "https://files.test/photo",
      downloadUrlExpiresAt: "2999-01-01T00:00:00.000Z",
    },
  ],
};
const WAITING: ProductionProgress = { status: "waiting_for_photo", photos: [] };

function job(missing: TransitionRequirement[], extra: Partial<Order> = {}): Order {
  return {
    id: "job-1",
    clientId: "c1",
    supplierId: "user_supplier",
    riderId: null,
    state: "production",
    title: "Flyers A5",
    deadline: null,
    address: "Somewhere",
    deliveryFeeMinor: 0,
    totalMinor: 0,
    paymentMethod: null,
    paymentStatus: "unpaid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-10-15T00:00:00.000Z",
    updatedAt: "2026-10-15T00:00:00.000Z",
    timeline: [],
    payoutPlanVersion: 2,
    payoutMilestones: escrowStages({ production_started: proofOnFile("file_photo") }),
    productionProgress: missing.includes(PRODUCTION_PHOTO) ? WAITING : PHOTOS,
    packingProgress: missing.includes(PACKING_PHOTO) ? WAITING : PHOTOS,
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
  return screen.getByRole("region", { name: "Before it can be packaged" });
}

describe("before it can be packaged (report 6C695C15)", () => {
  it("ticks the production photo, asks for the packing photo, and keeps the receipt optional", async () => {
    mocks.getOrder.mockResolvedValue(job([PACKING_PHOTO]));
    render(<SupplierJobDetailPage />);

    expect(await screen.findByText("1 of 2 photos on the job.")).toBeVisible();
    const list = within(checklist());
    expect(list.getByText("Production photo")).toBeVisible();
    expect(list.getByText(PACKING_PHOTO.message)).toBeVisible();
    expect(list.getByText("Not needed. It never holds up packing.")).toBeVisible();
    expect(list.getByText("Optional")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add a packing photo" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Package for pickup" }),
    ).not.toBeInTheDocument();
  });

  it("uploads a packing_photo, attaches it to the order, then offers packaging", async () => {
    mocks.getOrder.mockResolvedValueOnce(job([PACKING_PHOTO])).mockResolvedValue(job([]));
    mocks.uploadPacking.mockResolvedValue({ fileId: "file_packed" });
    mocks.attachPacking.mockResolvedValue({ file: { fileId: "file_packed" } });
    const user = userEvent.setup();
    render(<SupplierJobDetailPage />);

    await user.click(await screen.findByRole("button", { name: "Add a packing photo" }));
    const dialog = await screen.findByRole("dialog", { name: "Packing photo" });
    await user.upload(
      within(dialog).getByLabelText("Packing photo file"),
      new File(["x"], "packed.jpg", { type: "image/jpeg" }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Send photo" }));

    await waitFor(() =>
      expect(mocks.attachPacking).toHaveBeenCalledWith("file_packed", "job-1"),
    );
    expect(mocks.uploadPacking).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(
        "Packing photo sent. The client has been told their order is packed.",
      ),
    ).toBeVisible();
    expect(
      await screen.findByRole("button", { name: "Package for pickup" }),
    ).toBeEnabled();
    expect(
      within(checklist()).getByText(/Everything GRIDGO needs is on the job/),
    ).toBeVisible();
  });

  it("holds packaging on a claim with GRIDGO's sentence and a way to Operations", async () => {
    mocks.getOrder.mockResolvedValue(job([CLAIM]));
    render(<SupplierJobDetailPage />);

    const pack = await screen.findByRole("button", { name: "Package for pickup" });
    expect(pack).toBeDisabled();
    expect(pack).toHaveAccessibleDescription(expect.stringContaining(CLAIM.message));
    const list = within(checklist());
    expect(list.getByText("Client claim open")).toBeVisible();
    expect(list.getByText("Waiting on Operations")).toBeVisible();
    expect(list.getByText("Message Operations").closest("a")).toHaveAttribute(
      "href",
      "/supplier/chat",
    );
  });

  it("shows GRIDGO's own reason when a step the checklist allowed is refused", async () => {
    mocks.getOrder.mockResolvedValueOnce(job([])).mockResolvedValue(job([PACKING_PHOTO]));
    mocks.transitionOrder.mockRejectedValue(
      new ApiError(409, {
        error: "packing_photo_required",
        message: PACKING_PHOTO.message,
        missing: [PACKING_PHOTO],
      }),
    );
    const user = userEvent.setup();
    render(<SupplierJobDetailPage />);

    await user.click(await screen.findByRole("button", { name: "Package for pickup" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(PACKING_PHOTO.message);
    expect(alert).not.toHaveTextContent(/Could not update this job/);
    // The reload brings the checklist back with the photo it asked for.
    expect(await screen.findByText("1 of 2 photos on the job.")).toBeVisible();
  });

  it("never shows a bare code the API sent as its message", async () => {
    mocks.getOrder.mockResolvedValue(
      job([{ code: "claim_hold_active", message: "claim_hold_active" }]),
    );
    render(<SupplierJobDetailPage />);
    expect(
      await within(
        await screen.findByRole("region", { name: "Before it can be packaged" }),
      ).findByText(/Operations must clear the claim before you package it for pickup/),
    ).toBeVisible();
    expect(screen.queryByText("claim_hold_active")).not.toBeInTheDocument();
  });
});

describe("job details and updates", () => {
  it("reads Material, Zone and Promised from jobDetails, with Not specified for a gap", async () => {
    mocks.getOrder.mockResolvedValue(
      job([], {
        material: "",
        zone: null,
        jobDetails: {
          material: "Coated paper",
          zone: "Not specified",
          promisedDate: "2026-10-20T03:00:00.000Z",
          missing: ["zone"],
        },
      }),
    );
    render(<SupplierJobDetailPage />);
    const spec = await screen.findByRole("region", { name: "Spec" });
    expect(within(spec).getByText("Coated paper")).toBeVisible();
    expect(within(spec).getByText("Not specified")).toHaveClass("text-text-muted");
    expect(
      within(spec).queryByText("Promised")?.nextElementSibling,
    ).not.toHaveTextContent("Not specified");
  });

  it("draws a supplier timeline that names no one, and never a payout code", async () => {
    mocks.getOrder.mockResolvedValue(
      job([], {
        timeline: [
          {
            at: "2026-10-15T01:00:00.000Z",
            state: "production",
            note: "Proof filed for production_started",
          },
        ] as Order["timeline"],
      }),
    );
    render(<SupplierJobDetailPage />);
    const timeline = await screen.findByRole("region", { name: "Timeline" });
    expect(
      within(timeline).getAllByText("Proof filed for Start of production").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/production_started/)).not.toBeInTheDocument();
    expect(within(timeline).queryByText(/GRIDGO/)).not.toBeInTheDocument();
  });
});
