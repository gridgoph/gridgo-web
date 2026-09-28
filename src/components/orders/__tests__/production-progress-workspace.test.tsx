// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import type { AuditEntry, Order, ProductionProgress } from "@/lib/api/types";
import { escrowStages, proofOnFile } from "@/test/payout-plans";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "order1" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/components/orders/EvidencePreview", () => ({
  EvidencePlate: ({ fileId }: { fileId: string }) => <div>Proof {fileId}</div>,
  EvidenceStrip: () => null,
}));

const WAITING: ProductionProgress = { status: "waiting_for_photo", photos: [] };

let order: Order;
let audit: AuditEntry[];
let transition: { status: number; body: unknown } | null;
let requests: { method: string; path: string; search: string; body: unknown }[];

function base(extra: Partial<Order>): Order {
  return {
    id: "order1",
    clientId: "client1",
    supplierId: "shop1",
    riderId: null,
    state: "production",
    title: "Tarpaulin",
    quantity: 1,
    deadline: null,
    address: "Davao",
    totalMinor: 55020,
    deliveryFeeMinor: 0,
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-09-28T01:00:00Z",
    updatedAt: "2026-09-28T01:00:00Z",
    timeline: [],
    supplierPayoutAccount: null,
    payoutPlanVersion: 2,
    payoutMilestones: escrowStages(),
    ...extra,
  } as unknown as Order;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  audit = [];
  transition = null;
  requests = [];
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://gridgo.test");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ method, path: url.pathname, search: url.search, body });
      if (method === "POST" && url.pathname === "/orders/order1/transition") {
        if (transition) return json(transition.body, transition.status);
        return json({ order });
      }
      if (url.pathname === "/audit") return json({ audit });
      if (url.pathname === "/escalations") return json({ escalations: [] });
      if (url.pathname.endsWith("/refund-requests")) return json({ refundRequests: [] });
      if (url.pathname === "/users/user_ops")
        return json({ user: { id: "user_ops", name: "Rhea Dizon", email: "", role: "ops_admin" } });
      if (url.pathname.endsWith("/download-url")) return json({ url: "https://files.test/fresh.jpg" });
      return json({ order });
    }),
  );
});

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

function productionRow() {
  return screen.getByRole("heading", { name: /With the shop/ }).closest("section")!;
}

describe("progress photos on the order workspace", () => {
  it("shows the gallery and marks the photo that is also the start proof", async () => {
    order = base({
      payoutMilestones: escrowStages({ production_started: proofOnFile("file_start") }),
      productionProgress: {
        status: "photos_available",
        photos: [
          {
            fileId: "file_start",
            contentType: "image/jpeg",
            at: "2026-09-28T02:00:00Z",
            downloadUrl: "https://files.test/start.jpg",
            downloadUrlExpiresAt: "2999-01-01T00:00:00Z",
          },
          {
            fileId: "file_done",
            contentType: "image/webp",
            at: "2026-09-28T05:00:00Z",
            downloadUrl: "https://files.test/done.webp",
            downloadUrlExpiresAt: "2999-01-01T00:00:00Z",
          },
        ],
      },
    });
    render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);

    const photo = await screen.findByRole("button", { name: /Open progress photo 1/ });
    expect(photo.querySelector("img")).toHaveAttribute("src", "https://files.test/start.jpg");
    expect(screen.getByRole("button", { name: /Open progress photo 2/ })).toBeInTheDocument();
    expect(screen.getByText("2 progress photos from the shop.")).toBeInTheDocument();
    expect(screen.getByText("Also the payout proof for start of production")).toBeInTheDocument();
    // The same picture is not repeated as a separate proof plate.
    expect(screen.queryByText("Proof file_start")).toBeNull();
  });

  it("keeps a PDF start proof visible beside the waiting frame", async () => {
    order = base({
      payoutMilestones: escrowStages({ production_started: proofOnFile("file_pdf") }),
      productionProgress: WAITING,
    });
    render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);

    const row = await waitFor(() => productionRow());
    expect(await within(row).findByText("Waiting for a progress photo")).toBeInTheDocument();
    expect(within(row).getByText(/cannot pack this job until it does/)).toBeInTheDocument();
    expect(within(row).getByText("Proof file_pdf")).toBeInTheDocument();
  });
});

describe("a staff production correction", () => {
  it("requires a reason and sends it on the transition route", async () => {
    const user = userEvent.setup();
    order = base({ productionProgress: WAITING });
    render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);

    await user.click(await screen.findByRole("button", { name: "Move to ready for dispatch" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/has not sent a progress photo/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Move to ready for dispatch" });
    expect(confirm).toBeDisabled();

    await user.type(
      within(dialog).getByLabelText("Why you are moving it on"),
      "Saw the finished job at the counter",
    );
    await user.click(confirm);

    await waitFor(() =>
      expect(requests.find((r) => r.method === "POST")?.body).toEqual({
        state: "ready_for_dispatch",
        reason: "Saw the finished job at the counter",
        note: "Saw the finished job at the counter",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("explains production_override_reason_required and keeps the dialog open", async () => {
    const user = userEvent.setup();
    order = base({ productionProgress: WAITING });
    transition = { status: 400, body: { error: "production_override_reason_required" } };
    render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);

    await user.click(await screen.findByRole("button", { name: "Move to ready for dispatch" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.type(within(dialog).getByLabelText("Why you are moving it on"), " x");
    await user.click(within(dialog).getByRole("button", { name: "Move to ready for dispatch" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /Write why you are moving this job on/,
    );
  });

  it("shows the audited correction, who made it and why", async () => {
    order = base({
      state: "ready_for_dispatch",
      readyAt: "2026-09-28T06:00:00Z",
      productionProgress: WAITING,
    });
    audit = [
      {
        id: "aud_1",
        at: "2026-09-28T06:00:00Z",
        actorId: "user_ops",
        actorRole: "ops_admin",
        action: "order.production_override",
        entityType: "order",
        entityId: "order1",
        orderId: "order1",
        detail: { from: "production", to: "ready_for_dispatch", photoMissing: true },
        reason: "Saw the finished job at the counter",
      },
    ];
    render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);

    const note = await screen.findByRole("note", { name: /corrected by staff/ });
    expect(await within(note).findByText("Moved on by Rhea Dizon")).toBeInTheDocument();
    expect(within(note).getByText(/No progress photo was on file/)).toBeInTheDocument();
    expect(within(note).getByText("Saw the finished job at the counter")).toBeInTheDocument();
    expect(
      requests.some(
        (r) => r.path === "/audit" && r.search.includes("action=order.production_override"),
      ),
    ).toBe(true);
    // Past production there is nothing left to correct.
    expect(screen.queryByRole("button", { name: "Move to ready for dispatch" })).toBeNull();
    expect(screen.getByText(/No progress photo was sent before this job left production/)).toBeInTheDocument();
  });

  it("offers no correction against an API that predates the gallery", async () => {
    order = base({ productionProgress: undefined });
    render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);

    await screen.findAllByText("Tarpaulin");
    expect(screen.queryByRole("button", { name: "Move to ready for dispatch" })).toBeNull();
    expect(screen.queryByText("Waiting for a progress photo")).toBeNull();
  });
});
