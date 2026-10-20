import { describe, expect, it } from "vitest";

import type { TesterBudget, TesterInvite, TesterReward } from "@/lib/api/types";
import {
  blockReasonsText,
  budgetInputFrom,
  budgetSettingText,
  checkCoverageText,
  evidenceMissing,
  formUrlExample,
  formUrlProblem,
  parseBudgetPesos,
  presentBudget,
  presentCheck,
  presentInviteStatus,
  presentRewardState,
  rewardActions,
  rewardAmountText,
} from "@/lib/tester-program";

const budget = (overrides: Partial<TesterBudget> = {}): TesterBudget => ({
  month: "2026-10",
  timezone: "Asia/Manila",
  limitMinor: 150000,
  usedMinor: 4500,
  remainingMinor: 145500,
  resumePolicy: "super_admin_per_reward",
  ...overrides,
});

const reward = (overrides: Partial<TesterReward> = {}): TesterReward => ({
  id: "trwd_1",
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
    phone: {
      status: "no_match",
      comparedClientIds: ["inviter"],
      missingClientIds: [],
      matchedClientIds: [],
    },
    device: {
      status: "missing",
      comparedClientIds: [],
      missingClientIds: ["friend"],
      matchedClientIds: [],
    },
    address: {
      status: "no_match",
      comparedClientIds: ["inviter"],
      missingClientIds: ["earlier"],
      matchedClientIds: [],
    },
  },
  ...overrides,
});

describe("budget", () => {
  it("shows used against the limit with what is left this Manila month", () => {
    expect(presentBudget(budget())).toEqual({
      value: "₱45.00 of ₱1,500.00",
      hint: "Issued in October 2026, Manila time. ₱1,455.00 left.",
      full: false,
    });
  });

  it("says no limit when the API sends null", () => {
    const shown = presentBudget(budget({ limitMinor: null, remainingMinor: null }));
    expect(shown.value).toBe("₱45.00");
    expect(shown.hint).toContain("No monthly limit.");
    expect(shown.full).toBe(false);
  });

  it("says rewards pause when nothing is left", () => {
    const shown = presentBudget(budget({ limitMinor: 4500, remainingMinor: 0 }));
    expect(shown.full).toBe(true);
    expect(shown.hint).toContain("new rewards pause");
  });
});

describe("budget setting", () => {
  it("reads pesos into whole centavos, empty as no limit", () => {
    expect(parseBudgetPesos("")).toEqual({ minor: null });
    expect(parseBudgetPesos(" 1,500 ")).toEqual({ minor: 150000 });
    expect(parseBudgetPesos("1500.5")).toEqual({ minor: 150050 });
    expect(parseBudgetPesos("0")).toEqual({ minor: 0 });
    expect(parseBudgetPesos("-1")).toHaveProperty("problem");
    expect(parseBudgetPesos("1.234")).toHaveProperty("problem");
    expect(parseBudgetPesos("abc")).toHaveProperty("problem");
  });

  it("writes centavos back as pesos", () => {
    expect(budgetInputFrom(null)).toBe("");
    expect(budgetInputFrom(150000)).toBe("1500");
    expect(budgetInputFrom(150050)).toBe("1500.50");
  });

  it("says what is in force", () => {
    expect(budgetSettingText(null)).toBe("No limit.");
    expect(budgetSettingText(0)).toContain("every new tester reward pauses");
    expect(budgetSettingText(150000)).toBe("₱1,500.00 a month (Manila time).");
  });
});

describe("sign-up form link", () => {
  it("accepts an HTTPS link with one {code} in the query", () => {
    expect(formUrlProblem("")).toBeNull();
    expect(
      formUrlProblem("https://forms.example.test/signup?entry.123={code}"),
    ).toBeNull();
  });

  it("explains each way the API would refuse it", () => {
    expect(formUrlProblem("http://forms.example.test/s?e={code}")).toContain("https://");
    expect(formUrlProblem("https://forms.example.test/s?e=1")).toContain("exactly once");
    expect(formUrlProblem("https://forms.example.test/s?a={code}&b={code}")).toContain(
      "exactly once",
    );
    expect(formUrlProblem("https://forms.example.test/{code}/s")).toContain(
      "after the question mark",
    );
    expect(formUrlProblem("https://me:pw@forms.example.test/s?e={code}")).toContain(
      "password",
    );
    expect(formUrlProblem("forms.example.test?e={code}")).toContain("full web address");
    expect(formUrlProblem(`https://f.test/s?e={code}&x=${"a".repeat(2048)}`)).toContain(
      "too long",
    );
  });

  it("shows the link a client would share", () => {
    expect(formUrlExample("https://f.test/s?e={code}", "AB12")).toBe(
      "https://f.test/s?e=AB12",
    );
  });
});

describe("reward states", () => {
  it("names each state with icon and words, not colour alone", () => {
    expect(presentRewardState(reward())).toMatchObject({
      label: "Issued",
      icon: "circle-check",
    });
    expect(
      presentRewardState(reward({ status: "paused", reason: "monthly_budget" })),
    ).toMatchObject({ label: "Paused by budget", tone: "warning", icon: "clock" });
    const voided = presentRewardState(
      reward({
        status: "voided",
        voidedAt: "2026-10-21T08:00:00.000Z",
        reason: "Same person",
      }),
    );
    expect(voided.label).toBe("Voided");
    expect(voided.detail).toBe("Voided Oct 21, 2026, 4:00 PM: “Same person”");
  });

  it("gives a block's reasons in words, in the API's order", () => {
    const blocked = presentRewardState(
      reward({ status: "blocked", reason: "same_phone,same_address" }),
    );
    expect(blocked).toMatchObject({ label: "Blocked", tone: "error", icon: "ban" });
    expect(blocked.detail).toContain("Same phone number and same delivery address");
    expect(blockReasonsText("same_device")).toBe("Same app installation");
  });

  it("reads the amount from the API, split for an invite pair", () => {
    expect(rewardAmountText(reward())).toBe("₱15.00 each to the friend and the inviter");
    expect(rewardAmountText(reward({ kind: "mission", amountMinor: 1500 }))).toBe(
      "₱15.00 voucher",
    );
    expect(rewardAmountText(reward({ kind: "mission", amountMinor: 0 }))).toContain(
      "earlier survey voucher",
    );
  });

  it("lets Super Admin void issued or paused, resume only paused, and never touch a block", () => {
    expect(rewardActions({ status: "issued" })).toEqual({
      canVoid: true,
      canResume: false,
    });
    expect(rewardActions({ status: "paused" })).toEqual({
      canVoid: true,
      canResume: true,
    });
    expect(rewardActions({ status: "blocked" })).toEqual({
      canVoid: false,
      canResume: false,
    });
    expect(rewardActions({ status: "voided" })).toEqual({
      canVoid: false,
      canResume: false,
    });
  });
});

describe("invite checks", () => {
  const names: Record<string, string> = { inviter: "Ana", earlier: "Ben" };
  const name = (id: string) => names[id] ?? id;

  it("shows match, no match and no evidence as words", () => {
    expect(
      presentCheck({
        status: "match",
        comparedClientIds: [],
        missingClientIds: [],
        matchedClientIds: ["inviter"],
      }).label,
    ).toBe("Match");
    expect(presentCheck(reward().checks.phone).label).toBe("No match");
    expect(presentCheck(reward().checks.device).label).toBe("No evidence");
    expect(presentCheck(undefined).label).toBe("Not run");
  });

  it("names who was compared and whose evidence was missing", () => {
    expect(checkCoverageText(reward().checks.phone, "friend", name)).toBe(
      "Compared with Ana.",
    );
    expect(checkCoverageText(reward().checks.device, "friend", name)).toBe(
      "Nothing on record for the friend.",
    );
    expect(checkCoverageText(reward().checks.address, "friend", name)).toBe(
      "Compared with Ana. Nothing on record for Ben.",
    );
  });

  it("flags missing evidence even on a no-match, and never on a mission", () => {
    expect(evidenceMissing(reward())).toBe(true);
    const full = {
      status: "no_match" as const,
      comparedClientIds: ["inviter"],
      missingClientIds: [],
      matchedClientIds: [],
    };
    expect(
      evidenceMissing(reward({ checks: { phone: full, device: full, address: full } })),
    ).toBe(false);
    expect(evidenceMissing(reward({ kind: "mission", checks: {} }))).toBe(false);
  });
});

describe("invites", () => {
  const invite = (overrides: Partial<TesterInvite> = {}): TesterInvite => ({
    id: "tinv_1",
    inviterId: "inviter",
    code: "ABC",
    email: "friend@example.test",
    clientId: null,
    createdAt: "2026-10-20T08:00:00.000Z",
    matchedAt: null,
    completedAt: null,
    unmatchedReason: "no_client_account",
    status: "unmatched",
    ...overrides,
  });

  it("says why an entry is unmatched", () => {
    expect(presentInviteStatus(invite())).toMatchObject({
      label: "Unmatched",
      detail: "No client account uses this email yet.",
    });
    expect(presentInviteStatus(invite({ unmatchedReason: "self_invite" })).detail).toBe(
      "This is the inviter's own email.",
    );
  });

  it("shows joined and completed", () => {
    expect(
      presentInviteStatus(
        invite({
          status: "joined",
          clientId: "friend",
          matchedAt: "2026-10-20T08:00:00.000Z",
          unmatchedReason: null,
        }),
      ).label,
    ).toBe("Joined");
    expect(
      presentInviteStatus(
        invite({
          status: "completed",
          clientId: "friend",
          completedAt: "2026-10-21T08:00:00.000Z",
        }),
      ).label,
    ).toBe("Completed");
  });
});
