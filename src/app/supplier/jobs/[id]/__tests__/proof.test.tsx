// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { Order, PayoutMilestone } from "@/lib/api/types";
import { escrowStages, proofOnFile, released } from "@/test/payout-plans";

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
    getFile: async (fileId: string) => ({
      fileId,
      originalFilename: `${fileId}.jpg`,
      declaredContentType: "image/jpeg",
      detectedContentType: "image/jpeg",
      state: "ready",
    }),
    getFileDownloadUrl: async (fileId: string) => `https://files.test/${fileId}`,
  };
});

import SupplierJobDetailPage from "@/app/supplier/jobs/[id]/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// jsdom has no object URLs; the dialog previews each chosen photo with one.
URL.createObjectURL = vi.fn(() => "blob:preview");
URL.revokeObjectURL = vi.fn();

function milestone(
  code: PayoutMilestone["code"],
  status: PayoutMilestone["status"],
): PayoutMilestone {
  return {
    code,
    sharePercent: 25,
    status,
    pofFileIds: status === "pending_pof" ? [] : [`file-${code}`],
  };
}

function productionJob(milestones: PayoutMilestone[], extra: Partial<Order> = {}): Order {
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
    ...extra,
  } as Order;
}

const escrowJob = (stages: PayoutMilestone[], extra: Partial<Order> = {}) =>
  productionJob(stages, { payoutPlanVersion: 2, ...extra });

const photo = (name: string) => new File([name], name, { type: "image/jpeg" });

function proofInput(): HTMLInputElement {
  return screen.getByLabelText(/proof photos$/) as HTMLInputElement;
}

describe("supplier production proofs", () => {
  it("files printing proof without moving the order", async () => {
    const user = userEvent.setup();
    const open = productionJob([
      milestone("printing", "pending_pof"),
      milestone("packaging_qc", "pending_pof"),
    ]);
    const afterPrint = productionJob([
      { ...milestone("printing", "pof_attached"), pofFileIds: ["file-print"] },
      milestone("packaging_qc", "pending_pof"),
    ]);
    getOrderMock.mockResolvedValue(open);
    uploadMock.mockResolvedValue({ fileId: "file-print" });
    attachMock.mockResolvedValue({ file: { fileId: "file-print" }, order: afterPrint });

    render(<SupplierJobDetailPage />);

    expect(await screen.findByRole("button", { name: "Add printing proof" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Package for pickup" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add printing proof" }));
    expect(transitionOrderMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "Printing proof" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "File photos" })).toBeDisabled();

    await user.upload(proofInput(), photo("print.jpg"));

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    expect((uploadMock.mock.calls[0][0] as File).name).toBe("print.jpg");
    // Uploading files nothing: the shop presses File.
    expect(attachMock).not.toHaveBeenCalled();

    await user.click(await screen.findByRole("button", { name: "File 1 photo" }));

    await waitFor(() => {
      expect(attachMock).toHaveBeenCalledWith("file-print", "job-1", "printing");
    });
    expect(transitionOrderMock).not.toHaveBeenCalled();
    // Everything filed as new: the dialog closes and says what happened.
    expect(await screen.findByRole("button", { name: "Add packaging proof" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Printing proof" })).toBeNull();
    expect(screen.getByText(/1 photo filed as your printing proof/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Package for pickup" })).toBeInTheDocument();
  });

  it("packages while a payout proof is still open", async () => {
    const user = userEvent.setup();
    const open = productionJob([
      milestone("printing", "pending_pof"),
      milestone("packaging_qc", "pending_pof"),
    ]);
    getOrderMock.mockResolvedValue(open);
    transitionOrderMock.mockResolvedValue({ ...open, state: "ready_for_dispatch" });

    render(<SupplierJobDetailPage />);
    await user.click(await screen.findByRole("button", { name: "Package for pickup" }));

    await waitFor(() => {
      expect(transitionOrderMock).toHaveBeenCalledWith("job-1", "ready_for_dispatch", {
        note: "Packaging ready — packed and staged for joint pickup checks with the rider",
      });
    });
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

describe("supplier production proof on an escrow-plan order", () => {
  it("files several start-of-production photos at once, one upload and one attach each", async () => {
    const user = userEvent.setup();
    const open = escrowJob(escrowStages());
    const withProofs = (ids: string[]) =>
      escrowJob(escrowStages({ production_started: { status: "pof_attached", pofFileIds: ids } }));
    getOrderMock.mockResolvedValue(open);
    uploadMock
      .mockResolvedValueOnce({ fileId: "f1" })
      .mockResolvedValueOnce({ fileId: "f2" })
      .mockResolvedValueOnce({ fileId: "f3" });
    attachMock
      .mockResolvedValueOnce({ file: {}, order: withProofs(["f1"]) })
      .mockResolvedValueOnce({ file: {}, order: withProofs(["f1", "f2"]) })
      .mockResolvedValueOnce({ file: {}, order: withProofs(["f1", "f2", "f3"]) });

    render(<SupplierJobDetailPage />);

    await user.click(
      await screen.findByRole("button", { name: "Add start-of-production proof" }),
    );
    expect(await screen.findByRole("heading", { name: "Start of production proof" })).toBeInTheDocument();
    expect(screen.getByText(/first finished sheets/)).toBeInTheDocument();
    expect(screen.getByText(/You can add up to 50 more/)).toBeInTheDocument();

    await user.upload(proofInput(), [photo("a.jpg"), photo("b.jpg"), photo("c.jpg")]);

    // One at a time, in the order chosen.
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(3));
    expect(uploadMock.mock.calls.map(([file]) => (file as File).name)).toEqual([
      "a.jpg",
      "b.jpg",
      "c.jpg",
    ]);
    await user.click(await screen.findByRole("button", { name: "File 3 photos" }));

    await waitFor(() => expect(attachMock).toHaveBeenCalledTimes(3));
    expect(attachMock.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ["f1", "job-1", "production_started"],
      ["f2", "job-1", "production_started"],
      ["f3", "job-1", "production_started"],
    ]);
    expect(transitionOrderMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Package for pickup" })).toBeInTheDocument();
    expect(
      screen.getByText(/3 photos filed as your start-of-production proof/),
    ).toBeInTheDocument();
    // Every proof on file, once, with the count.
    const payout = screen.getByRole("heading", { name: "Your payout" }).closest("section")!;
    expect(within(payout).getByText("3 proofs on file")).toBeInTheDocument();
    for (const n of [1, 2, 3]) {
      expect(
        await within(payout).findByRole("button", {
          name: `Open start of production proof ${n}`,
        }),
      ).toBeInTheDocument();
    }
    // The payout card counts the order's own three parts.
    expect(screen.getByText(/^3 parts of your own price/)).toBeInTheDocument();
    expect(screen.queryByText(/four parts|10% retention|first 50%/i)).toBeNull();
  });

  it("adds to a released stage and says a repeat is already on file", async () => {
    const user = userEvent.setup();
    const paid = escrowJob(escrowStages({ production_started: released("file-a") }));
    const stillOne = paid;
    const two = escrowJob(
      escrowStages({
        production_started: { ...released("file-a"), pofFileIds: ["file-a", "file-new"] },
      }),
    );
    getOrderMock.mockResolvedValue(paid);
    uploadMock
      .mockResolvedValueOnce({ fileId: "file-again" })
      .mockResolvedValueOnce({ fileId: "file-new" });
    attachMock
      .mockResolvedValueOnce({ file: {}, order: stillOne })
      .mockResolvedValueOnce({ file: {}, order: two });

    render(<SupplierJobDetailPage />);

    await user.click(await screen.findByRole("button", { name: "Add more proof photos" }));
    expect(screen.getByText(/already released; more photos are kept with its proof/)).toBeInTheDocument();
    await user.upload(proofInput(), [photo("again.jpg"), photo("new.jpg")]);
    await user.click(await screen.findByRole("button", { name: "File 2 photos" }));

    await waitFor(() => expect(attachMock).toHaveBeenCalledTimes(2));
    const rows = screen.getByRole("list", { name: "Photos to file" });
    expect(
      await within(rows).findByText(/Already on file\. The same picture is not added twice/),
    ).toBeInTheDocument();
    expect(within(rows).getByText("Filed")).toBeInTheDocument();
    // A repeat stays on screen to be read; Done closes.
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByText(/1 photo added to your start-of-production proof/)).toBeInTheDocument();
    expect(screen.getByText("2 proofs on file")).toBeInTheDocument();
  });

  it("stops at the stage's limit and files nothing after it", async () => {
    const user = userEvent.setup();
    const job = escrowJob(escrowStages({ production_started: proofOnFile("file-a") }));
    getOrderMock.mockResolvedValue(job);
    uploadMock
      .mockResolvedValueOnce({ fileId: "f1" })
      .mockResolvedValueOnce({ fileId: "f2" });
    attachMock.mockRejectedValueOnce(
      new ApiError(409, {
        error: "proof_limit_reached",
        milestoneCode: "production_started",
        maxProofs: 50,
      }),
    );

    render(<SupplierJobDetailPage />);

    await user.click(await screen.findByRole("button", { name: "Add more proof photos" }));
    await user.upload(proofInput(), [photo("one.jpg"), photo("two.jpg")]);
    await user.click(await screen.findByRole("button", { name: "File 2 photos" }));

    await waitFor(() =>
      expect(screen.getAllByText(/This stage has 50 proof photos, the most it takes/)).toHaveLength(2),
    );
    expect(attachMock).toHaveBeenCalledTimes(1);
    // The stage is full: trying again would be refused the same way.
    expect(screen.queryByRole("button", { name: /^Try .* again$/ })).toBeNull();
  });

  it("says why an upload failed and tries that photo again", async () => {
    const user = userEvent.setup();
    const job = escrowJob(escrowStages());
    const after = escrowJob(escrowStages({ production_started: proofOnFile("f1") }));
    getOrderMock.mockResolvedValue(job);
    uploadMock
      .mockRejectedValueOnce(new ApiError(413, { error: "file_too_large", maxMiB: 200 }))
      .mockResolvedValueOnce({ fileId: "f1" });
    attachMock.mockResolvedValue({ file: {}, order: after });

    render(<SupplierJobDetailPage />);

    await user.click(
      await screen.findByRole("button", { name: "Add start-of-production proof" }),
    );
    await user.upload(proofInput(), photo("huge.jpg"));
    expect(await screen.findByText(/larger than 200 MB/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "File photos" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Try huge.jpg again" }));
    await user.click(await screen.findByRole("button", { name: "File 1 photo" }));
    await waitFor(() => expect(attachMock).toHaveBeenCalledWith("f1", "job-1", "production_started"));
  });

  it("draws a proof picture once, under Your payout, not again among progress photos", async () => {
    const shot = (fileId: string, at: string) => ({
      fileId,
      contentType: "image/jpeg",
      at,
      downloadUrl: `https://files.test/${fileId}`,
      downloadUrlExpiresAt: "2999-01-01T00:00:00Z",
    });
    getOrderMock.mockResolvedValue(
      escrowJob(escrowStages({ production_started: proofOnFile("f-proof") }), {
        productionProgress: {
          status: "photos_available",
          photos: [shot("f-proof", "2026-10-16T01:00:00Z"), shot("f-floor", "2026-10-16T02:00:00Z")],
        },
      }),
    );

    render(<SupplierJobDetailPage />);

    const progress = (await screen.findByRole("heading", { name: "Progress photos" })).closest(
      "section",
    )!;
    expect(within(progress).getByText(/1 progress photo on this job/)).toBeInTheDocument();
    expect(within(progress).getByText(/Your proof photo is under Your payout/)).toBeInTheDocument();
    const tile = within(progress).getByRole("button", { name: /Open progress photo 1/ });
    expect(tile.querySelector("img")).toHaveAttribute("src", "https://files.test/f-floor");
    expect(within(progress).queryByRole("button", { name: /Open progress photo 2/ })).toBeNull();

    const payout = screen.getByRole("heading", { name: "Your payout" }).closest("section")!;
    expect(
      await within(payout).findByRole("button", { name: "Open start of production proof 1" }),
    ).toBeInTheDocument();
  });

  it("keeps the rider's delivered proof read-only and a full stage closed", async () => {
    const full = Array.from({ length: 50 }, (_, i) => `p${i}`);
    getOrderMock.mockResolvedValue(
      escrowJob(
        escrowStages({
          production_started: { ...released(), pofFileIds: full },
          delivered: proofOnFile("file-rider"),
        }),
        { state: "delivered", riderId: "rider-1" },
      ),
    );

    render(<SupplierJobDetailPage />);

    const payout = (await screen.findByRole("heading", { name: "Your payout" })).closest(
      "section",
    )!;
    expect(within(payout).getByText("50 proofs on file")).toBeInTheDocument();
    expect(within(payout).getByText("1 proof on file")).toBeInTheDocument();
    expect(within(payout).getByRole("button", { name: "Show all 50" })).toBeInTheDocument();
    expect(
      await within(payout).findByRole("button", { name: "Open delivered proof 1" }),
    ).toBeInTheDocument();
    expect(within(payout).queryByRole("button", { name: /Add (more )?proof photos/ })).toBeNull();
    expect(within(payout).getByText(/This stage has 50 proof photos/)).toBeInTheDocument();
  });
});
