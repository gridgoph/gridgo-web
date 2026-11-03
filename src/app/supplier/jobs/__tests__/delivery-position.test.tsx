// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";

import type { Order } from "@/lib/api/types";

vi.stubGlobal("React", React);
const listJobs = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  listJobs,
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
const { default: SupplierJobsPage } = await import("@/app/supplier/jobs/page");

function shopJob(partial: Partial<Order>): Order {
  return {
    id: "job-1",
    clientId: "c1",
    supplierId: "shop1",
    riderId: null,
    state: "production",
    title: "Tarpaulin run",
    deadline: "2026-10-01T08:00:00.000Z",
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
  };
}

afterEach(() => {
  cleanup();
  listJobs.mockReset();
});

it("tells the shop which of its separate deliveries each job is", async () => {
  listJobs.mockResolvedValue([
    shopJob({ id: "job-1", deliveryNumber: 1, shopDeliveryCount: 2 }),
    shopJob({ id: "job-2", deliveryNumber: 2, shopDeliveryCount: 2 }),
    shopJob({ id: "job-3", title: "Flyers" }),
  ]);
  render(<SupplierJobsPage />);
  expect(
    (await screen.findAllByText(/Delivery 1 of 2 · Order job-1/)).length,
  ).toBeGreaterThan(0);
  expect(screen.getAllByText(/Delivery 2 of 2 · Order job-2/).length).toBeGreaterThan(0);
  for (const node of screen.getAllByText(/Order job-3/)) {
    expect(node).not.toHaveTextContent("Delivery");
  }
});
