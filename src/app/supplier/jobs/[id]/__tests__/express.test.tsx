// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { getOrder } from "@/lib/api/client";
import SupplierJobDetailPage from "@/app/supplier/jobs/[id]/page";
import { EXPRESS_JOB_NOTE } from "@/lib/express";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "job_1" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/api/client", async () => ({
  ...(await vi.importActual("@/lib/api/client")),
  getOrder: vi.fn(),
}));
afterEach(cleanup);

function job(partial: Record<string, unknown>) {
  return {
    id: "job_1",
    state: "production",
    title: "Same-day stickers",
    clientId: "c",
    supplierId: "s",
    totalMinor: 0,
    deliveryFeeMinor: 0,
    timeline: [],
    createdAt: "2026-10-16T01:00:00Z",
    updatedAt: "2026-10-16T01:00:00Z",
    ...partial,
  } as never;
}

it("tags an Express job and says what was promised", async () => {
  vi.mocked(getOrder).mockResolvedValueOnce(job({ express: true }));
  render(<SupplierJobDetailPage />);
  await screen.findByRole("heading", { name: "Same-day stickers" });
  expect(screen.getByText("Express")).toBeVisible();
  expect(screen.getByText(EXPRESS_JOB_NOTE)).toBeVisible();
});

it("says nothing about Express on an ordinary job or one placed before it", async () => {
  vi.mocked(getOrder).mockResolvedValueOnce(job({}));
  render(<SupplierJobDetailPage />);
  await screen.findByRole("heading", { name: "Same-day stickers" });
  expect(screen.queryByText("Express")).not.toBeInTheDocument();
  expect(screen.queryByText(EXPRESS_JOB_NOTE)).not.toBeInTheDocument();
});
