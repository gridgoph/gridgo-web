// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Order } from "@/lib/api/types";

const { listJobsMock } = vi.hoisted(() => ({ listJobsMock: vi.fn() }));

vi.stubGlobal("React", React);

class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return { ...actual, listJobs: listJobsMock };
});

import SupplierJobsPage from "@/app/supplier/jobs/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function job(partial: Partial<Order> & Pick<Order, "id" | "state" | "title">): Order {
  return {
    clientId: "c1",
    supplierId: "user_supplier",
    riderId: null,
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
    ...partial,
  } as Order;
}

/** Row order as rendered in the desktop table body. */
async function renderedJobOrder(): Promise<string[]> {
  const table = await screen.findByRole("table");
  const rows = within(table).getAllByRole("row").slice(1); // drop the header
  return rows
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "")
    .map((text) => text.trim());
}

/**
 * The toolbar's facet trigger, not the column header that shares its name.
 *
 * DataTable renders a desktop table and mobile cards at once and hides one in
 * CSS, so a bare name query matches several controls.
 */
function facetTrigger(title: RegExp): HTMLElement {
  const match = screen
    .getAllByRole("button", { name: title })
    .find((button) => !button.closest("table"));
  if (!match) throw new Error(`no toolbar facet trigger for ${title}`);
  return match;
}

describe("SupplierJobsPage", () => {
  it("opens sorted by last update, newest first — not by deadline", async () => {
    listJobsMock.mockResolvedValue([
      job({
        id: "stale-but-urgent",
        state: "production",
        title: "Urgent but quiet",
        deadline: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      }),
      job({
        id: "just-moved",
        state: "needs_qa",
        title: "Just moved",
        deadline: "2026-12-01T00:00:00.000Z",
        updatedAt: "2026-08-20T00:00:00.000Z",
      }),
      job({
        id: "middle",
        state: "production",
        title: "Middle",
        deadline: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-08-10T00:00:00.000Z",
      }),
    ]);

    render(<SupplierJobsPage />);

    await waitFor(async () => {
      const order = await renderedJobOrder();
      expect(order[0]).toContain("Just moved");
    });

    const order = await renderedJobOrder();
    expect(order[0]).toContain("Just moved");
    expect(order[1]).toContain("Middle");
    expect(order[2]).toContain("Urgent but quiet");
  });

  it("shows what moved beside when it moved", async () => {
    listJobsMock.mockResolvedValue([
      job({
        id: "o1",
        state: "production",
        title: "Thesis reprint",
        updatedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
        timeline: [
          {
            at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
            state: "production",
            by: "user_ops",
            note: "Downpayment confirmed",
          },
        ],
      }),
    ]);

    render(<SupplierJobsPage />);

    const table = await screen.findByRole("table");
    expect(within(table).getByText("3h ago")).toBeInTheDocument();
    expect(
      within(table).getByText(/Downpayment confirmed · Operations/),
    ).toBeInTheDocument();
  });

  it("offers Status and Next step filters built from the jobs on the board", async () => {
    listJobsMock.mockResolvedValue([
      job({ id: "o1", state: "production", title: "A" }),
      job({ id: "o2", state: "supplier_assigned", title: "B" }),
    ]);

    render(<SupplierJobsPage />);

    await screen.findByRole("table");
    await userEvent.click(facetTrigger(/Status/i));

    // Built from the rows actually present, not a fixed list of every state.
    // Facet values are toggle buttons carrying their own live count.
    expect(
      await screen.findByRole("button", { name: /In production/i }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      await screen.findByRole("button", { name: /Awaiting supplier decision/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Needs QA review/i })).toBeNull();
  });

  it("counts what needs the shop's action across the summary figures", async () => {
    listJobsMock.mockResolvedValue([
      job({ id: "o1", state: "supplier_assigned", title: "Needs a decision" }),
      job({
        id: "o2",
        state: "delivered",
        title: "Nothing owed",
        supplierSubtotalMinor: 250_000,
      }),
    ]);

    render(<SupplierJobsPage />);

    const needs = await screen.findByText("Need your action");
    expect(within(needs.parentElement as HTMLElement).getByText("1")).toBeInTheDocument();

    // Delivered is still on the board — only completed and cancelled leave it.
    const board = await screen.findByText("On the board");
    expect(
      within(board.parentElement as HTMLElement).getByText("₱2,500.00"),
    ).toBeInTheDocument();
  });

  it("explains a refused inbox rather than rendering an empty table", async () => {
    const { ApiError } = await vi.importActual<typeof import("@/lib/api/client")>(
      "@/lib/api/client",
    );
    listJobsMock.mockRejectedValue(new ApiError(403, "forbidden", {}));

    render(<SupplierJobsPage />);

    expect(
      await screen.findByText(/only available to supplier accounts/i),
    ).toBeInTheDocument();
  });
});
