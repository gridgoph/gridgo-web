// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { ReleaseMilestoneDialog } from "@/components/orders/ReleaseMilestoneDialog";
import { setTokenProvider } from "@/lib/api/client";
import type { Order, OrderChangeRequest, PayoutMilestone } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "order1" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/components/orders/EvidencePreview", () => ({
  EvidencePlate: ({ fileId }: { fileId: string }) => <div>Proof {fileId}</div>,
  EvidenceStrip: () => null,
}));
vi.mock("@/components/orders/ReceiptReferenceOcr", () => ({
  ReceiptReferenceOcr: () => null,
}));

const NOTE = "Please keep a 5 mm white border. Text me [masked].";

const awaitingCheck: OrderChangeRequest = {
  id: "change_1",
  orderId: "order1",
  supplierId: "shop1",
  lineItemId: "line_1",
  status: "pending_confirmation",
  version: 3,
  reason: "The left-side staple needs an extra finishing pass.",
  proposedSpec: "Staple twice on the left edge.",
  proposedReadyBy: null,
  extraPrincipalMinor: 15_000,
  feeMinor: 6_750,
  totalMinor: 21_750,
  createdAt: "2026-10-15T11:41:57.538Z",
  answeredAt: "2026-10-15T11:49:45.124Z",
  originalInstructions: NOTE,
  payment: {
    proofFileId: "file_change_proof",
    reference: "WALLET-123",
    submittedAt: "2026-10-15T11:49:56.338Z",
  },
};

function base(extra: Partial<Order> = {}): Order {
  return {
    id: "order1",
    clientId: "client1",
    supplierId: "shop1",
    riderId: null,
    state: "production",
    title: "Flyers",
    deadline: null,
    address: "Davao",
    totalMinor: 66_900,
    deliveryFeeMinor: 5_000,
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-10-14T10:00:00Z",
    updatedAt: "2026-10-15T06:20:00Z",
    timeline: [],
    downpaymentPercent: 100,
    productionItems: [
      { id: "line_1", itemName: "Flyers", quantity: 1, measurement: null, specialInstructions: NOTE },
    ],
    specialInstructionLines: [{ lineItemId: "line_1", text: NOTE }],
    specialInstructionsAcknowledgement: {
      supplierId: "shop1",
      at: "2026-10-15T11:41:54.928Z",
      lines: [{ lineItemId: "line_1", text: NOTE }],
    },
    changeRequests: [awaitingCheck],
    ...extra,
  } as unknown as Order;
}

let order: Order;
let posted: { path: string; body: Record<string, unknown>; key: string | null }[];

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("PointerEvent", MouseEvent);
  setTokenProvider(() => "fixture-token");
  posted = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://localhost").pathname.replace(/^\/api\/gridgo/, "");
      const reply = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (init?.method === "POST") {
        const headers = (init.headers ?? {}) as Record<string, string>;
        const body = JSON.parse(String(init.body));
        posted.push({ path, body, key: headers["Idempotency-Key"] ?? null });
        const next: OrderChangeRequest = path.endsWith("/confirm")
          ? {
              ...awaitingCheck,
              status: "applied",
              version: 4,
              appliedAt: "2026-10-15T12:00:00.000Z",
              payment: { ...awaitingCheck.payment!, confirmedAt: "2026-10-15T12:00:00.000Z", confirmedBy: "ops_1" },
              payout: { status: "pending", amountMinor: 15_000, releaseRequires: "final_payout_stage" },
            }
          : {
              ...awaitingCheck,
              status: "pending_payment",
              version: 4,
              payment: undefined,
              rejectionReason: String(body.reason),
              paymentHistory: [{ ...awaitingCheck.payment!, rejectedAt: "2026-10-15T12:00:00.000Z", reason: String(body.reason) }],
            };
        order = { ...order, changeRequests: [next] };
        return reply({ changeRequest: next });
      }
      if (path === "/orders/order1") return reply({ order });
      if (path === "/orders/order1/refund-requests") return reply({ refunds: [] });
      if (path === "/escalations") return reply({ escalations: [] });
      if (path === "/users/shop1") return reply({ user: { id: "shop1", name: "Shop owner", supplierName: "Shop A" } });
      if (path === "/users/ops_1") return reply({ user: { id: "ops_1", name: "Team member" } });
      return reply({ error: "not_found" }, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

describe("the order workspace's special instructions row", { timeout: 20_000 }, () => {
  it("opens itself on a change payment to check, with the notes, the tick and the money", async () => {
    order = base();
    render(<OrderWorkspace queueHref="/ops/orders" />);
    const trigger = await screen.findByRole("button", { name: /Special instructions/ });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveTextContent("1 note, ticked by the shop, change request: payment to check");
    expect(trigger).toHaveTextContent("Your call");

    const row = screen.getByRole("region", { name: /Special instructions/ });
    expect(within(row).getAllByText(NOTE).length).toBeGreaterThan(0);
    expect(await within(row).findByText(/Shop A ticked that it read them/)).toBeInTheDocument();
    expect(within(row).getByText("Payment to check")).toBeInTheDocument();
    expect(within(row).getByText("Staple twice on the left edge.")).toBeInTheDocument();
    expect(within(row).getByText("₱150.00")).toBeInTheDocument();
    expect(within(row).getByText("₱67.50")).toBeInTheDocument();
    expect(within(row).getAllByText("₱217.50").length).toBeGreaterThan(0);
  });

  it("verifies the exact amount with the request's version, then shows it agreed", async () => {
    order = base();
    const user = userEvent.setup();
    render(<OrderWorkspace queueHref="/ops/orders" />);
    await user.click(await screen.findByRole("button", { name: "Confirm ₱217.50 received" }));
    const dialog = await screen.findByRole("alertdialog", { name: /Confirm the ₱217.50 change payment/ });
    const apply = within(dialog).getByRole("button", { name: "Confirm and apply the change" });
    expect(apply).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(apply);

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].path).toBe("/orders/order1/change-requests/change_1/payment/confirm");
    expect(posted[0].body).toEqual({
      expectedVersion: 3,
      amountMinor: 21_750,
      reason: "Exact wallet transfer verified.",
    });
    expect(posted[0].key).toBeTruthy();
    expect(
      await screen.findByText("Payment verified. The change is agreed, and the shop and the client have been told."),
    ).toBeInTheDocument();
    const row = screen.getByRole("region", { name: /Special instructions/ });
    expect(within(row).getByText("Agreed")).toBeInTheDocument();
    expect(
      within(row).getByText("₱150.00 extra owed to the shop, released with the final payout stage."),
    ).toBeInTheDocument();
  });

  it("rejects with a reason the client reads", async () => {
    order = base();
    const user = userEvent.setup();
    render(<OrderWorkspace queueHref="/ops/orders" />);
    await user.click(await screen.findByRole("button", { name: "Reject the payment" }));
    const dialog = await screen.findByRole("alertdialog", { name: /Reject the ₱217.50 change payment/ });
    await user.click(within(dialog).getByRole("button", { name: "Reject payment" }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].path).toBe("/orders/order1/change-requests/change_1/payment/reject");
    expect(posted[0].body).toMatchObject({ expectedVersion: 3 });
    expect(String(posted[0].body.reason)).toMatch(/exactly ₱217.50/);
    const row = await screen.findByRole("region", { name: /Special instructions/ });
    expect(await within(row).findByText("Approved, waiting for payment")).toBeInTheDocument();
  });

  it("says when the notes are not ticked yet on an offer", async () => {
    order = base({ state: "supplier_assigned", specialInstructionsAcknowledgement: null, changeRequests: [] });
    const user = userEvent.setup();
    render(<OrderWorkspace queueHref="/ops/orders" />);
    const trigger = await screen.findByRole("button", { name: /Special instructions/ });
    expect(trigger).toHaveTextContent("1 note, not ticked yet");
    if (trigger.getAttribute("aria-expanded") !== "true") await user.click(trigger);
    expect(
      screen.getByText(/Not ticked yet. GRIDGO refuses the shop's acceptance/),
    ).toBeInTheDocument();
  });
});

describe("releasing the final share with a paid change extra", () => {
  const finalStage: PayoutMilestone = {
    code: "issue_window",
    sharePercent: 25,
    amountMinor: 10_000,
    status: "pending",
    pofFileIds: [],
    releasedAt: null,
    releasedBy: null,
  } as unknown as PayoutMilestone;
  const target = {
    order: {
      id: "order1",
      title: "Flyers",
      payoutPlanVersion: 2,
      changeRequests: [
        { ...awaitingCheck, status: "applied", payout: { status: "pending" as const, amountMinor: 15_000 } },
      ],
    },
    milestone: finalStage,
  };

  it("pays the share and the extra as one transfer, with its receipt and reference", async () => {
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: () => "blob:receipt", revokeObjectURL: () => {} }),
    );
    const onConfirm = vi.fn();
    render(
      <ReleaseMilestoneDialog target={target} busy={false} error={null} onCancel={() => {}} onConfirm={onConfirm} />,
    );
    expect(screen.getByRole("heading", { name: "Release ₱250.00 to the supplier?" })).toBeInTheDocument();
    expect(screen.getByText(/₱100.00 for this share plus ₱150.00 extra/)).toBeInTheDocument();
    const release = screen.getByRole("button", { name: "Release payout" });
    expect(release).toBeDisabled();

    const receipt = new File(["x"], "receipt.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Wallet receipt (screenshot)"), { target: { files: [receipt] } });
    fireEvent.change(screen.getByLabelText("Reference number"), { target: { value: "REF 1" } });
    expect(release).toBeEnabled();
    fireEvent.click(release);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 25_000, reference: "REF 1", receipt }),
    );
  });

  it("leaves an earlier share untouched", () => {
    const onConfirm = vi.fn();
    render(
      <ReleaseMilestoneDialog
        target={{ ...target, milestone: { ...finalStage, code: "delivered" } }}
        busy={false}
        error={null}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Release payout" }));
    expect(onConfirm.mock.calls[0][0]).not.toHaveProperty("amountMinor");
  });
});
