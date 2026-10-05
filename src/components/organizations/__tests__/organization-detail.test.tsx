// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { OrganizationDetail } from "@/components/organizations/OrganizationDetail";
import { ApiError } from "@/lib/api/client";
import type { OrganizationAccount } from "@/lib/api/types";

vi.stubGlobal("React", React);

const organization: OrganizationAccount = {
  userId: "user_org",
  name: "Student Council",
  school: "City College",
  email: "council@example.test",
  currentOfficer: {
    id: "officer_2",
    fullName: "Officer Two",
    startedAt: "2026-09-01T00:00:00.000Z",
    endedAt: null,
    verifiedAt: "2026-09-01T00:00:00.000Z",
  },
  confirmedAt: "2026-09-01T00:00:00.000Z",
  nextConfirmationAt: "2026-12-01T00:00:00.000Z",
  confirmationRequestedAt: null,
  approvalCase: { id: "apc", status: "approved", version: 7, applicationRevision: 2 },
  actions: ["confirm_officer", "change_officer"],
  officerHistory: [
    {
      id: "officer_1",
      fullName: "Officer One",
      startedAt: "2026-06-01T00:00:00.000Z",
      endedAt: "2026-09-01T00:00:00.000Z",
      verifiedAt: "2026-06-01T00:00:00.000Z",
    },
    {
      id: "officer_2",
      fullName: "Officer Two",
      startedAt: "2026-09-01T00:00:00.000Z",
      endedAt: null,
      verifiedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
};

const getOrganization = vi.hoisted(() => vi.fn(async () => organization));
const sendOrganizationNotice = vi.hoisted(() =>
  vi.fn<
    (
      userId: string,
      input: { title: string; body: string },
      key: string,
    ) => Promise<{ notificationId: string }>
  >(async () => ({ notificationId: "ntf_1" })),
);

vi.mock("@/lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")),
  getOrganization,
  sendOrganizationNotice,
}));

afterEach(() => {
  cleanup();
  sendOrganizationNotice.mockReset();
  sendOrganizationNotice.mockResolvedValue({ notificationId: "ntf_1" });
});

it("shows the officer of record with its dated history, newest first", async () => {
  render(<OrganizationDetail tree="ops" userId="user_org" />);

  expect(
    await screen.findByRole("heading", { name: "Student Council" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Officer verified")).toBeInTheDocument();
  expect(screen.getByText(/Next reminder to confirm Officer Two on/)).toBeInTheDocument();
  const history = screen.getByRole("list", { name: "Officers of record, newest first" });
  const names = Array.from(history.querySelectorAll("li")).map(
    (item) => item.textContent ?? "",
  );
  expect(names[0]).toMatch(/^Officer TwoCurrent officer/);
  expect(names[1]).toMatch(/^Officer One.* to /);
  expect(screen.getByRole("button", { name: /Statement/ })).toHaveAttribute(
    "href",
    "/ops/organizations/user_org/statement",
  );
});

it("sends a notice once, after confirming the recipient, with one key per wording", async () => {
  render(<OrganizationDetail tree="admin" userId="user_org" />);

  await userEvent.click(await screen.findByRole("button", { name: "Send notice" }));
  expect(screen.getByText("Give the notice a title.")).toBeInTheDocument();
  expect(sendOrganizationNotice).not.toHaveBeenCalled();

  await userEvent.type(screen.getByLabelText("Title"), "Update your officer");
  await userEvent.type(
    screen.getByLabelText("Message"),
    "Please confirm who leads this term.",
  );
  expect(screen.getByLabelText("How it reads in the app inbox")).toHaveTextContent(
    "Update your officer",
  );
  await userEvent.click(screen.getByRole("button", { name: "Send notice" }));
  expect(screen.getByText("Send this notice to Student Council?")).toBeInTheDocument();
  expect(
    screen.getByText(/Officer Two reads it on the organization's shared login/),
  ).toBeInTheDocument();

  // First attempt fails; the retry of the same wording reuses its key.
  sendOrganizationNotice.mockRejectedValueOnce(new ApiError(500, { error: "internal" }));
  await userEvent.click(screen.getAllByRole("button", { name: "Send notice" }).at(-1)!);
  expect(
    await screen.findByText(/The API failed processing this request/),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Send notice" }));
  await userEvent.click(screen.getAllByRole("button", { name: "Send notice" }).at(-1)!);

  expect(await screen.findByText("Sent from this page")).toBeInTheDocument();
  expect(sendOrganizationNotice).toHaveBeenCalledTimes(2);
  const [first, second] = sendOrganizationNotice.mock.calls;
  expect(first[0]).toBe("user_org");
  expect(first[1]).toEqual({
    title: "Update your officer",
    body: "Please confirm who leads this term.",
  });
  expect(second[2]).toBe(first[2]);
  expect(screen.getByLabelText("Title")).toHaveValue("");
});
