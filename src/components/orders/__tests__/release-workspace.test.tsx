// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import type { Order, PayoutMilestone, SupplierPayoutAccount } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "order1" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/components/orders/EvidencePreview", () => ({
  EvidencePlate: ({ fileId }: { fileId: string }) => <div>Proof {fileId}</div>,
  EvidenceStrip: () => null,
}));

const ACCOUNT: SupplierPayoutAccount = {
  supplierId: "shop1",
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

const order = {
  id: "order1",
  clientId: "client1",
  supplierId: "shop1",
  riderId: null,
  state: "supplier_self_qc",
  title: "Flyers",
  quantity: 2,
  deadline: null,
  address: "Davao",
  totalMinor: 55020,
  deliveryFeeMinor: 0,
  paymentMethod: "qr_manual",
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
  supplierPayoutAccount: ACCOUNT,
} as unknown as Order;

beforeEach(() => {
  vi.stubGlobal("React", React);
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          headers: { "Content-Type": "application/json" },
        });
      if (path.endsWith("/files/file_qr/download-url")) {
        return json({ url: "https://files.test/gcash.jpg" });
      }
      if (path.endsWith("/claims")) return json({ claims: [] });
      return json({ order });
    }),
  );
});
afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

/**
 * The order workspace is where most releases actually happen, so the plate
 * has to be inside its release dialog too, not only on the payout desk.
 */
it("shows the shop's payout plate when releasing a share from the order workspace", async () => {
  render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);
  fireEvent.click(await screen.findByRole("button", { name: /^Release ₱500\.00/ }));
  const dialog = await screen.findByRole("alertdialog");
  const destination = within(dialog).getByRole("group", {
    name: /Where this money goes/,
  });
  expect(within(destination).getByText("Lovis Printshop")).toBeInTheDocument();
  expect(within(destination).getByText("Ben S.")).toBeInTheDocument();
  expect(
    await within(destination).findByRole("img", { name: /Lovis Printshop's payout QR/ }),
  ).toHaveAttribute("src", "https://files.test/gcash.jpg");
});
