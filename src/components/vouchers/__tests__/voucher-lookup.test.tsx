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
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { TesterReward, Voucher } from "@/lib/api/types";

const { api } = vi.hoisted(() => ({
  api: {
    listUsers: vi.fn(),
    lookupClientVouchers: vi.fn(),
    listTesterRewards: vi.fn(),
    voidVoucher: vi.fn(),
    reissueVoucher: vi.fn(),
  },
}));

vi.stubGlobal("React", React);
vi.stubGlobal("PointerEvent", MouseEvent);
vi.mock("@/lib/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, ...api };
});

import { VoucherLookup } from "@/components/vouchers/VoucherLookup";

const voucher = (overrides: Partial<Voucher>): Voucher => ({
  id: "vch_x",
  campaignId: "vcamp_1",
  name: "Voucher",
  valueMinor: 1500,
  status: "available",
  issuedAt: "2026-10-20T08:00:00.000Z",
  expiresAt: "2099-01-01T00:00:00.000Z",
  secondsRemaining: 1_000_000,
  redeemable: true,
  reservation: null,
  fundedBy: "GRIDGO",
  transferable: false,
  cashValue: false,
  ...overrides,
});

// Programme ownership comes from the reward rows' voucher ids, never names:
// the campaign voucher below is named like a tester reward and is not one.
const missionVoucher = voucher({ id: "vch_mission", name: "Thank you" });
const inviteVoucher = voucher({ id: "vch_invite", name: "Welcome", status: "void" });
const campaignAvailable = voucher({ id: "vch_camp", name: "Founding Tester thanks" });
const campaignVoided = voucher({ id: "vch_camp_void", name: "Promo", status: "void" });

const reward = (overrides: Partial<TesterReward>): TesterReward => ({
  id: "trwd_1",
  kind: "mission",
  clientId: "c1",
  inviterId: null,
  inviteId: null,
  amountMinor: 1500,
  status: "issued",
  createdAt: "2026-10-20T08:00:00.000Z",
  issuedAt: "2026-10-20T08:00:00.000Z",
  voidedAt: null,
  voucherId: "vch_mission",
  inviterVoucherId: null,
  reason: null,
  checks: {},
  ...overrides,
});

beforeEach(() => {
  api.listUsers.mockResolvedValue([
    { id: "c1", name: "Ana Client", email: "ana@example.test", role: "client" },
  ]);
  api.lookupClientVouchers.mockResolvedValue({
    serverTime: "2026-10-21T08:00:00.000Z",
    vouchers: [missionVoucher, inviteVoucher, campaignAvailable, campaignVoided],
  });
  api.listTesterRewards.mockResolvedValue({
    serverTime: "2026-10-21T08:00:00.000Z",
    total: 2,
    rewards: [
      reward({}),
      reward({
        id: "trwd_2",
        kind: "referral",
        clientId: "f1",
        inviterId: "c1",
        amountMinor: 3000,
        status: "voided",
        voucherId: "vch_friend",
        inviterVoucherId: "vch_invite",
      }),
    ],
    budget: {
      month: "2026-10",
      timezone: "Asia/Manila",
      limitMinor: null,
      usedMinor: 0,
      remainingMinor: null,
      resumePolicy: "super_admin_per_reward",
    },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const card = async (name: RegExp) => within(await screen.findByRole("article", { name }));

it("offers no void or reissue on a Founding Tester voucher, and links to its reward", async () => {
  render(<VoucherLookup tree="admin" clientId="c1" onClientChange={vi.fn()} />);

  const mission = await card(/^Thank you,/);
  expect(mission.getByText(/Founding Tester mission reward\./)).toBeVisible();
  expect(
    mission.getByRole("link", { name: "Manage it in Founding Tester rewards" }),
  ).toHaveAttribute("href", "/admin/founding-testers/c1");
  expect(mission.queryByRole("button", { name: "Void" })).toBeNull();

  const invite = await card(/^Welcome,/);
  expect(invite.getByText(/Founding Tester invite reward/)).toBeVisible();
  expect(invite.queryByRole("button", { name: "Reissue" })).toBeNull();

  // A campaign voucher keeps both, whatever it is called.
  expect(
    (await card(/^Founding Tester thanks,/)).getByRole("button", { name: "Void" }),
  ).toBeVisible();
  expect((await card(/^Promo,/)).getByRole("button", { name: "Reissue" })).toBeVisible();
  expect(api.listTesterRewards).toHaveBeenCalledWith(
    { clientId: "c1" },
    { offset: 0, limit: 500 },
  );
});

it("promises a reissue only for a voucher known not to be a tester reward", async () => {
  render(<VoucherLookup tree="admin" clientId="c1" onClientChange={vi.fn()} />);
  fireEvent.click(
    (await card(/^Founding Tester thanks,/)).getByRole("button", { name: "Void" }),
  );
  expect(
    within(await screen.findByRole("dialog")).getByText(
      /You can reissue it until it expires/,
    ),
  ).toBeVisible();
});

it("without the tester rewards, does not promise a reissue, and explains a managed voucher", async () => {
  api.listTesterRewards.mockRejectedValue(new ApiError(503, { error: "unavailable" }));
  render(<VoucherLookup tree="admin" clientId="c1" onClientChange={vi.fn()} />);

  fireEvent.click((await card(/^Thank you,/)).getByRole("button", { name: "Void" }));
  let dialog = within(await screen.findByRole("dialog"));
  expect(dialog.queryByText(/You can reissue it until it expires/)).toBeNull();
  expect(
    dialog.getByText(
      /a Founding Tester reward cannot, and voiding one voids the whole reward/,
    ),
  ).toBeVisible();
  fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  api.reissueVoucher.mockRejectedValue(
    new ApiError(409, { error: "tester_reward_managed" }),
  );
  fireEvent.click((await card(/^Welcome,/)).getByRole("button", { name: "Reissue" }));
  dialog = within(await screen.findByRole("dialog"));
  fireEvent.change(dialog.getByLabelText("Reason"), {
    target: { value: "Client asked" },
  });
  fireEvent.click(dialog.getByRole("button", { name: "Reissue voucher" }));
  expect(
    await dialog.findByText(/is a Founding Tester reward, so it cannot be reissued here/),
  ).toBeVisible();
  expect(
    dialog.getByRole("link", { name: "Open Founding Tester rewards" }),
  ).toHaveAttribute("href", "/admin/founding-testers/c1");
  expect(screen.queryByText(/tester_reward_managed/)).toBeNull();
  // The wallet re-reads, so ownership can be learnt again.
  await waitFor(() => expect(api.lookupClientVouchers).toHaveBeenCalledTimes(2));
});

it("lets Operations see which vouchers are tester rewards, in its own tree", async () => {
  render(<VoucherLookup tree="ops" clientId="c1" onClientChange={vi.fn()} />);
  const mission = await card(/^Thank you,/);
  expect(
    mission.getByRole("link", { name: "See it in Founding Tester rewards" }),
  ).toHaveAttribute("href", "/ops/founding-testers/c1");
  expect(screen.queryByRole("button", { name: "Void" })).toBeNull();
});
