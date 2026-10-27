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
import type {
  ClientAccount as ClientAccountRecord,
  FoundingTesterProgress,
  FoundingTesterRow,
  TesterInvite,
} from "@/lib/api/types";

const { api, nav, live, sharing } = vi.hoisted(() => ({
  sharing: { readAllShareTaps: vi.fn() },
  live: { reloads: new Set<() => Promise<void> | void>() },
  api: {
    listFoundingTesters: vi.fn(),
    listUsers: vi.fn(),
    getClientAccount: vi.fn(),
    listTesterInvites: vi.fn(),
    listTesterRewards: vi.fn(),
  },
  nav: { push: vi.fn(), params: new URLSearchParams() },
}));

vi.stubGlobal("React", React);
vi.stubGlobal("PointerEvent", MouseEvent);
vi.mock("@/lib/live/useLiveReload", () => ({
  useLiveReload: (_keys: unknown, reload: () => Promise<void> | void) => {
    live.reloads.add(reload);
  },
}));
/** A live update: every list on screen re-reads. */
const liveUpdate = () =>
  act(async () => {
    await Promise.all([...live.reloads].map((reload) => reload()));
  });
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  useSearchParams: () => nav.params,
  usePathname: () => "/ops/founding-testers",
}));
vi.mock("@/lib/api/sharing-reminders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/sharing-reminders")>(
    "@/lib/api/sharing-reminders",
  );
  return { ...actual, ...sharing };
});
vi.mock("@/lib/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, ...api };
});

import { ClientAccount } from "@/components/founding-testers/ClientAccount";
import { FoundingTestersList } from "@/components/founding-testers/FoundingTestersList";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  live.reloads.clear();
  nav.params = new URLSearchParams();
});

const budget = {
  month: "2026-10",
  timezone: "Asia/Manila" as const,
  limitMinor: null,
  usedMinor: 0,
  remainingMinor: null,
  resumePolicy: "super_admin_per_reward" as const,
};

beforeEach(() => {
  api.listTesterInvites.mockResolvedValue({ serverTime: "", total: 0, invites: [] });
  api.listTesterRewards.mockResolvedValue({
    serverTime: "",
    total: 0,
    rewards: [],
    budget,
  });
  api.listUsers.mockResolvedValue([]);
  sharing.readAllShareTaps.mockResolvedValue(new Map());
});

const progress = (
  overrides: Partial<FoundingTesterProgress> = {},
): FoundingTesterProgress => ({
  eligible: true,
  label: null,
  awardedAt: null,
  missions: { added: true, placed: false, tracked: false, received: false, rated: false },
  completedCount: 1,
  rewardStatus: "pending",
  reward: null,
  ...overrides,
});

const earned = progress({
  label: "Founding Tester",
  awardedAt: "2026-10-20T08:00:00.000Z",
  missions: { added: true, placed: true, tracked: true, received: true, rated: true },
  completedCount: 5,
  rewardStatus: "issued",
  reward: {
    id: "vch_1",
    campaignId: "vcamp_1",
    valueMinor: 1500,
    status: "available",
    issuedAt: "2026-10-20T08:00:00.000Z",
    expiresAt: "2026-11-19T08:00:00.000Z",
    secondsRemaining: 100,
    redeemable: true,
    reservation: null,
    fundedBy: "GRIDGO",
    transferable: false,
    cashValue: false,
    code: "PRIVATECODE",
  } as FoundingTesterProgress["reward"],
});

function clients(from: number, count: number): FoundingTesterRow[] {
  return Array.from({ length: count }, (_, i) => ({
    clientId: `c${from + i}`,
    name: `Client ${from + i}`,
    foundingTester: from + i === 1 ? earned : progress(),
  }));
}

describe("Founding Testers view", () => {
  it("shows each client's Share and Send to a friend taps, zero included", async () => {
    api.listFoundingTesters.mockResolvedValue({
      serverTime: "2026-10-20T08:00:00.000Z",
      total: 2,
      clients: clients(1, 2),
    });
    sharing.readAllShareTaps.mockResolvedValue(
      new Map([
        ["c1", { clientId: "c1", shareTaps: 3, sendToFriendTaps: 2 }],
        ["c2", { clientId: "c2", shareTaps: 0, sendToFriendTaps: 0 }],
      ]),
    );
    render(<FoundingTestersList tree="ops" />);

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: /Share taps/ })).toBeInTheDocument();
    const first = within((await within(table).findByText("Client 1")).closest("tr")!);
    expect(first.getByLabelText("3 Share, 2 Send to a friend")).toHaveTextContent(
      "3 Share2 Send to a friend",
    );
    const second = within(within(table).getByText("Client 2").closest("tr")!);
    expect(second.getByLabelText("0 Share, 0 Send to a friend")).toBeInTheDocument();
  });

  it("still reads when share taps cannot, with a dash in their place", async () => {
    api.listFoundingTesters.mockResolvedValue({
      serverTime: "2026-10-20T08:00:00.000Z",
      total: 1,
      clients: clients(1, 1),
    });
    sharing.readAllShareTaps.mockRejectedValue(new ApiError(404, { error: "not_found" }));
    render(<FoundingTestersList tree="ops" />);

    const table = await screen.findByRole("table");
    const first = within((await within(table).findByText("Client 1")).closest("tr")!);
    expect(first.getByLabelText("Share taps not available")).toHaveTextContent("—");
    expect(first.getByText("Founding Tester")).toBeVisible();
  });

  // A full page draws 100 rows, which is slow under a loaded full-suite run.
  it(
    "reads 100 a page, shows the range, and pages forward through the URL",
    { timeout: 20_000 },
    async () => {
      api.listFoundingTesters.mockResolvedValue({
        serverTime: "2026-10-20T08:00:00.000Z",
        total: 245,
        clients: clients(1, 100),
      });
      api.listUsers.mockResolvedValue([{ id: "c1", name: "Client 1", role: "client" }]);
      render(<FoundingTestersList tree="ops" />);

      expect(await screen.findByText("Clients 1–100 of 245")).toBeVisible();
      expect(api.listFoundingTesters).toHaveBeenCalledWith({ offset: 0, limit: 100 });
      expect(api.listUsers).toHaveBeenCalledWith("client", { foundingTester: true });
      const pages = screen.getByRole("navigation", { name: "Founding Tester pages" });
      expect(within(pages).getByRole("button", { name: "Previous" })).toBeDisabled();
      fireEvent.click(within(pages).getByRole("button", { name: "Next" }));
      expect(nav.push).toHaveBeenCalledWith("/ops/founding-testers?page=2");
    },
  );

  it("reads the page in the URL and stops at the last one", async () => {
    nav.params = new URLSearchParams("page=3");
    api.listFoundingTesters.mockResolvedValue({
      serverTime: "2026-10-20T08:00:00.000Z",
      total: 245,
      clients: clients(201, 45),
    });
    api.listUsers.mockResolvedValue([]);
    render(<FoundingTestersList tree="admin" />);

    expect(await screen.findByText("Clients 201–245 of 245")).toBeVisible();
    expect(api.listFoundingTesters).toHaveBeenCalledWith({ offset: 200, limit: 100 });
    const pages = screen.getByRole("navigation", { name: "Founding Tester pages" });
    expect(within(pages).getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(within(pages).getByRole("button", { name: "Previous" }));
    expect(nav.push).toHaveBeenCalledWith("/admin/founding-testers?page=2");
  });

  it("shows each client's progress, label and reward, and opens the account in the tree", async () => {
    api.listFoundingTesters.mockResolvedValue({
      serverTime: "2026-10-20T08:00:00.000Z",
      total: 2,
      clients: clients(1, 2),
    });
    api.listUsers.mockResolvedValue([{ id: "c1", name: "Client 1", role: "client" }]);
    render(<FoundingTestersList tree="admin" />);

    const table = await screen.findByRole("table");
    const first = within((await within(table).findByText("Client 1")).closest("tr")!);
    expect(first.getByRole("img", { name: /5 of 5 steps done/ })).toBeInTheDocument();
    expect(first.getByText("Founding Tester")).toBeVisible();
    expect(
      first.getByText("₱15.00 voucher, expires Nov 19, 2026, 4:00 PM."),
    ).toBeVisible();
    expect(first.getByText("Open client account").closest("a")).toHaveAttribute(
      "href",
      "/admin/founding-testers/c1",
    );
    const second = within(within(table).getByText("Client 2").closest("tr")!);
    expect(
      second.getByRole("img", { name: "1 of 5 steps done: add an item to your cart" }),
    ).toBeInTheDocument();
    expect(second.getByText("Not yet")).toBeVisible();
    expect(screen.queryByText(/PRIVATECODE/)).toBeNull();
    // One page: nothing to page to.
    await waitFor(() =>
      expect(
        within(
          screen.getByRole("navigation", { name: "Founding Tester pages" }),
        ).getByRole("button", { name: "Next" }),
      ).toBeDisabled(),
    );
  });
});

describe("Client account", () => {
  const account = (
    overrides: Partial<ClientAccountRecord> = {},
  ): ClientAccountRecord => ({
    id: "c1",
    email: "ana@example.test",
    name: "Ana Client",
    role: "client",
    createdAt: "2026-10-01T02:00:00.000Z",
    foundingTester: earned,
    ...overrides,
  });

  it("shows the label, all five steps, and the voucher with its expiry but not its code", async () => {
    api.getClientAccount.mockResolvedValue(account());
    render(<ClientAccount userId="c1" tree="ops" />);

    const section = within(
      await screen.findByRole("region", { name: "Founding Tester" }),
    );
    expect(api.getClientAccount).toHaveBeenCalledWith("c1");
    expect(section.getByText(/Earned Oct 20, 2026, 4:00 PM/)).toBeVisible();
    expect(section.getAllByText("Done")).toHaveLength(5);
    expect(section.getByText("1. Add an item to your cart")).toBeVisible();
    expect(section.getByText("3. Track your order")).toBeVisible();
    expect(section.getByText("Payment confirmed")).toBeVisible();
    expect(section.getByText("Delivery or hub hand-out confirmed")).toBeVisible();
    expect(section.getByText("Survey sent")).toBeVisible();
    expect(
      section.getByText("₱15.00 voucher, expires Nov 19, 2026, 4:00 PM."),
    ).toBeVisible();
    expect(screen.queryByText(/PRIVATECODE/)).toBeNull();
  });

  it("shows progress and what the reward will be before completion", async () => {
    api.getClientAccount.mockResolvedValue(account({ foundingTester: progress() }));
    render(<ClientAccount userId="c1" tree="ops" />);

    const section = within(
      await screen.findByRole("region", { name: "Founding Tester" }),
    );
    expect(section.getByText("Not yet", { selector: ".gg-chip span" })).toBeVisible();
    expect(section.getAllByText("Done")).toHaveLength(1);
    expect(section.getByText(/added when all five steps are done/)).toBeVisible();
  });

  it("explains an account that cannot earn it", async () => {
    api.getClientAccount.mockResolvedValue(
      account({
        foundingTester: progress({ eligible: false, rewardStatus: "ineligible" }),
      }),
    );
    render(<ClientAccount userId="c1" tree="ops" />);

    const section = within(
      await screen.findByRole("region", { name: "Founding Tester" }),
    );
    expect(section.getByText("Not eligible")).toBeVisible();
    expect(
      section.getByText(/created on or after the Founding Tester launch date/),
    ).toBeVisible();
  });

  const invite = (n: number, joined: boolean): TesterInvite => ({
    id: `tinv_${n}`,
    inviterId: "c1",
    code: "ABC",
    email: `friend${n}@example.test`,
    clientId: joined ? `f${n}` : null,
    createdAt: "2026-10-20T08:00:00.000Z",
    matchedAt: joined ? "2026-10-20T08:00:00.000Z" : null,
    completedAt: null,
    unmatchedReason: joined ? null : "no_client_account",
  });

  it("counts every invite across pages, not just the first 500", async () => {
    api.getClientAccount.mockResolvedValue(account());
    api.listTesterInvites
      .mockResolvedValueOnce({
        serverTime: "",
        total: 501,
        invites: Array.from({ length: 500 }, (_, i) => invite(i, true)),
      })
      .mockResolvedValueOnce({
        serverTime: "",
        total: 501,
        invites: [invite(500, false)],
      });
    render(<ClientAccount userId="c1" tree="ops" />);

    const section = within(
      await screen.findByRole("region", { name: "Founding Tester" }),
    );
    expect(await section.findByText(/501 invited · 500\s+joined/)).toBeVisible();
    expect(api.listTesterInvites).toHaveBeenNthCalledWith(
      1,
      { inviterId: "c1" },
      { offset: 0, limit: 500 },
    );
    expect(api.listTesterInvites).toHaveBeenNthCalledWith(
      2,
      { inviterId: "c1" },
      { offset: 500, limit: 500 },
    );
    expect(section.getByText(/1 form response is/)).toBeVisible();
  });

  it("warns when a refresh fails, keeps the last read, and retries", async () => {
    api.getClientAccount.mockResolvedValueOnce(account());
    render(<ClientAccount userId="c1" tree="ops" />);
    await screen.findByRole("region", { name: "Founding Tester" });

    api.getClientAccount.mockRejectedValueOnce(
      new ApiError(503, { error: "unavailable" }),
    );
    await liveUpdate();
    const banner = (await screen.findAllByRole("alert")).find((node) =>
      /Out of date:/.test(node.textContent ?? ""),
    );
    expect(banner).toBeDefined();
    expect(banner).toHaveTextContent("The API failed processing this request.");
    // The last read stays on screen.
    expect(screen.getByRole("heading", { name: "Ana Client" })).toBeVisible();

    api.getClientAccount.mockResolvedValueOnce(account({ name: "Ana Renamed" }));
    fireEvent.click(within(banner!).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Ana Renamed" })).toBeVisible();
    expect(screen.queryByText(/Out of date:/)).toBeNull();
  });

  it("keeps invite counts marked out of date when only the invites fail to refresh", async () => {
    api.getClientAccount.mockResolvedValue(account());
    api.listTesterInvites.mockResolvedValueOnce({
      serverTime: "",
      total: 1,
      invites: [invite(1, true)],
    });
    render(<ClientAccount userId="c1" tree="ops" />);
    const section = within(
      await screen.findByRole("region", { name: "Founding Tester" }),
    );
    await section.findByText(/1 invited/);

    api.listTesterInvites.mockRejectedValueOnce(
      new ApiError(503, { error: "unavailable" }),
    );
    await liveUpdate();
    expect(await section.findByText(/These counts may be out of date:/)).toBeVisible();
    expect(section.getByText(/1 invited/)).toBeVisible();
  });

  it("hides invites only on an API without them, and says so on any other failure", async () => {
    api.getClientAccount.mockResolvedValue(account());
    api.listTesterInvites.mockRejectedValueOnce(
      new ApiError(404, { error: "not_found" }),
    );
    render(<ClientAccount userId="c1" tree="ops" />);
    let section = within(await screen.findByRole("region", { name: "Founding Tester" }));
    await waitFor(() => expect(api.listTesterInvites).toHaveBeenCalled());
    expect(section.queryByRole("heading", { name: "Invites" })).toBeNull();
    expect(section.queryByRole("alert")).toBeNull();
    cleanup();

    api.listTesterInvites.mockRejectedValueOnce(
      new ApiError(403, { error: "forbidden" }),
    );
    render(<ClientAccount userId="c1" tree="ops" />);
    section = within(await screen.findByRole("region", { name: "Founding Tester" }));
    expect(await section.findByRole("alert")).toHaveTextContent(
      "This action is restricted to Operations and Super Admin.",
    );
  });
});
