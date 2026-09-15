// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OpsPayoutReviewPage from "@/app/ops/payouts/[id]/page";
import { setTokenProvider } from "@/lib/api/client";
import type { Order, PayoutMilestone } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "ord_ready" }) }));
vi.stubGlobal(
  "URL",
  Object.assign(URL, {
    createObjectURL: () => "blob:receipt",
    revokeObjectURL: () => {},
  }),
);

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

let order: Order;
let posts: { path: string; body: unknown; form: FormData | null }[];

function fixture(): Order {
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
    supplierPayoutAccount: null,
  } as unknown as Order;
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  order = fixture();
  posts = [];
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (init?.method === "POST") {
        const form = init.body instanceof FormData ? init.body : null;
        posts.push({ path, body: form ? null : JSON.parse(String(init.body)), form });
        if (path.endsWith("/files")) {
          return json(
            { file: { fileId: "rcpt_1", purpose: "payout_receipt", state: "ready" } },
            201,
          );
        }
        if (path.endsWith("/release")) {
          const released = milestone("printing", {
            status: "released",
            pofFileIds: ["f_printing"],
            releasedAt: "2026-09-15T11:00:00Z",
            releasedBy: "ops",
            receiptFileId: "rcpt_1",
            reference: "GCASH-777",
          });
          order = {
            ...order,
            payoutMilestones: [released, ...order.payoutMilestones!.slice(1)],
          };
          return json({ order, milestone: released });
        }
      }
      if (path.endsWith("/orders/ord_ready")) return json({ order });
      if (path.endsWith("/claims")) return json({ claims: [] });
      if (path.endsWith("/download-url"))
        return json({ url: "https://files.test/x.jpg" });
      if (/\/files\/[^/]+$/.test(path)) {
        const fileId = path.split("/").pop();
        return json({
          file: {
            fileId,
            purpose: "x",
            originalFilename: `${fileId}.jpg`,
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
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

describe("the wallet receipt on release", () => {
  it("previews the picked screenshot, stores it, and releases with the reference", async () => {
    render(<OpsPayoutReviewPage />);
    fireEvent.click(await screen.findByRole("button", { name: /^Release ₱500\.00/ }));
    const dialog = await screen.findByRole("alertdialog");

    const file = new File(["jpg"], "gcash-receipt.jpg", { type: "image/jpeg" });
    fireEvent.change(within(dialog).getByLabelText("Wallet receipt (screenshot)"), {
      target: { files: [file] },
    });
    expect(
      await within(dialog).findByRole("img", {
        name: /Wallet receipt gcash-receipt\.jpg/,
      }),
    ).toHaveAttribute("src", "blob:receipt");
    fireEvent.change(within(dialog).getByLabelText("Reference number (optional)"), {
      target: { value: " GCASH-777 " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Release payout" }));

    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[0].path).toMatch(/\/files$/);
    expect(posts[0].form?.get("purpose")).toBe("payout_receipt");
    expect(posts[1].path).toMatch(/\/orders\/ord_ready\/milestones\/printing\/release$/);
    expect(posts[1].body).toEqual({
      note: "Proof of Fulfilment reviewed",
      reference: "GCASH-777",
      receiptFileId: "rcpt_1",
    });
    expect(
      await screen.findByText(/₱500\.00 released to the supplier/),
    ).toBeInTheDocument();
    // The released row now carries the receipt and the reference.
    expect(await screen.findByText(/reference GCASH-777/)).toBeInTheDocument();
  });

  it("refuses a screenshot that is not an image before anything is sent", async () => {
    render(<OpsPayoutReviewPage />);
    fireEvent.click(await screen.findByRole("button", { name: /^Release ₱500\.00/ }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.change(within(dialog).getByLabelText("Wallet receipt (screenshot)"), {
      target: { files: [new File(["pdf"], "receipt.pdf", { type: "application/pdf" })] },
    });
    expect(
      await within(dialog).findByText(/Use a JPEG, PNG or WebP/),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole("img", { name: /Wallet receipt/ })).toBeNull();
    expect(posts).toHaveLength(0);
  });

  it("releases without a receipt or reference when neither is given", async () => {
    render(<OpsPayoutReviewPage />);
    fireEvent.click(await screen.findByRole("button", { name: /^Release ₱500\.00/ }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Release payout" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ note: "Proof of Fulfilment reviewed" });
  });
});
