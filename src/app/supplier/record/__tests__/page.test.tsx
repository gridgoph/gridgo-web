// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reviews: vi.fn(),
  lapses: vi.fn(),
  failures: vi.fn(),
  requests: vi.fn(),
  jobs: vi.fn(),
  settings: vi.fn(),
}));
vi.stubGlobal("React", React);
vi.mock("@/lib/api/supplier-record", () => ({
  getMyReviews: mocks.reviews,
  getMyProductionLapses: mocks.lapses,
  getMyShopFailures: mocks.failures,
  getMyRescheduleRequests: mocks.requests,
}));
vi.mock("@/lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")),
  listJobs: mocks.jobs,
  getSettings: mocks.settings,
}));
import Page from "@/app/supplier/record/page";
const reviews = (comment = "Careful finishing") => ({
  summary: { count: 1, overall: 4, quality: 4, speed: 4, value: 4 },
  reviews: [
    {
      id: "review_1",
      orderId: "job_1",
      qualityStars: 4,
      speedStars: 4,
      valueStars: 4,
      comment,
      createdAt: "2026-10-01T00:00:00Z",
    },
  ],
});
beforeEach(() => {
  mocks.reviews.mockReset().mockResolvedValue(reviews());
  mocks.lapses.mockReset().mockResolvedValue({ lapses: [] });
  mocks.failures.mockReset().mockResolvedValue({ events: [] });
  mocks.requests.mockReset().mockResolvedValue({ requests: [] });
  mocks.jobs.mockReset().mockResolvedValue([{ id: "job_1", title: "Flyers" }]);
  mocks.settings
    .mockReset()
    .mockResolvedValue({ productionPenalty: { deductionsEnabled: false } });
});
afterEach(cleanup);
it("keeps the last review visible and names a failed refresh until retry succeeds", async () => {
  const user = userEvent.setup();
  mocks.lapses.mockRejectedValueOnce(new Error("offline"));
  mocks.reviews
    .mockResolvedValueOnce(reviews())
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(reviews("Updated finishing"));
  render(<Page />);
  const section = await screen.findByRole("region", { name: "Reviews" });
  await within(section).findByText(/Careful finishing/);
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await within(section).findByText(/Could not refresh reviews/);
  expect(within(section).getByText(/Careful finishing/)).toBeVisible();
  await user.click(within(section).getByRole("button", { name: "Refresh Reviews" }));
  await within(section).findByText(/Updated finishing/);
  expect(within(section).queryByRole("alert")).not.toBeInTheDocument();
});
it("allows an explicit refresh without losing loaded content while it runs", async () => {
  const user = userEvent.setup();
  let resolve!: (value: unknown) => void;
  mocks.reviews.mockResolvedValueOnce(reviews()).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<Page />);
  await screen.findByText(/Careful finishing/);
  const refresh = screen.getByRole("button", { name: "Refresh record" });
  await user.click(refresh);
  expect(refresh).toBeDisabled();
  expect(screen.getByText(/Careful finishing/)).toBeVisible();
  resolve(reviews("Fresh review"));
  await screen.findByText(/Fresh review/);
  await waitFor(() => expect(refresh).toBeEnabled());
});

it("keeps a failed late-job refresh distinct from an empty history", async () => {
  const user = userEvent.setup();
  mocks.lapses
    .mockResolvedValueOnce({
      lapses: [{ id: "late_1", orderId: "job_1", tier: "minor", status: "warning_only" }],
    })
    .mockRejectedValue(new Error("offline"));
  render(<Page />);
  const section = await screen.findByRole("region", { name: "Your late jobs" });
  await within(section).findByText(/Warning only, no deduction/);
  await user.click(screen.getByRole("button", { name: "Refresh record" }));
  await within(section).findByText(/Could not refresh your late jobs/);
  expect(within(section).getByText(/Warning only, no deduction/)).toBeVisible();
  expect(within(section).queryByText("No late jobs")).not.toBeInTheDocument();
});
