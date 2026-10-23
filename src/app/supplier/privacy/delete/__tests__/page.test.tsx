// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ create: vi.fn(), start: vi.fn(), attempt: vi.fn() }));
vi.stubGlobal("React", React);
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: { passwordEnabled: true }, isLoaded: true }),
  useSession: () => ({
    session: { startVerification: m.start, attemptFirstFactorVerification: m.attempt },
  }),
}));
vi.mock("@/lib/api/supplier-self", () => ({ createMyPrivacyRequest: m.create }));
import Page from "../page";
afterEach(cleanup);
beforeEach(() => {
  m.create.mockReset().mockResolvedValue({ request: { id: "r1" } });
  m.start.mockReset().mockResolvedValue({ status: "needs_first_factor" });
  m.attempt.mockReset();
});
it("never files a deletion request after a refused identity check", async () => {
  m.attempt.mockRejectedValue({ errors: [{ code: "form_password_incorrect" }] });
  render(<Page />);
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
  fireEvent.click(screen.getByRole("button", { name: "Send deletion request" }));
  await screen.findByRole("alert");
  expect(m.create).not.toHaveBeenCalled();
  expect(screen.queryByText("Request sent")).not.toBeInTheDocument();
});
it("files only the manual request after verification and retains access", async () => {
  m.attempt.mockResolvedValue({ status: "complete" });
  render(<Page />);
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "test-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send deletion request" }));
  await screen.findByRole("heading", { name: "Request sent" });
  await waitFor(() => expect(m.create).toHaveBeenCalledWith("deletion"));
  expect(screen.getByText(/Your account stays available/)).toBeVisible();
});
