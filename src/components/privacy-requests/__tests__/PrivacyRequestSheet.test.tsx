// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Typing through userEvent is slow on a loaded machine.
vi.setConfig({ testTimeout: 30_000 });

import type { PrivacyRequest } from "@/lib/api/types";

const api = vi.hoisted(() => ({ updatePrivacyRequest: vi.fn() }));

vi.stubGlobal("React", React);
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "staff_me", name: "Staff Me", email: "me@example.test", role: "ops_admin" } }),
}));
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, ...api };
});

import { PrivacyRequestSheet } from "@/components/privacy-requests/PrivacyRequestSheet";

const request: PrivacyRequest = {
  id: "pr_1",
  userId: "user_a",
  kind: "deletion",
  status: "pending",
  details: "Please delete my account.",
  resolution: "",
  requestedAt: "2026-10-01T00:00:00Z",
  dueAt: "2026-10-16T15:59:00Z",
  handlerId: null,
  updatedAt: "2026-10-01T00:00:00Z",
  revision: 3,
};

const props = {
  tree: "ops" as const,
  request,
  requester: { id: "user_a", name: "Sample client", email: "client@example.test", role: "client" as const },
  staff: [{ id: "staff_me", name: "Staff Me", email: "me@example.test", role: "ops_admin" as const }],
  now: Date.parse("2026-10-09T02:00:00Z"),
  onClose: vi.fn(),
  onSaved: vi.fn(),
  onStale: vi.fn(),
};

beforeEach(() => {
  api.updatePrivacyRequest.mockReset().mockImplementation(async (_id: string, patch: object) => ({
    request: { ...request, ...patch, revision: 4 },
  }));
});
afterEach(cleanup);

it("shows the requester's words and what to do by hand", async () => {
  render(<PrivacyRequestSheet {...props} />);
  expect(await screen.findByText("Please delete my account.")).toBeInTheDocument();
  expect(screen.getByText(/delete the account and personal data by hand/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "What they agreed to" })).toHaveAttribute(
    "href",
    "/ops/acceptance-log?user=user_a",
  );
});

it("will not complete a request without the answer the requester reads", async () => {
  const user = userEvent.setup();
  render(<PrivacyRequestSheet {...props} />);
  await user.click(await screen.findByText("Completed"));
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByText("Write what was done. The requester reads this.")).toBeInTheDocument();
  expect(api.updatePrivacyRequest).not.toHaveBeenCalled();

  await user.type(screen.getByLabelText(/Your answer to them/), "Deleted. Invoices are kept by law.");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(api.updatePrivacyRequest).toHaveBeenCalledTimes(1));
  expect(api.updatePrivacyRequest).toHaveBeenCalledWith("pr_1", {
    expectedRevision: 3,
    status: "completed",
    resolution: "Deleted. Invoices are kept by law.",
  });
  expect(props.onSaved).toHaveBeenCalled();
});

it("assigns to the signed-in staff member and sends only that change", async () => {
  const user = userEvent.setup();
  render(<PrivacyRequestSheet {...props} />);
  await user.click(await screen.findByRole("button", { name: "Assign to me" }));
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(api.updatePrivacyRequest).toHaveBeenCalledWith("pr_1", { expectedRevision: 3, handlerId: "staff_me" }),
  );
});
