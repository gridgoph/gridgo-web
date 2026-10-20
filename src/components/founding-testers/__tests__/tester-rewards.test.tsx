// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { TesterBudget, TesterReward } from "@/lib/api/types";

const { live } = vi.hoisted(() => ({
  live: { reload: null as null | (() => Promise<void> | void) },
}));
const { api } = vi.hoisted(() => ({
  api: {
    listTesterRewards: vi.fn(),
    voidTesterReward: vi.fn(),
    resumeTesterReward: vi.fn(),
    listTesterInvites: vi.fn(),
    recordTesterInvite: vi.fn(),
    matchTesterInvites: vi.fn(),
    listUsers: vi.fn(),
  },
}));

vi.stubGlobal("React", React);
vi.stubGlobal("PointerEvent", MouseEvent);
vi.mock("@/lib/live/useLiveReload", () => ({
  useLiveReload: (_keys: unknown, reload: () => Promise<void> | void) => {
    live.reload = reload;
  },
}));
vi.mock("@/lib/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, ...api };
});

import { TesterInvitesList } from "@/components/founding-testers/TesterInvitesList";
import { TesterRewardsList } from "@/components/founding-testers/TesterRewardsList";

const budget: TesterBudget = {
  month: "2026-10",
  timezone: "Asia/Manila",
  limitMinor: 3000,
  usedMinor: 3000,
  remainingMinor: 0,
  resumePolicy: "super_admin_per_reward",
};

const check = (status: "match" | "no_match" | "missing", extra = {}) => ({
  status,
  comparedClientIds: status === "missing" ? [] : ["inviter"],
  missingClientIds: [] as string[],
  matchedClientIds: status === "match" ? ["inviter"] : [],
  ...extra,
});

const base: TesterReward = {
  id: "trwd_issued",
  kind: "referral",
  clientId: "friend",
  inviterId: "inviter",
  inviteId: "tinv_1",
  amountMinor: 3000,
  status: "issued",
  createdAt: "2026-10-20T08:00:00.000Z",
  issuedAt: "2026-10-20T08:00:00.000Z",
  voidedAt: null,
  voucherId: "vch_1",
  inviterVoucherId: "vch_2",
  reason: null,
  checks: {
    phone: check("no_match"),
    device: check("missing", { missingClientIds: ["friend"] }),
    address: check("no_match"),
  },
};
const paused: TesterReward = {
  ...base,
  id: "trwd_paused",
  kind: "mission",
  clientId: "ben",
  inviterId: null,
  inviteId: null,
  amountMinor: 1500,
  status: "paused",
  issuedAt: null,
  voucherId: null,
  inviterVoucherId: null,
  reason: "monthly_budget",
  checks: {},
};
const blocked: TesterReward = {
  ...base,
  id: "trwd_blocked",
  clientId: "cara",
  status: "blocked",
  issuedAt: null,
  voucherId: null,
  inviterVoucherId: null,
  reason: "same_phone",
  checks: {
    phone: check("match"),
    device: check("no_match"),
    address: check("no_match"),
  },
};

const people = [
  { id: "friend", name: "Faye Friend", role: "client" },
  { id: "inviter", name: "Ana Inviter", role: "client" },
  { id: "ben", name: "Ben Tester", role: "client" },
  { id: "cara", name: "Cara Copy", role: "client" },
];

beforeEach(() => {
  api.listUsers.mockResolvedValue(people);
  api.listTesterRewards.mockResolvedValue({
    serverTime: "2026-10-20T08:00:00.000Z",
    total: 3,
    rewards: [base, paused, blocked],
    budget,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** A live update re-reads the list with whatever the API now answers. */
const refreshWith = async (rewards: TesterReward[]) => {
  api.listTesterRewards.mockResolvedValue({
    serverTime: "2026-10-21T08:00:00.000Z",
    total: rewards.length,
    rewards,
    budget,
  });
  await act(async () => {
    await live.reload?.();
  });
};

const row = async (name: string) =>
  within(
    (await within(await screen.findByRole("table")).findByText(name)).closest("tr")!,
  );

describe("Tester rewards", () => {
  it("shows each state in words with this month's budget and the invite checks", async () => {
    render(<TesterRewardsList tree="ops" />);
    const issued = await row("Faye Friend");
    expect(issued.getByText("Invited by Ana Inviter")).toBeVisible();
    expect(issued.getByText("Issued")).toBeVisible();
    expect(issued.getByText("₱15.00 each to the friend and the inviter")).toBeVisible();
    expect(issued.getByText("Phone number: No match")).toBeVisible();
    expect(issued.getByText("App installation: No evidence")).toBeVisible();
    expect(issued.getByText("Some evidence missing")).toBeVisible();

    const held = await row("Ben Tester");
    expect(held.getByText("Paused by budget")).toBeVisible();
    expect(held.getByText("None (five-step reward)")).toBeVisible();

    const stopped = await row("Cara Copy");
    expect(stopped.getByText("Blocked")).toBeVisible();
    expect(stopped.getByText(/Same phone number as an earlier account/)).toBeVisible();
    expect(stopped.getByText("Phone number: Match")).toBeVisible();

    expect(screen.getByText("₱30.00 of ₱30.00")).toBeVisible();
    expect(screen.getByText(/Nothing left: new rewards pause/)).toBeVisible();
  });

  it("reviews a reward's checks: who was compared and whose evidence was missing", async () => {
    render(<TesterRewardsList tree="ops" />);
    fireEvent.click(
      (await row("Faye Friend")).getByRole("button", { name: "Review checks" }),
    );
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getAllByText("Compared with Ana Inviter.")).toHaveLength(2);
    expect(dialog.getByText("Nothing on record for the friend.")).toBeVisible();
    expect(
      dialog.getByText(/Missing evidence is neither a match nor a pass/),
    ).toBeVisible();
  });

  it("gives Operations no void or resume", async () => {
    render(<TesterRewardsList tree="ops" />);
    await row("Faye Friend");
    expect(screen.queryByRole("button", { name: "Void" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
    expect(
      screen.getByText("Only Super Admin can void or resume a reward."),
    ).toBeVisible();
  });

  it("gives Super Admin void on issued and paused, resume on paused, nothing on a block", async () => {
    render(<TesterRewardsList tree="admin" />);
    const issued = await row("Faye Friend");
    expect(issued.getByRole("button", { name: "Void" })).toBeVisible();
    expect(issued.queryByRole("button", { name: "Resume" })).toBeNull();
    const held = await row("Ben Tester");
    expect(held.getByRole("button", { name: "Void" })).toBeVisible();
    expect(held.getByRole("button", { name: "Resume" })).toBeVisible();
    const stopped = await row("Cara Copy");
    expect(stopped.queryByRole("button", { name: "Void" })).toBeNull();
    expect(stopped.queryByRole("button", { name: "Resume" })).toBeNull();
  });

  it("voids only after a confirmation with a reason", async () => {
    api.voidTesterReward.mockResolvedValue({
      reward: {
        ...base,
        status: "voided",
        voidedAt: "2026-10-21T08:00:00.000Z",
        reason: "Same household",
      },
      budget,
    });
    render(<TesterRewardsList tree="admin" />);
    fireEvent.click((await row("Faye Friend")).getByRole("button", { name: "Void" }));
    const confirm = within(await screen.findByRole("alertdialog"));
    expect(
      confirm.getByText(/Both unused vouchers, the friend's and the inviter's/),
    ).toBeVisible();
    expect(confirm.getByText(/frees no budget/)).toBeVisible();
    const go = confirm.getByRole("button", { name: "Void reward" });
    expect(go).toBeDisabled();
    fireEvent.change(confirm.getByLabelText("Why it is being voided"), {
      target: { value: "  Same household  " },
    });
    fireEvent.click(go);
    await waitFor(() =>
      expect(api.voidTesterReward).toHaveBeenCalledWith("trwd_issued", "Same household"),
    );
    expect(await screen.findByText("Reward voided.")).toBeVisible();
  });

  it("explains a void the API refuses while a checkout holds a voucher", async () => {
    api.voidTesterReward.mockRejectedValue(
      new ApiError(409, { error: "voucher_payment_reconciliation_required" }),
    );
    render(<TesterRewardsList tree="admin" />);
    fireEvent.click((await row("Faye Friend")).getByRole("button", { name: "Void" }));
    const confirm = within(await screen.findByRole("alertdialog"));
    fireEvent.change(confirm.getByLabelText("Why it is being voided"), {
      target: { value: "Duplicate" },
    });
    fireEvent.click(confirm.getByRole("button", { name: "Void reward" }));
    expect(
      await confirm.findByText(/on a checkout waiting for payment review/),
    ).toBeVisible();
  });

  it("resumes with a reason and says when it is still paused", async () => {
    api.resumeTesterReward.mockResolvedValue({ reward: paused, budget });
    render(<TesterRewardsList tree="admin" />);
    fireEvent.click((await row("Ben Tester")).getByRole("button", { name: "Resume" }));
    const confirm = within(await screen.findByRole("alertdialog"));
    expect(confirm.getByText(/With no room in the budget it stays paused/)).toBeVisible();
    fireEvent.change(confirm.getByLabelText("Why it can go now"), {
      target: { value: "November budget approved" },
    });
    fireEvent.click(confirm.getByRole("button", { name: "Resume reward" }));
    await waitFor(() =>
      expect(api.resumeTesterReward).toHaveBeenCalledWith(
        "trwd_paused",
        "November budget approved",
      ),
    );
    expect(
      await screen.findByText("Still paused: the monthly budget has no room for it yet."),
    ).toBeVisible();
  });

  it("keeps the review dialog on the latest copy of the reward, and closes it when the reward leaves the list", async () => {
    render(<TesterRewardsList tree="ops" />);
    fireEvent.click(
      (await row("Faye Friend")).getByRole("button", { name: "Review checks" }),
    );
    let dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Issued")).toBeVisible();

    await refreshWith([
      { ...base, status: "voided", voidedAt: "2026-10-21T08:00:00.000Z", reason: "Dup" },
      paused,
      blocked,
    ]);
    dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Voided")).toBeVisible();
    expect(dialog.queryByText("Issued")).toBeNull();

    await refreshWith([paused, blocked]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      screen.getByText(
        "The reward you were reviewing changed and is no longer in this list.",
      ),
    ).toBeVisible();
  });

  it("closes a confirmation the reward can no longer take, and does nothing", async () => {
    render(<TesterRewardsList tree="admin" />);
    fireEvent.click((await row("Ben Tester")).getByRole("button", { name: "Resume" }));
    const confirm = within(await screen.findByRole("alertdialog"));
    fireEvent.change(confirm.getByLabelText("Why it can go now"), {
      target: { value: "Budget raised" },
    });

    await refreshWith([
      base,
      { ...paused, status: "issued", issuedAt: "2026-10-21T08:00:00.000Z", reason: null },
      blocked,
    ]);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(
      screen.getByText(
        "That reward changed while you were confirming: it is now issued. Nothing was done.",
      ),
    ).toBeVisible();
    expect(api.resumeTesterReward).not.toHaveBeenCalled();
  });

  it("says a refused void is Super Admin's, and never shows a raw error code", async () => {
    api.voidTesterReward.mockRejectedValueOnce(new ApiError(403, { error: "forbidden" }));
    render(<TesterRewardsList tree="admin" />);
    fireEvent.click((await row("Faye Friend")).getByRole("button", { name: "Void" }));
    let confirm = within(await screen.findByRole("alertdialog"));
    fireEvent.change(confirm.getByLabelText("Why it is being voided"), {
      target: { value: "Duplicate" },
    });
    fireEvent.click(confirm.getByRole("button", { name: "Void reward" }));
    expect(
      await confirm.findByText("Only Super Admin can void or resume a reward."),
    ).toBeVisible();

    api.voidTesterReward.mockRejectedValueOnce(
      new ApiError(500, { error: "tester_reward_internal_mystery" }),
    );
    confirm = within(screen.getByRole("alertdialog"));
    fireEvent.click(confirm.getByRole("button", { name: "Void reward" }));
    expect(
      await confirm.findByText(
        "The API failed processing this request. Retry in a moment.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/tester_reward_internal_mystery/)).toBeNull();
  });

  it("filters by state through the API", async () => {
    render(<TesterRewardsList tree="ops" />);
    await row("Faye Friend");
    fireEvent.click(screen.getByRole("button", { name: "Paused" }));
    await waitFor(() =>
      expect(api.listTesterRewards).toHaveBeenLastCalledWith(
        { status: "paused", clientId: undefined },
        { offset: 0, limit: 100 },
      ),
    );
  });
});

describe("Tester invites", () => {
  beforeEach(() => {
    api.listTesterInvites.mockResolvedValue({
      serverTime: "2026-10-20T08:00:00.000Z",
      total: 1,
      invites: [
        {
          id: "tinv_1",
          inviterId: "inviter",
          code: "ABC",
          email: "nobody@example.test",
          clientId: null,
          createdAt: "2026-10-20T08:00:00.000Z",
          matchedAt: null,
          completedAt: null,
          unmatchedReason: "no_client_account",
          status: "unmatched",
        },
      ],
    });
  });

  it("lists unmatched entries with the reason", async () => {
    render(<TesterInvitesList />);
    const entry = await row("nobody@example.test");
    expect(entry.getByText("Unmatched")).toBeVisible();
    expect(entry.getByText("No client account uses this email yet.")).toBeVisible();
    expect(entry.getByText("Ana Inviter")).toBeVisible();
  });

  it("records a form response and explains a wrong code", async () => {
    api.recordTesterInvite.mockRejectedValueOnce(
      new ApiError(400, { error: "invalid_tester_invite_code" }),
    );
    render(<TesterInvitesList />);
    await row("nobody@example.test");
    fireEvent.change(screen.getByLabelText("Invite code"), { target: { value: "nope" } });
    fireEvent.change(screen.getByLabelText("Friend’s email"), {
      target: { value: "faye@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record response" }));
    expect(await screen.findByText(/No client has that invite code/)).toBeVisible();

    api.recordTesterInvite.mockResolvedValueOnce({
      id: "tinv_2",
      inviterId: "inviter",
      code: "ABC",
      email: "faye@example.test",
      clientId: "friend",
      createdAt: "2026-10-20T08:00:00.000Z",
      matchedAt: "2026-10-20T08:00:00.000Z",
      completedAt: null,
      unmatchedReason: null,
    });
    fireEvent.change(screen.getByLabelText("Invite code"), { target: { value: "ABC" } });
    fireEvent.click(screen.getByRole("button", { name: "Record response" }));
    await waitFor(() =>
      expect(api.recordTesterInvite).toHaveBeenLastCalledWith({
        code: "ABC",
        email: "faye@example.test",
      }),
    );
    expect(await screen.findByText("Recorded and matched to Faye Friend.")).toBeVisible();
  });

  it("explains a refused invite without calling it Super Admin's or showing the code", async () => {
    api.recordTesterInvite.mockRejectedValueOnce(
      new ApiError(403, { error: "forbidden" }),
    );
    render(<TesterInvitesList />);
    await row("nobody@example.test");
    fireEvent.change(screen.getByLabelText("Invite code"), { target: { value: "ABC" } });
    fireEvent.change(screen.getByLabelText("Friend’s email"), {
      target: { value: "faye@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record response" }));
    expect(
      await screen.findByText("This action is restricted to Operations and Super Admin."),
    ).toBeVisible();
    expect(screen.queryByText(/Only Super Admin/)).toBeNull();

    api.recordTesterInvite.mockRejectedValueOnce(
      new ApiError(409, { error: "tester_invite_mystery" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Record response" }));
    expect(
      await screen.findByText(
        /The platform refused this change because the record moved on/,
      ),
    ).toBeVisible();
    expect(screen.queryByText(/tester_invite_mystery/)).toBeNull();
  });
});
