// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { Order, ProductionProgress } from "@/lib/api/types";
import { escrowStages, proofOnFile } from "@/test/payout-plans";

const mocks = vi.hoisted(() => ({
  getOrder: vi.fn(),
  transitionOrder: vi.fn(),
  uploadPhoto: vi.fn(),
  attachPhoto: vi.fn(),
  downloadUrl: vi.fn(),
}));

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "job-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    getOrder: mocks.getOrder,
    transitionOrder: mocks.transitionOrder,
    uploadProductionPhoto: mocks.uploadPhoto,
    attachProductionPhoto: mocks.attachPhoto,
    getFileDownloadUrl: mocks.downloadUrl,
  };
});

import SupplierJobDetailPage from "@/app/supplier/jobs/[id]/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const WAITING: ProductionProgress = { status: "waiting_for_photo", photos: [] };

function job(extra: Partial<Order> = {}): Order {
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
    createdAt: "2026-09-28T00:00:00.000Z",
    updatedAt: "2026-09-28T00:00:00.000Z",
    timeline: [],
    payoutPlanVersion: 2,
    // The start proof is on file, but as a PDF: it pays, it does not count.
    payoutMilestones: escrowStages({ production_started: proofOnFile("file_pdf") }),
    productionProgress: WAITING,
    ...extra,
  } as Order;
}

const withPhoto = (url: string | null, expiresAt?: string): Order =>
  job({
    productionProgress: {
      status: "photos_available",
      photos: [
        {
          fileId: "file_photo",
          contentType: "image/jpeg",
          at: "2026-09-28T08:00:00.000Z",
          downloadUrl: url,
          downloadUrlExpiresAt: expiresAt ?? "2999-01-01T00:00:00.000Z",
        },
      ],
    },
  });

describe("a job with no progress photo", () => {
  it("shows the waiting frame and asks for a photo instead of packing", async () => {
    mocks.getOrder.mockResolvedValue(job());
    render(<SupplierJobDetailPage />);

    expect(
      await screen.findByRole("button", { name: "Add a progress photo" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Package for pickup" })).toBeNull();
    const section = screen.getByRole("region", { name: "Progress photos" });
    expect(within(section).getByText("Waiting for a progress photo")).toBeInTheDocument();
    expect(within(section).getByText(/Once one photo of this job is here/)).toBeInTheDocument();
    expect(screen.getByText(/a PDF does not/)).toBeInTheDocument();
  });

  it("uploads a production_photo, attaches it to the order, then offers packing", async () => {
    const user = userEvent.setup();
    const after = withPhoto("https://files.test/photo.jpg");
    mocks.getOrder.mockResolvedValueOnce(job()).mockResolvedValueOnce(after);
    mocks.uploadPhoto.mockResolvedValue({ fileId: "file_photo" });
    mocks.attachPhoto.mockResolvedValue({ file: { fileId: "file_photo" } });

    render(<SupplierJobDetailPage />);
    await user.click(await screen.findByRole("button", { name: "Add a progress photo" }));
    const dialog = await screen.findByRole("dialog", { name: "Progress photo" });
    expect(within(dialog).getByText(/The client sees this photo/)).toBeInTheDocument();

    await user.upload(
      within(dialog).getByLabelText("Progress photo file"),
      new File(["jpeg"], "floor.jpg", { type: "image/jpeg" }),
    );
    const send = within(dialog).getByRole("button", { name: "Send photo" });
    await waitFor(() => expect(send).toBeEnabled());
    await user.click(send);

    await waitFor(() => expect(mocks.attachPhoto).toHaveBeenCalledWith("file_photo", "job-1"));
    expect(mocks.transitionOrder).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Package for pickup" })).toBeInTheDocument();
    expect(screen.getByText(/Photo sent\. The client can see it/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open progress photo 1/ })).toBeInTheDocument();
  });

  it("refreshes the order when the job moved on before the photo was attached", async () => {
    const user = userEvent.setup();
    mocks.getOrder
      .mockResolvedValueOnce(job())
      .mockResolvedValue(job({ state: "ready_for_dispatch" }));
    mocks.uploadPhoto.mockResolvedValue({ fileId: "file_photo" });
    mocks.attachPhoto.mockRejectedValue(
      new ApiError(409, { error: "production_photo_upload_not_allowed" }),
    );

    render(<SupplierJobDetailPage />);
    await user.click(await screen.findByRole("button", { name: "Add a progress photo" }));
    const dialog = await screen.findByRole("dialog");
    await user.upload(
      within(dialog).getByLabelText("Progress photo file"),
      new File(["jpeg"], "floor.jpg", { type: "image/jpeg" }),
    );
    const send = within(dialog).getByRole("button", { name: "Send photo" });
    await waitFor(() => expect(send).toBeEnabled());
    await user.click(send);

    expect(await screen.findByText(/no longer takes progress photos/)).toBeInTheDocument();
    expect(mocks.getOrder).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("the API refusing to pack", () => {
  it("explains the missing photo and offers the upload", async () => {
    const user = userEvent.setup();
    // The screen believed a photo existed; the server disagrees.
    mocks.getOrder.mockResolvedValue(withPhoto("https://files.test/photo.jpg"));
    mocks.transitionOrder.mockRejectedValue(
      new ApiError(409, { error: "production_photo_required" }),
    );

    render(<SupplierJobDetailPage />);
    await user.click(await screen.findByRole("button", { name: "Package for pickup" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Add a progress photo before packing this job/);
    await user.click(within(alert).getByRole("button", { name: "Add a progress photo" }));
    expect(await screen.findByRole("dialog", { name: "Progress photo" })).toBeInTheDocument();
  });
});

describe("the gallery", () => {
  it("shows a photo from its signed link", async () => {
    mocks.getOrder.mockResolvedValue(withPhoto("https://files.test/signed.jpg"));
    render(<SupplierJobDetailPage />);

    const open = await screen.findByRole("button", { name: /Open progress photo 1/ });
    expect(open.querySelector("img")).toHaveAttribute("src", "https://files.test/signed.jpg");
    expect(mocks.downloadUrl).not.toHaveBeenCalledWith("file_photo");
  });

  it("fetches a fresh link when the signed one expired or is missing", async () => {
    mocks.getOrder.mockResolvedValue(
      withPhoto("https://files.test/stale.jpg", "2000-01-01T00:00:00.000Z"),
    );
    mocks.downloadUrl.mockResolvedValue("https://files.test/fresh.jpg");
    render(<SupplierJobDetailPage />);

    const open = await screen.findByRole("button", { name: /Open progress photo 1/ });
    expect(mocks.downloadUrl).toHaveBeenCalledWith("file_photo");
    expect(open.querySelector("img")).toHaveAttribute("src", "https://files.test/fresh.jpg");
  });

  it("is not shown at all against an API that predates it", async () => {
    mocks.getOrder.mockResolvedValue(job({ productionProgress: undefined }));
    render(<SupplierJobDetailPage />);

    expect(await screen.findByRole("button", { name: "Package for pickup" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Progress photos" })).toBeNull();
  });
});
