// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ jobs: vi.fn(), readiness: vi.fn() }));
vi.stubGlobal("React", React);
vi.mock("@/lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")),
  listJobs: mocks.jobs,
  getSupplierReadiness: mocks.readiness,
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: vi.fn() }));
vi.mock("@/components/pwa/PhoneApp", () => ({ PhoneAppInvite: () => null }));
import Page from "../page";
beforeEach(() => {
  mocks.jobs.mockReset();
  mocks.readiness.mockReset().mockResolvedValue({ operational: { ready: true } });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("removes expired obligations locally, including successive answer deadlines, without a refetch", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T06:00:00Z"));
  mocks.jobs.mockResolvedValue(
    [1, 2].map((n) => ({
      id: `offer${n}`,
      title: `Offer ${n}`,
      state: "supplier_assigned",
      timeline: [],
      shopAcceptance: {
        supplierId: "shop",
        assignedAt: "2026-10-23T05:00:00Z",
        deadlineAt: `2026-10-23T06:00:0${n}Z`,
        workingMinutes: 60,
        status: "pending",
      },
    })),
  );
  await act(async () => {
    render(<Page />);
  });
  const next = screen.getByRole("region", { name: "Next" });
  expect(within(next).getAllByRole("link")).toHaveLength(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1001);
  });
  expect(within(next).queryByText(/Offer 1/)).not.toBeInTheDocument();
  expect(within(next).getByText(/Offer 2/)).toBeVisible();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1001);
  });
  expect(screen.queryByRole("region", { name: "Next" })).not.toBeInTheDocument();
  expect(mocks.jobs).toHaveBeenCalledTimes(1);
});
it("names unavailable readiness instead of suggesting that setup is complete", async () => {
  mocks.jobs.mockResolvedValue([]);
  mocks.readiness.mockRejectedValue(new Error("offline"));
  render(<Page />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /readiness could not be refreshed/i,
  );
  expect(screen.getByRole("button", { name: "Refresh dashboard" })).toBeEnabled();
});
