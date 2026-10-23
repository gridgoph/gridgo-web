// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));
vi.stubGlobal("React", React);
vi.mock("@/lib/api/supplier-self", () => ({
  listMyPrivacyRequests: m.list,
  createMyPrivacyRequest: m.create,
}));
import Page from "../page";
afterEach(cleanup);
beforeEach(() => {
  m.list.mockReset().mockResolvedValue({ requests: [] });
  m.create.mockReset();
});
it("ends loading after a failed history read and permits retry", async () => {
  m.list.mockRejectedValueOnce(new Error("offline"));
  render(<Page />);
  await screen.findByRole("alert");
  expect(screen.queryByText("Loading your requests.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry request history" }));
  await screen.findByText("No requests yet.");
});
it("shows the staff resolution and reads the next history page", async () => {
  m.list
    .mockResolvedValueOnce({
      requests: [
        {
          id: "r1",
          kind: "access",
          status: "completed",
          resolution: "Your copy is ready for collection.",
        },
      ],
      nextOffset: 100,
    })
    .mockResolvedValueOnce({
      requests: [{ id: "r2", kind: "correction", status: "pending" }],
      nextOffset: null,
    });
  render(<Page />);
  await screen.findByText("Your copy is ready for collection.");
  fireEvent.click(screen.getByRole("button", { name: "Show more requests" }));
  await screen.findByText(/Correct my data — Received/);
  expect(m.list).toHaveBeenLastCalledWith(100);
});
