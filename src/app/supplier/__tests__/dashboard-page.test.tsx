// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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

import SupplierDashboardPage from "@/app/supplier/dashboard/page";

beforeAll(() => {
  // Recharts measures its container; jsdom reports zero and renders nothing.
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ width: 800, height: 300, top: 0, left: 0, bottom: 300, right: 800, x: 0, y: 0, toJSON: () => {} }),
  });
  global.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

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

/** The figure rendered inside the StatCard with this label. */
async function figure(label: string): Promise<string> {
  const heading = await screen.findByText(label);
  const card = heading.parentElement as HTMLElement;
  return within(card).getByText(/./, { selector: "p.text-h2" }).textContent ?? "";
}

describe("SupplierDashboardPage", () => {
  it("invites a first job rather than charting zeroes", async () => {
    listJobsMock.mockResolvedValue([]);

    render(<SupplierDashboardPage />);

    expect(await screen.findByText("Nothing to measure yet")).toBeInTheDocument();
  });

  it("values the board from the shop's own price, excluding closed work", async () => {
    listJobsMock.mockResolvedValue([
      job({ id: "a", state: "production", title: "Open", supplierSubtotalMinor: 400_000 }),
      job({ id: "b", state: "completed", title: "Closed", supplierSubtotalMinor: 900_000 }),
    ]);

    render(<SupplierDashboardPage />);

    expect(await figure("On the board")).toBe("₱4,000.00");
  });

  it("scores on time against the shop's ready-by date and says how many it saw", async () => {
    listJobsMock.mockResolvedValue([
      job({
        id: "a",
        state: "delivered",
        title: "Early",
        readyBy: "2026-08-05T12:00:00.000Z",
        readyAt: "2026-08-05T09:00:00.000Z",
      }),
      job({
        id: "b",
        state: "delivered",
        title: "Late",
        readyBy: "2026-08-05T12:00:00.000Z",
        readyAt: "2026-08-06T09:00:00.000Z",
      }),
    ]);

    render(<SupplierDashboardPage />);

    expect(await figure("On time")).toBe("50%");
    expect(
      await screen.findByText("1 of 2 met your ready-by date"),
    ).toBeInTheDocument();
  });

  it("says on-time is unmeasured rather than showing a misleading zero", async () => {
    listJobsMock.mockResolvedValue([
      job({ id: "a", state: "production", title: "Under way" }),
    ]);

    render(<SupplierDashboardPage />);

    expect(await figure("On time")).toBe("—");
    expect(
      await screen.findByText("No finished job has a ready-by date yet"),
    ).toBeInTheDocument();
  });

  it("separates work finished from money released", async () => {
    listJobsMock.mockResolvedValue([
      job({ id: "a", state: "production", title: "Under way" }),
    ]);

    render(<SupplierDashboardPage />);

    expect(
      await screen.findByText(/work completed, not money released/i),
    ).toBeInTheDocument();
  });

  it("names jobs sitting at a stage the pipeline chart does not track", async () => {
    listJobsMock.mockResolvedValue([
      job({ id: "a", state: "production", title: "Tracked" }),
      job({ id: "b", state: "needs_qa", title: "Untracked" }),
    ]);

    render(<SupplierDashboardPage />);

    expect(
      await screen.findByText(/Not shown above: Needs QA review/),
    ).toBeInTheDocument();
  });

  it("explains a refused dashboard instead of rendering empty charts", async () => {
    const { ApiError } = await vi.importActual<typeof import("@/lib/api/client")>(
      "@/lib/api/client",
    );
    listJobsMock.mockRejectedValue(new ApiError(403, "forbidden", {}));

    render(<SupplierDashboardPage />);

    expect(
      await screen.findByText(/only available to supplier accounts/i),
    ).toBeInTheDocument();
  });
});
