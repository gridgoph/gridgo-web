import { describe, expect, it } from "vitest";

import type { FoundingTesterProgress, Voucher } from "@/lib/api/types";
import {
  awaitingAward,
  launchDateText,
  neighbourPages,
  pageRangeText,
  presentTesterLabel,
  presentTesterReward,
  progressText,
  showsFoundingTesterBadge,
  testerFilterQuery,
  testerLabelNote,
} from "@/lib/founding-testers";

const voucher = (overrides: Partial<Voucher> = {}): Voucher => ({
  id: "vch_1",
  campaignId: "vcamp_1",
  name: "Thank you, Founding Tester",
  valueMinor: 1500,
  status: "available",
  issuedAt: "2026-10-20T08:00:00.000Z",
  expiresAt: "2026-11-19T08:00:00.000Z",
  secondsRemaining: 2_592_000,
  redeemable: true,
  reservation: null,
  fundedBy: "GRIDGO",
  transferable: false,
  cashValue: false,
  ...overrides,
});

const progress = (
  overrides: Partial<FoundingTesterProgress> = {},
): FoundingTesterProgress => ({
  eligible: true,
  label: null,
  awardedAt: null,
  missions: { placed: false, received: false, rated: false },
  completedCount: 0,
  rewardStatus: "pending",
  reward: null,
  ...overrides,
});

const earned = (overrides: Partial<FoundingTesterProgress> = {}) =>
  progress({
    label: "Founding Tester",
    awardedAt: "2026-10-20T08:00:00.000Z",
    missions: { placed: true, received: true, rated: true },
    completedCount: 3,
    rewardStatus: "issued",
    reward: voucher(),
    ...overrides,
  });

describe("users-list filter", () => {
  it("asks for every user, or client rows with or without the label", () => {
    expect(testerFilterQuery("all")).toEqual({});
    expect(testerFilterQuery("earned")).toEqual({ role: "client", foundingTester: true });
    expect(testerFilterQuery("not_yet")).toEqual({
      role: "client",
      foundingTester: false,
    });
  });
});

describe("badge", () => {
  it("shows on a client row with the label only", () => {
    expect(showsFoundingTesterBadge({ role: "client", foundingTester: true })).toBe(true);
    expect(showsFoundingTesterBadge({ role: "client", foundingTester: false })).toBe(
      false,
    );
    expect(showsFoundingTesterBadge({ role: "client" })).toBe(false);
  });

  it("never shows on a shop or rider row, even if the field arrives", () => {
    expect(showsFoundingTesterBadge({ role: "supplier", foundingTester: true })).toBe(
      false,
    );
    expect(showsFoundingTesterBadge({ role: "rider", foundingTester: true })).toBe(false);
  });
});

describe("label", () => {
  it("counts missions out of three", () => {
    expect(progressText(progress({ completedCount: 2 }))).toBe("2 of 3");
  });

  it("names the four states in words", () => {
    expect(presentTesterLabel(earned()).label).toBe("Founding Tester");
    expect(
      presentTesterLabel(progress({ eligible: false, rewardStatus: "ineligible" })).label,
    ).toBe("Not eligible");
    expect(presentTesterLabel(progress({ completedCount: 1 })).label).toBe("Not yet");
    const done = progress({
      completedCount: 3,
      missions: { placed: true, received: true, rated: true },
    });
    expect(awaitingAward(done)).toBe(true);
    expect(presentTesterLabel(done).label).toBe("Label on its way");
  });

  it("says when it was earned, in Manila time, and why it cannot be", () => {
    expect(testerLabelNote(earned())).toContain("Earned Oct 20, 2026, 4:00 PM");
    const ineligible = progress({ eligible: false, rewardStatus: "ineligible" });
    expect(testerLabelNote(ineligible)).toContain("launch date");
    expect(testerLabelNote(ineligible, true)).toBe(
      "A test account cannot earn the label.",
    );
  });
});

describe("reward", () => {
  it("promises the voucher only once all three are done", () => {
    const pending = presentTesterReward(progress());
    expect(pending.label).toBe("After all three");
    expect(pending.detail).toContain("₱15.00 voucher, valid 30 days");
  });

  it("shows the issued voucher with its expiry and never its code", () => {
    const reward = presentTesterReward(
      earned({ reward: { ...voucher(), code: "SECRET" } as Voucher }),
    );
    expect(reward.label).toBe("Available");
    expect(reward.detail).toBe("₱15.00 voucher, expires Nov 19, 2026, 4:00 PM.");
    expect(reward.detail).not.toContain("SECRET");
  });

  it("says a reused survey voucher brought no new money", () => {
    const reward = presentTesterReward(
      earned({
        rewardStatus: "existing_survey_reward",
        reward: voucher({ status: "used" }),
      }),
    );
    expect(reward.label).toBe("Used");
    expect(reward.detail).toContain(
      "earlier ₱15.00 survey voucher counts as this reward, used",
    );
    expect(reward.detail).toContain("No new voucher was issued.");
  });

  it("has nothing for an ineligible account", () => {
    expect(
      presentTesterReward(progress({ eligible: false, rewardStatus: "ineligible" }))
        .label,
    ).toBe("No reward");
  });
});

describe("paging", () => {
  it("reads the range of the page on screen", () => {
    expect(pageRangeText(0, 100, 245)).toBe("Clients 1–100 of 245");
    expect(pageRangeText(200, 45, 245)).toBe("Clients 201–245 of 245");
    expect(pageRangeText(0, 0, 0)).toBeNull();
  });

  it("offers a previous and next page only where one exists", () => {
    expect(neighbourPages(0, 245)).toEqual({ previous: null, next: 100 });
    expect(neighbourPages(100, 245)).toEqual({ previous: 0, next: 200 });
    expect(neighbourPages(200, 245)).toEqual({ previous: 100, next: null });
    expect(neighbourPages(0, 100)).toEqual({ previous: null, next: null });
  });
});

describe("launch date", () => {
  it("reads in Manila time, or says everyone can earn it", () => {
    expect(launchDateText("2026-10-31T16:00:00.000Z")).toBe(
      "Nov 1, 2026, 12:00 AM, Manila time. Accounts created before then can earn the label.",
    );
    expect(launchDateText(null)).toBe(
      "Not set. Every client account can earn the label.",
    );
  });
});
