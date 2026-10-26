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

function shopJob(): Order {
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
  };
}

afterEach(() => {
  cleanup();
  listJobs.mockReset();
});

it("keeps a shop job payload from carrying the client's name", async () => {
  const job = shopJob();
  expect(job.clientName).toBeUndefined();
  expect(JSON.stringify(job)).not.toContain("Mina Cruz");
  listJobs.mockResolvedValue([job]);
  render(<SupplierJobsPage />);
  expect(await screen.findAllByText("Tarpaulin run")).not.toHaveLength(0);
  expect(screen.queryByText("Mina Cruz")).toBeNull();
  expect(screen.queryByText("Unavailable")).toBeNull();
});
