// @vitest-environment jsdom

/**
 * Confirm payment and Assign rider from the queue row (gridgo-web#272): the
 * same requests, with the same bodies, as the order workspace and the
 * dispatch board send, and the proof on screen before the confirm.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setTokenProvider } from "@/lib/api/client";
import type { Basket, Order, User } from "@/lib/api/types";
import { basketOf, groupOrder } from "@/test/baskets";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/components/orders/EvidencePreview", () => ({
  EvidencePlate: ({ fileId }: { fileId: string }) => <div>Receipt {fileId}</div>,
  EvidenceStrip: () => null,
}));
vi.mock("@/components/orders/ReceiptReferenceOcr", () => ({
  ReceiptReferenceOcr: () => null,
}));
const { default: OpsOrdersPage } = await import("@/app/ops/orders/page");

const initial = (status: string) => ({
  status,
  amountMinor: 55020,
  method: "qr_manual",
  reference: "GCASH-REF-1",
  proofFileId: "proof-1",
  submittedAt: "2026-10-31T01:00:00Z",
  confirmedAt: null,
  confirmedBy: null,
  confirmationSource: null,
});

function paymentOrder(status = "pending_confirmation"): Order {
  return {
    id: "ord_pay",
    clientId: "client1",
    state: "initial_payment_review",
    title: "Flyers",
    quantity: 100,
    totalMinor: 55020,
    downpaymentPercent: 100,
    timeline: [],
    updatedAt: "2026-10-31T01:00:00Z",
    payments: {
      initial: initial(status),
      final_online: { ...initial("not_required"), amountMinor: 0, proofFileId: null },
    },
  } as unknown as Order;
}

const readyOrder = {
  id: "ord_ready",
  clientId: "client1",
  supplierId: "shop1",
  riderId: null,
  state: "ready_for_dispatch",
  title: "Banner",
  quantity: 1,
  totalMinor: 90000,
  timeline: [],
  readyAt: "2026-10-31T02:00:00Z",
  updatedAt: "2026-10-31T02:00:00Z",
} as unknown as Order;

const riders = [
  {
    id: "rider_ana",
    name: "Ana Rider",
    role: "rider",
    verificationStatus: "approved",
    riderProfile: { vehicleType: "motorcycle", plateNumber: "ABC 1234" },
  },
  { id: "rider_ben", name: "Ben Pending", role: "rider", verificationStatus: "pending" },
  {
    id: "rider_cy",
    name: "Cy Held",
    role: "rider",
    verificationStatus: "approved",
    accountStatus: "suspended",
  },
] as unknown as User[];

let orders: Order[];
let basket: Basket | null;
let mutations: { path: string; body: unknown }[];
let refuse: string | null;

beforeEach(() => {
  vi.stubGlobal("React", React);
  orders = [paymentOrder(), readyOrder];
  basket = null;
  mutations = [];
  refuse = null;
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const path = url.pathname.replace(/^\/api\/gridgo/, "");
      const reply = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (init?.method === "POST") {
        mutations.push({ path, body: JSON.parse(String(init.body)) });
        if (refuse) return reply({ error: refuse }, 409);
        if (path.startsWith("/baskets/")) return reply({ basket });
        if (path.endsWith("/confirm")) {
          orders = [paymentOrder("confirmed"), readyOrder];
          return reply({ order: orders[0] });
        }
        if (path.endsWith("/reject")) {
          orders = [paymentOrder("not_submitted"), readyOrder];
          return reply({ order: orders[0] });
        }
        if (path.endsWith("/transition")) {
          orders = [
            orders[0],
            { ...readyOrder, state: "rider_assigned", riderId: "rider_ana" },
          ];
          return reply({ order: orders[1] });
        }
      }
      if (path === "/orders") return reply({ orders });
      const one = path.match(/^\/orders\/([^/]+)$/);
      if (one) return reply({ order: orders.find((order) => order.id === one[1]) });
      if (path === "/users") return reply({ users: riders });
      if (path === "/settings") return reply({ settings: {} });
      if (basket && path === `/baskets/${basket.id}`) return reply({ basket });
      return reply({ error: "not_found" }, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

async function rowFor(title: string) {
  const table = await screen.findByRole("table", { name: "Orders waiting on you" });
  return within(within(table).getByText(title).closest("tr")!);
}

describe("Confirm payment from the queue", { timeout: 20_000 }, () => {
  it("shows the proof and confirms with the workspace's own request", async () => {
    render(<OpsOrdersPage />);
    await userEvent.click(
      (await rowFor("Flyers")).getByRole("button", { name: "Confirm payment" }),
    );

    const sheet = await screen.findByRole("dialog", { name: "Confirm payment" });
    // The proof is on screen before anything is confirmed.
    expect(await within(sheet).findByText("Receipt proof-1")).toBeInTheDocument();
    expect(within(sheet).getByText("₱550.20")).toBeInTheDocument();
    expect(mutations).toEqual([]);

    await userEvent.click(
      within(sheet).getByRole("button", { name: "Confirm this payment" }),
    );
    expect(mutations).toEqual([
      { path: "/orders/ord_pay/payments/initial/confirm", body: {} },
    ]);
    // The queue is re-read: the payment no longer waits on you.
    expect(
      await screen.findByRole("table", { name: "Orders waiting on you" }),
    ).not.toHaveTextContent("Flyers");
  });

  it("rejects with the same client-visible reason", async () => {
    render(<OpsOrdersPage />);
    await userEvent.click(
      (await rowFor("Flyers")).getByRole("button", { name: "Confirm payment" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Confirm payment" });
    await userEvent.click(await within(sheet).findByRole("button", { name: "Reject" }));
    expect(mutations).toEqual([
      {
        path: "/orders/ord_pay/payments/initial/reject",
        body: { reason: "The transfer could not be matched to this order." },
      },
    ]);
  });

  it("keeps the sheet open and says why when the API refuses", async () => {
    refuse = "payment_not_pending";
    render(<OpsOrdersPage />);
    await userEvent.click(
      (await rowFor("Flyers")).getByRole("button", { name: "Confirm payment" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Confirm payment" });
    await userEvent.click(
      await within(sheet).findByRole("button", { name: "Confirm this payment" }),
    );
    expect(await within(sheet).findByRole("alert")).toBeInTheDocument();
    expect(
      within(sheet).getByRole("button", { name: "Confirm this payment" }),
    ).toBeEnabled();
  });

  it("confirms a grouped order's payment once, for the basket", async () => {
    const shop = groupOrder({ id: "ord_a", groupLabel: "Shop A", title: "Stickers" });
    basket = basketOf([shop, groupOrder({ id: "ord_b", groupLabel: "Shop B" })]);
    orders = [shop];
    render(<OpsOrdersPage />);
    await userEvent.click(
      (await rowFor("Stickers")).getByRole("button", { name: "Confirm payment" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Confirm payment" });
    await userEvent.click(
      await within(sheet).findByRole("button", {
        name: "Confirm payment for all 2 groups",
      }),
    );
    expect(mutations).toEqual([{ path: "/baskets/bsk_1/payment/confirm", body: {} }]);
  });
});

describe("Assign rider from the queue", { timeout: 20_000 }, () => {
  it("lists only the riders the API accepts and sends the dispatch board's request", async () => {
    render(<OpsOrdersPage />);
    await userEvent.click(
      (await rowFor("Banner")).getByRole("button", { name: "Assign rider" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Assign a rider" });
    const list = within(
      await within(dialog).findByRole("list", { name: "Approved riders" }),
    );
    expect(list.getByText("Ana Rider")).toBeInTheDocument();
    expect(list.getByText("Motorcycle · ABC 1234")).toBeInTheDocument();
    // Pending, and approved but on an account hold: the API would refuse both.
    expect(list.queryByText("Ben Pending")).not.toBeInTheDocument();
    expect(list.queryByText("Cy Held")).not.toBeInTheDocument();

    await userEvent.click(list.getByRole("button", { name: "Assign Ana Rider" }));
    expect(mutations).toEqual([
      {
        path: "/orders/ord_ready/transition",
        body: {
          state: "rider_assigned",
          riderId: "rider_ana",
          note: "Rider assigned for pickup",
        },
      },
    ]);
    expect(
      await screen.findByRole("table", { name: "Orders waiting on you" }),
    ).not.toHaveTextContent("Banner");
  });

  it("says why when the API refuses the rider", async () => {
    refuse = "rider_not_approved";
    render(<OpsOrdersPage />);
    await userEvent.click(
      (await rowFor("Banner")).getByRole("button", { name: "Assign rider" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Assign a rider" });
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Assign Ana Rider" }),
    );
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
  });
});
