// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PayoutMilestones } from "@/components/orders/PayoutMilestones";
import type { Order, PayoutMilestone } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("@/components/orders/EvidencePreview", () => ({
  EvidencePlate: ({ fileId, label }: { fileId: string; label: string }) => (
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={label} src={`plate:${fileId}`} />
    </figure>
  ),
  EvidenceStrip: () => null,
}));
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
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
afterEach(cleanup);

function milestone(code: string, p: Partial<PayoutMilestone> = {}): PayoutMilestone {
  const share =
    { printing: 50, packaging_qc: 15, delivered: 25, retention: 10 }[code] ?? 25;
  return {
    code,
    sharePercent: share,
    amountMinor: share * 1000,
    status: "pending_pof",
    pofFileIds: [],
    releasedAt: null,
    releasedBy: null,
    ...p,
  };
}

function order(milestones: PayoutMilestone[], extra: Partial<Order> = {}): Order {
  return {
    id: "o1",
    clientId: "c1",
    supplierId: "s1",
    riderId: null,
    state: "supplier_self_qc",
    title: "Flyers",
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
    timeline: [
      {
        at: "2026-09-15T11:48:00Z",
        state: "production",
        by: "user_supplier",
        note: "Proof of Fulfilment attached for printing",
        fileId: "pof_printing",
        milestoneCode: "printing",
      },
    ],
    payoutMilestones: milestones,
    ...extra,
  } as unknown as Order;
}

const fourShares = () => [
  milestone("printing", { status: "pof_attached", pofFileIds: ["pof_printing"] }),
  milestone("packaging_qc", { status: "pof_attached", pofFileIds: ["pof_packing"] }),
  milestone("delivered"),
  milestone("retention"),
];

describe("PayoutMilestones", () => {
  it("opens every share that can be released and shows its proof as numbered frames", async () => {
    render(<PayoutMilestones order={order(fourShares())} onRelease={() => {}} />);
    expect(screen.getByText(/^1 proof on file\. Filed .* by Supplier\.$/)).toBeInTheDocument();
    const frame = await screen.findByRole("button", { name: "Open printing in progress proof 1" });
    await waitFor(() =>
      expect(frame.querySelector("img")).toHaveAttribute("src", "https://files.test/pof_printing"),
    );
    expect(await screen.findByRole("button", { name: "Open packaging proof 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Release ₱500.00" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Release ₱150.00" })).toBeEnabled();
    // The two waiting shares stay closed: nothing to look at yet.
    expect(screen.queryByText(/No proof on file yet/)).toBeNull();
  });

  it("draws every picture once, folds a long list, and steps through it large", async () => {
    const user = userEvent.setup();
    const ids = Array.from({ length: 29 }, (_, i) => `pof_${i + 1}`);
    render(
      <PayoutMilestones
        order={order([
          // An id listed twice is one picture.
          milestone("printing", { status: "released", pofFileIds: [...ids, "pof_3"] }),
          milestone("packaging_qc"),
        ])}
        defaultOpen={["printing"]}
        emphasizeProof
      />,
    );
    expect(screen.getByText(/^29 proofs on file\./)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Open printing in progress proof 6" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open printing in progress proof 7" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show all 29" }));
    expect(await screen.findByRole("button", { name: "Open printing in progress proof 29" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open printing in progress proof 30" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Open printing in progress proof 29" }));
    expect(await screen.findByRole("heading", { name: "Printing in progress proof 29 of 29" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Next/ }));
    expect(await screen.findByRole("heading", { name: "Printing in progress proof 1 of 29" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("img", { name: /Printing in progress proof 1: pof_1\.jpg/ })).toHaveAttribute(
        "src",
        "https://files.test/pof_1",
      ),
    );
  });

  it("reads each share's state from its header without opening it", () => {
    render(<PayoutMilestones order={order(fourShares())} />);
    expect(screen.getAllByText("Ready to release")).toHaveLength(2);
    expect(screen.getAllByText("Proof needed")).toHaveLength(2);
    expect(screen.getByText("₱500.00")).toBeInTheDocument();
    expect(screen.getByText("₱100.00")).toBeInTheDocument();
  });

  it("opens the next share when nothing can be released, and says why", async () => {
    const user = userEvent.setup();
    render(
      <PayoutMilestones
        order={order([milestone("printing"), milestone("packaging_qc")], {
          state: "production",
        })}
        onRelease={() => {}}
      />,
    );
    expect(
      screen.getByText(/No proof on file yet. Supplier uploads the proof/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Release ₱500.00" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Packaging/ }));
    expect(screen.getByRole("button", { name: "Release ₱150.00" })).toBeDisabled();
  });

  it("keeps the release action away from a read-only caller", () => {
    render(<PayoutMilestones order={order(fourShares())} />);
    expect(screen.queryByRole("button", { name: /^Release ₱/ })).toBeNull();
  });

  it("hands the chosen share back to the caller", async () => {
    const user = userEvent.setup();
    const onRelease = vi.fn();
    render(<PayoutMilestones order={order(fourShares())} onRelease={onRelease} />);
    await user.click(screen.getByRole("button", { name: "Release ₱500.00" }));
    expect(onRelease).toHaveBeenCalledWith(expect.objectContaining({ code: "printing" }));
  });

  it("names the retention proof as the rider's photo once delivered", () => {
    const shares = [
      milestone("printing", {
        status: "released",
        pofFileIds: ["pof_printing"],
        releasedAt: "2026-09-15T12:00:00Z",
        releasedBy: "user_ops",
      }),
      milestone("packaging_qc", {
        status: "released",
        pofFileIds: ["pof_packing"],
        releasedAt: "2026-09-15T12:01:00Z",
        releasedBy: "user_ops",
      }),
      milestone("delivered", {
        status: "released",
        pofFileIds: ["door"],
        releasedAt: "2026-09-15T12:02:00Z",
        releasedBy: "user_ops",
      }),
      milestone("retention", { status: "pof_attached", pofFileIds: ["door"] }),
    ];
    render(
      <PayoutMilestones
        order={order(shares, {
          state: "issue_window_open",
          timeline: [
            {
              at: "2026-09-15T11:52:00Z",
              state: "delivered",
              by: "user_rider",
              note: "Proof of Fulfilment attached for delivered",
              fileId: "door",
              milestoneCode: "delivered",
            },
          ],
        })}
        onRelease={() => {}}
      />,
    );
    expect(screen.getByText(/The rider's delivery photo, filed/)).toBeInTheDocument();
    expect(
      screen.getByText(/Retention releases when the issue window has expired/),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Released")).toHaveLength(3);
  });
});
