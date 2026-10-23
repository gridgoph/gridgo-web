// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ jobs: vi.fn(), hours: vi.fn(), services: vi.fn() }));
vi.stubGlobal("React", React);
vi.mock("@/lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")),
  listJobs: mocks.jobs,
  getMyShopHours: mocks.hours,
  listSupplierServices: mocks.services,
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: vi.fn() }));
import Page from "../page";
const hours = {
  week: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    opensMinute: 480,
    closesMinute: 1020,
  })),
  closures: [{ startDay: "2026-10-24", endDay: "2026-10-24" }],
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T06:00:00Z"));
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  mocks.jobs.mockReset().mockResolvedValue([
    {
      id: "j1",
      title: "Ready-by job",
      state: "production",
      readyBy: "2026-10-24T01:00:00Z",
      promisedDate: "2026-10-25T01:00:00Z",
      deadline: "2026-10-26T01:00:00Z",
      quantity: 1,
    },
  ]);
  mocks.hours.mockReset().mockResolvedValue(hours);
  mocks.services.mockReset().mockResolvedValue([{ state: "live", capacityDaily: 50 }]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("places jobs by ready-by, names that date, and keeps closures/capacity after a failed refresh", async () => {
  const user = userEvent.setup();
  render(<Page />);
  await screen.findByRole("button", { name: "Refresh" });
  await user.click(screen.getByRole("button", { name: "Month" }));
  const day = await screen.findByRole("button", {
    name: /Saturday, October 24, 2026: Closure date, 1 job due/,
  });
  await user.click(day);
  const selected = screen.getByRole("region", { name: "Selected day" });
  const job = within(selected).getByRole("link", { name: /Ready-by job/ });
  expect(job).toHaveAttribute("href", "/supplier/jobs/j1");
  expect(job).toHaveTextContent(/Ready by Oct 24, 2026/);
  expect(job).not.toHaveTextContent(/Oct 26/);
  expect(selected).toHaveTextContent(/Declared daily capacity: 50/);
  expect(selected).toHaveTextContent(/Shop closed/);
  mocks.hours.mockRejectedValue(new Error("offline"));
  mocks.services.mockRejectedValue(new Error("offline"));
  mocks.jobs.mockRejectedValue(new Error("offline"));
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByRole("alert");
  expect(job).toBeVisible();
  expect(selected).toHaveTextContent(/Declared daily capacity: 50/);
  expect(selected).toHaveTextContent(/Shop closed/);
  mocks.hours.mockResolvedValue(hours);
  mocks.services.mockResolvedValue([]);
  mocks.jobs.mockResolvedValue([]);
  await user.click(screen.getByRole("button", { name: "Retry schedule" }));
  await within(selected).findByText("Closed, and nothing promised.");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("does not turn failed initial hours and capacity reads into an open day", async () => {
  mocks.hours.mockRejectedValue(new Error("offline"));
  mocks.services.mockRejectedValue(new Error("offline"));
  const user = userEvent.setup();
  render(<Page />);
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Month" }));
  expect(screen.getAllByText("Hours unavailable").length).toBeGreaterThan(0);
  expect(screen.queryByText("Nothing booked")).not.toBeInTheDocument();
});
it("shows a failed initial job read with retry, never an empty schedule", async () => {
  mocks.jobs.mockRejectedValue(new Error("offline"));
  render(<Page />);
  await screen.findByRole("button", { name: "Retry" });
  expect(
    screen.queryByText("Nothing on the production schedule"),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/demo API/i)).not.toBeInTheDocument();
});

it("keeps jobs with no recorded ready-by reachable without using actual finish time", async () => {
  mocks.jobs.mockResolvedValue([
    {
      id: "undated",
      title: "Undated job",
      state: "production",
      readyAt: "2026-10-23T00:00:00Z",
      quantity: 1,
    },
  ]);
  render(<Page />);
  const section = await screen.findByRole("region", {
    name: "Jobs without a ready-by date",
  });
  expect(within(section).getByRole("link", { name: /Undated job/ })).toHaveAttribute(
    "href",
    "/supplier/jobs/undated",
  );
  expect(section).toHaveTextContent("Ready-by date not recorded");
});
