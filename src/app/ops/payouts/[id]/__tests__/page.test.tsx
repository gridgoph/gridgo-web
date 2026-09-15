// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OpsPayoutReviewPage from "@/app/ops/payouts/[id]/page";
import { setTokenProvider } from "@/lib/api/client";
import type { Order, PayoutMilestone, SupplierPayoutAccount } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "ord_ready" }) }));

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

const ACCOUNT: SupplierPayoutAccount = {
  supplierId: "s1",
  provider: "gcash",
  accountName: "Ben S.",
  accountNumber: "+639171234567",
  institution: null,
  qr: {
    fileId: "file_qr",
    originalFilename: "gcash.jpg",
    detectedContentType: "image/jpeg",
    size: 1000,
    readyAt: null,
  },
  version: 2,
  updatedAt: "2026-09-15T10:00:00Z",
  shopName: "Lovis Printshop",
};

let payoutAccount: SupplierPayoutAccount | null = ACCOUNT;

function order(): Order {
  return {
    id: "ord_ready",
    clientId: "c1",
    supplierId: "s1",
    riderId: null,
    state: "supplier_self_qc",
    title: "Business cards",
    deadline: null,
    address: "Davao",
    deliveryFeeMinor: 0,
    totalMinor: 0,
    paymentMethod: null,
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-09-15T10:00:00Z",
    updatedAt: "2026-09-15T10:00:00Z",
    timeline: [],
    payoutMilestones: [
      milestone("printing", { status: "pof_attached", pofFileIds: ["f_printing"] }),
      milestone("packaging_qc"),
      milestone("delivered"),
      milestone("retention"),
    ],
    supplierPayoutAccount: payoutAccount,
  } as unknown as Order;
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (path.endsWith("/orders/ord_ready")) return json({ order: order() });
      if (path.endsWith("/claims")) return json({ claims: [] });
      if (path.endsWith("/files/file_qr/download-url"))
        return json({ url: "https://files.test/gcash.jpg" });
      if (path.endsWith("/files/f_printing/download-url"))
        return json({ url: "https://files.test/pof.jpg" });
      if (path.endsWith("/files/f_printing")) {
        return json({
          file: {
            fileId: "f_printing",
            purpose: "fulfilment_proof",
            originalFilename: "pof.jpg",
            detectedContentType: "image/jpeg",
            size: 1,
            state: "ready",
            references: [],
          },
        });
      }
      return json({ error: "not_found" }, 404);
    }),
  );
});
afterEach(() => {
  cleanup();
  payoutAccount = ACCOUNT;
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

describe("where this money goes, on the payout desk", () => {
  it("shows the shop's plate and the words to check it by", async () => {
    render(<OpsPayoutReviewPage />);
    const card = await screen.findByRole("region", { name: /Where this money goes/ });
    expect(within(card).getByText("Lovis Printshop")).toBeInTheDocument();
    expect(within(card).getByText("GCash")).toBeInTheDocument();
    // Once as the account name, once again in the sentence about checking it.
    expect(within(card).getAllByText("Ben S.")).toHaveLength(2);
    expect(within(card).getByText("+639171234567")).toBeInTheDocument();
    const plate = await within(card).findByRole("img", {
      name: /Lovis Printshop's payout QR/,
    });
    expect(plate).toHaveAttribute("src", "https://files.test/gcash.jpg");
  });

  it("puts the same plate inside the release confirmation", async () => {
    render(<OpsPayoutReviewPage />);
    await screen.findByRole("region", { name: /Where this money goes/ });
    fireEvent.click(await screen.findByRole("button", { name: /^Release/ }));
    const dialog = await screen.findByRole("alertdialog");
    const destination = within(dialog).getByRole("group", {
      name: /Where this money goes/,
    });
    expect(within(destination).getByText("Ben S.")).toBeInTheDocument();
    expect(
      await within(destination).findByRole("img", { name: /payout QR/ }),
    ).toHaveAttribute("src", "https://files.test/gcash.jpg");
    expect(within(destination).getByText(/Scan, check the name/)).toBeInTheDocument();
  });

  it("says plainly when the shop has never said where to send the money", async () => {
    payoutAccount = null;
    render(<OpsPayoutReviewPage />);
    const card = await screen.findByRole("region", { name: /Where this money goes/ });
    expect(
      within(card).getByText(/has not said where it wants to be paid/),
    ).toBeInTheDocument();
    expect(within(card).queryByRole("img")).toBeNull();
  });
});
