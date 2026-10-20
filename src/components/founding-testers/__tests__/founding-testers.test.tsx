// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ClientAccount as ClientAccountRecord,
  FoundingTesterProgress,
  FoundingTesterRow,
} from "@/lib/api/types";

const { api, nav } = vi.hoisted(() => ({
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
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  useSearchParams: () => nav.params,
  usePathname: () => "/ops/founding-testers",
}));
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
});
