// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FinishedWorkDesk } from "@/components/handover/FinishedWorkDesk";
import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { escrowStages } from "@/test/payout-plans";

vi.stubGlobal("React", React);
let search = new URLSearchParams();
const replace = vi.fn((href: string) => {
  search = new URLSearchParams(href.split("?")[1] ?? "");
});
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "order1" }),
  useRouter: () => ({ replace, push: replace }),
  usePathname: () => "/ops/finished-work",
  useSearchParams: () => search,
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/components/orders/EvidencePreview", () => ({
  EvidencePlate: ({ fileId }: { fileId: string }) => <div>Proof {fileId}</div>,
  EvidenceStrip: () => null,
}));

let orders: Order[];
let review: { status: number; body: unknown } | null;
let requests: { method: string; path: string; body: unknown }[];

function pending(extra: Partial<Order> = {}): Order {
  return {
    id: "order1",
    clientId: "client1",
    supplierId: "shop1",
    riderId: null,
    state: "supplier_self_qc",
    title: "Department handouts",
    quantity: 1,
    deadline: null,
    address: "Davao",
    totalMinor: 545000,
    deliveryFeeMinor: 5000,
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-10-15T01:00:00Z",
    updatedAt: "2026-10-15T02:00:00Z",
    timeline: [],
    supplierPayoutAccount: null,
    payoutPlanVersion: 2,
    payoutMilestones: escrowStages(),
    handoverFlow: "rider_packs",
    forcedByGridgo: false,
    forcedSteps: [],
    forcedStepReasonCodes: [
      "technical_issue",
      "evidence_verified_offline",
      "operational_correction",
      "other",
    ],
    productionItems: [
      {
        id: "line1",
        itemName: "Document printing",
        quantity: 1,
        pricingUnit: "per_page",
        measurement: { pages: 2000 },
      },
    ],
    productionProgress: {
      status: "photos_available",
      photos: [
        {
          fileId: "file_a",
          contentType: "image/jpeg",
          at: "2026-10-15T02:00:00Z",
          downloadUrl: "https://files.test/a.jpg",
          downloadUrlExpiresAt: "2999-01-01T00:00:00Z",
        },
      ],
    },
    shopHandover: {
      finished: {
        at: "2026-10-15T02:00:00Z",
        by: "shop1",
        supplierId: "shop1",
        photoFileIds: ["file_a"],
      },
      review: null,
    },
    transitionReadiness: {
      ready_for_dispatch: {
        allowed: false,
        missing: [{ code: "production_review_required", message: "Wait for GRIDGO." }],
      },
    },
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
  search = new URLSearchParams();
  replace.mockClear();
  review = null;
  requests = [];
  orders = [pending()];
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://gridgo.test");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ method, path: url.pathname, body });
      if (method === "POST" && url.pathname.endsWith("/production-review")) {
        if (review) return json(review.body, review.status);
        const decided = {
          ...orders[0],
          state: body.decision === "approved" ? "ready_for_dispatch" : "production",
        };
        return json({ order: decided });
      }
      if (url.pathname === "/orders") return json({ orders });
      if (url.pathname === "/users")
        return json({
          users: [{ id: "shop1", name: "Ana", supplierName: "Shop A", role: "supplier" }],
        });
      if (url.pathname === "/users/shop1")
        return json({
          user: { id: "shop1", name: "Ana", supplierName: "Shop A", role: "supplier" },
        });
      if (url.pathname === "/users/ops1")
        return json({ user: { id: "ops1", name: "Bea", role: "ops_admin" } });
      if (url.pathname === "/audit") return json({ audit: [] });
      if (url.pathname === "/escalations") return json({ escalations: [] });
      if (url.pathname.endsWith("/refund-requests")) return json({ refundRequests: [] });
      if (url.pathname.endsWith("/download-url"))
        return json({ url: "https://files.test/fresh.jpg" });
      if (url.pathname.startsWith("/orders/")) return json({ order: orders[0] });
      return json({});
    }),
  );
});

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

async function tickAllChecks(scope: HTMLElement) {
  const user = userEvent.setup();
  for (const label of [
    /Every item on the order is in the photos/,
    /It matches the specification/,
    /No visible defects/,
  ]) {
    await user.click(within(scope).getByLabelText(label));
  }
}

describe("the Finished work desk", () => {
  it("lists waiting work oldest first and approves only after the three checks", async () => {
    search = new URLSearchParams("order=order1");
    const user = userEvent.setup();
    render(<FinishedWorkDesk tree="ops" />);

    const panel = await screen.findByTestId("finished-review-panel");
    expect(
      screen.getByRole("button", { name: /Department handouts/ }),
    ).toBeInTheDocument();
    expect(within(panel).getByText("First try")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Job ticket" })).toHaveTextContent(
      "2,000 pages",
    );
    expect(screen.getByRole("link", { name: "Open the order" })).toHaveAttribute(
      "href",
      "/ops/orders/order1",
    );

    const approve = within(panel).getByRole("button", { name: "Approve finished work" });
    expect(approve).toBeDisabled();
    await tickAllChecks(panel);
    expect(approve).toBeEnabled();
    await user.click(approve);

    await waitFor(() =>
      expect(requests.find((r) => r.method === "POST")).toEqual({
        method: "POST",
        path: "/orders/order1/production-review",
        body: { decision: "approved" },
      }),
    );
    expect(await screen.findByText(/Shop A can now call a rider/)).toHaveAttribute(
      "role",
      "status",
    );
  });

  it("sends back only with a reason the shop reads word for word", async () => {
    search = new URLSearchParams("order=order1");
    const user = userEvent.setup();
    render(<FinishedWorkDesk tree="admin" />);

    const panel = await screen.findByTestId("finished-review-panel");
    await user.click(
      within(panel).getByRole("button", { name: "Send back to the shop" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Send back" }));
    expect(
      within(dialog).getByText("Write the reason the shop will read."),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.method === "POST")).toBe(false);

    await user.type(
      within(dialog).getByLabelText("Reason the shop will read"),
      "Reprint page 12",
    );
    await user.click(within(dialog).getByRole("button", { name: "Send back" }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === "POST")?.body).toEqual({
        decision: "rejected",
        note: "Reprint page 12",
      }),
    );
  });

  it("explains a review someone else already made", async () => {
    search = new URLSearchParams("order=order1");
    review = { status: 409, body: { error: "production_review_not_available" } };
    render(<FinishedWorkDesk tree="ops" />);

    const panel = await screen.findByTestId("finished-review-panel");
    await tickAllChecks(panel);
    await userEvent
      .setup()
      .click(within(panel).getByRole("button", { name: "Approve finished work" }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent(/already reviewed/);
  });

  it("says so when nothing is waiting", async () => {
    orders = [pending({ handoverFlow: "legacy" })];
    render(<FinishedWorkDesk tree="ops" />);
    expect(await screen.findByText("Nothing waiting for review")).toBeInTheDocument();
  });
});

describe("the order workspace's finished-work review", () => {
  it("decides a waiting review in the With the shop step, above Force", async () => {
    const user = userEvent.setup();
    render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);

    const shop = (await screen.findByRole("heading", { name: /^With the shop/ })).closest(
      "section",
    )!;
    expect(within(shop).getByText("Your call")).toBeInTheDocument();
    expect(screen.getAllByText("Finished work in review").length).toBeGreaterThan(0);
    const panel = within(shop).getByTestId("finished-review-panel");
    // Force stays, below the review, as the exception.
    const force = within(shop).getByRole("button", { name: "Force to ready for pickup" });
    expect(
      panel.compareDocumentPosition(force) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // The Handover row keeps the steps and the record, not a second decision.
    const handover = screen.getByRole("heading", { name: /^Handover/ }).closest("section")!;
    await user.click(within(handover).getByRole("button", { name: /Handover/ }));
    const steps = await within(handover).findByRole("list", { name: "Handover steps" });
    expect(
      within(steps).getByText(/GRIDGO reviews the finished work/),
    ).toBeInTheDocument();
    expect(within(steps).getByText(/Packed in front of the rider/)).toBeInTheDocument();
    expect(within(handover).queryByTestId("finished-review-panel")).toBeNull();

    await tickAllChecks(panel);
    await user.click(
      within(panel).getByRole("button", { name: "Approve finished work" }),
    );
    await waitFor(() =>
      expect(requests.find((r) => r.method === "POST")?.body).toEqual({
        decision: "approved",
      }),
    );
  });

  it("says what the shop still owes before any photo arrives, with Force as the exception", async () => {
    // The reported order: in production, a progress photo, nothing sent for review.
    orders = [
      pending({
        state: "production",
        shopHandover: {},
        transitionReadiness: {
          ready_for_dispatch: {
            allowed: false,
            missing: [
              { code: "production_finished_required", message: "Submit photos first." },
              { code: "production_review_required", message: "Wait for GRIDGO." },
            ],
          },
        },
      }),
    ];
    render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);

    const shop = (await screen.findByRole("heading", { name: /^With the shop/ })).closest(
      "section",
    )!;
    expect(within(shop).getByText("No finished-work photos yet")).toBeInTheDocument();
    expect(within(shop).queryByTestId("finished-review-panel")).toBeNull();
    // A rider-packs order owes no progress photo, so none is asked for.
    expect(within(shop).queryByText(/Waiting for a progress photo/)).toBeNull();
    expect(
      within(shop).getByRole("button", { name: "Force to ready for pickup" }),
    ).toBeInTheDocument();
  });

  it("shows the last send-back's reason while it waits for new photos", async () => {
    orders = [
      pending({
        state: "production",
        shopHandover: {
          attempts: [
            {
              finished: {
                at: "2026-10-15T02:00:00Z",
                by: "shop1",
                supplierId: "shop1",
                photoFileIds: ["file_a"],
              },
              review: {
                decision: "rejected",
                at: "2026-10-15T03:00:00Z",
                by: "ops1",
                note: "Page 12 is smudged. Reprint it.",
              },
            },
          ],
        },
      }),
    ];
    render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);

    const shop = (await screen.findByRole("heading", { name: /^With the shop/ })).closest(
      "section",
    )!;
    expect(
      await within(shop).findByText(/Waiting for the shop's new photos/),
    ).toBeInTheDocument();
    expect(within(shop).getByText("Page 12 is smudged. Reprint it.")).toBeInTheDocument();
  });

  it("forces past the review only with a reason code and a note, naming what it skips", async () => {
    const user = userEvent.setup();
    render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);

    await user.click(
      await screen.findByRole("button", { name: "Force to ready for pickup" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText("GRIDGO's review of the finished work"),
    ).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", {
      name: "Force to ready for pickup",
    });
    await user.type(
      within(dialog).getByLabelText("What happened"),
      "Checked at the counter",
    );
    expect(confirm).toBeDisabled();
    await user.click(within(dialog).getByLabelText(/Checked outside the app/));
    await user.click(confirm);
    await waitFor(() =>
      expect(requests.find((r) => r.method === "POST")).toEqual({
        method: "POST",
        path: "/orders/order1/transition",
        body: {
          state: "ready_for_dispatch",
          reasonCode: "evidence_verified_offline",
          reason: "Checked at the counter",
          note: "Checked at the counter",
        },
      }),
    );
  });

  it("tags a forced order and shows the forced step's reason and skipped checks", async () => {
    orders = [
      pending({
        state: "ready_for_dispatch",
        forcedByGridgo: true,
        shopHandover: {},
        forcedSteps: [
          {
            at: "2026-10-15T04:00:00Z",
            by: "shop1",
            role: "ops_admin",
            from: "production",
            to: "ready_for_dispatch",
            reasonCode: "technical_issue",
            note: "The shop's uploads kept failing",
            skippedChecks: ["production_finished_required", "production_review_required"],
          },
        ],
      }),
    ];
    render(<OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />);

    expect(await screen.findByText("Forced by GRIDGO")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Handover/ }));
    const note = await screen.findByRole("note", { name: /corrected by staff/ });
    expect(within(note).getByText(/Reason: Technical issue/)).toBeInTheDocument();
    // The states read in this order's own flow: nothing was packed at the shop.
    expect(within(note).getByText(/to Ready for rider pickup\./)).toBeInTheDocument();
    expect(
      within(note).getByText(
        /Skipped: The shop's finished-product photos; GRIDGO's review/,
      ),
    ).toBeInTheDocument();
    expect(within(note).getByText("The shop's uploads kept failing")).toBeInTheDocument();
  });
});
