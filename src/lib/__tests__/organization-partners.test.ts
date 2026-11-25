import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import {
  budgetNeedsAttention,
  budgetWarning,
  canBePartner,
  capAlreadyReached,
  dayWords,
  isNotAvailable,
  lastPerkDay,
  partnerBudget,
  partnerChip,
  partnerDraft,
  partnerErrorText,
  partnerProblems,
  perkAmountWords,
  perkChanges,
  perkDraft,
  perkEndsAt,
  perkSetting,
  perkState,
  readPerkDraft,
  sortPartners,
} from "@/lib/organization-partners";
import { memberPerk, partner } from "@/test/organization-partners";

const NOW = Date.parse("2026-11-26T00:00:00Z");

describe("dates", () => {
  it("ends a perk at the end of the Manila day, and reads the same day back", () => {
    expect(perkEndsAt("2027-05-31")).toBe("2027-05-31T15:59:59.999Z");
    expect(lastPerkDay("2027-05-31T15:59:59.999Z")).toBe("2027-05-31");
    // A midnight end belongs to the day before.
    expect(lastPerkDay("2027-05-31T16:00:00.000Z")).toBe("2027-05-31");
    expect(dayWords("2027-05-31")).toMatch(/May 31, 2027|31 May 2027/);
  });
});

describe("the perk form", () => {
  it("starts blank and off, so no amount is ever suggested", () => {
    expect(perkDraft(null)).toEqual({
      enabled: false,
      amount: "",
      maxOrders: "",
      lastDay: "",
      budgetCap: "",
    });
    expect(
      Object.keys(readPerkDraft(perkDraft(null), null, NOW).problems).sort(),
    ).toEqual(["amount", "budgetCap", "lastDay", "maxOrders"]);
  });

  it("reads whole centavos and keeps an untouched end instant exactly", () => {
    const setting = memberPerk({ endsAt: "2099-03-31T10:00:00.000Z" });
    const { input } = readPerkDraft(
      { ...perkDraft(setting), amount: "12.5" },
      setting,
      NOW,
    );
    expect(input).toEqual({
      enabled: true,
      amountMinor: 1250,
      maxOrdersPerTerm: 3,
      endsAt: "2099-03-31T10:00:00.000Z",
      budgetCapMinor: 100000,
    });
  });

  it.each([
    [{ amount: "0" }, "amount"],
    [{ amount: "1.234" }, "amount"],
    [{ amount: "-5" }, "amount"],
    [{ maxOrders: "0" }, "maxOrders"],
    [{ maxOrders: "1001" }, "maxOrders"],
    [{ maxOrders: "2.5" }, "maxOrders"],
    [{ lastDay: "2026-02-30" }, "lastDay"],
    [{ lastDay: "2026-11-25" }, "lastDay"],
    [{ budgetCap: "0" }, "budgetCap"],
  ])("refuses %o before the API has to", (patch, field) => {
    const { input, problems } = readPerkDraft(
      { ...perkDraft(memberPerk()), ...patch },
      memberPerk(),
      NOW,
    );
    expect(input).toBeNull();
    expect(Object.keys(problems)).toEqual([field]);
  });

  it("accepts today as the last day, and a passed day while the perk is off", () => {
    const base = perkDraft(memberPerk());
    expect(
      readPerkDraft({ ...base, lastDay: "2026-11-26" }, null, NOW).input,
    ).not.toBeNull();
    expect(
      readPerkDraft({ ...base, enabled: false, lastDay: "2026-01-01" }, null, NOW).input,
    ).not.toBeNull();
  });

  it("restates only what changes", () => {
    expect(
      perkChanges(memberPerk(), { ...memberPerk(), enabled: false, amountMinor: 2000 }),
    ).toEqual(["Perk: On to Off", "Pesos off an order, at most: ₱12.34 to ₱20.00"]);
    expect(perkChanges(null, memberPerk())).toHaveLength(5);
    expect(perkChanges(memberPerk(), memberPerk())).toEqual([]);
  });

  it("names partners that already used a lower cap", () => {
    expect(
      capAlreadyReached(20000, [partner(), partner({ label: "B", budgetUsedMinor: 5 })]),
    ).toEqual(["SDG"]);
  });

  it("always says up to, because the service fee is the real ceiling", () => {
    expect(perkAmountWords(1234)).toBe("Up to ₱12.34 off an order");
  });
});

describe("which perk is in force", () => {
  it("an organization's own row replaces the standard one, even when off", () => {
    const own = memberPerk({ enabled: false });
    expect(perkSetting(partner({ perkOverride: own }), memberPerk())).toEqual({
      source: "own",
      setting: own,
    });
    expect(perkSetting(partner(), null).source).toBe("none");
    expect(perkState(null)).toBe("unset");
    expect(perkState(own)).toBe("off");
    expect(perkState(memberPerk({ endsAt: "2026-01-01T00:00:00Z" }), NOW)).toBe("ended");
    expect(perkState(memberPerk(), NOW)).toBe("on");
  });
});

describe("budget", () => {
  const at = (used: number, left: number) =>
    partner({ budgetUsedMinor: used, budgetLeftMinor: left });

  it("warns near the cap, when a full perk no longer fits, and when it is spent", () => {
    const standard = memberPerk();
    expect(partnerBudget(at(79999, 20001), standard).level).toBe("ok");
    expect(partnerBudget(at(80000, 20000), standard).level).toBe("near");
    expect(partnerBudget(at(100000, 0), standard).level).toBe("spent");
    const tight = memberPerk({ amountMinor: 50000 });
    expect(partnerBudget(at(60000, 40000), tight).level).toBe("near");
    expect(budgetWarning(partnerBudget(at(60000, 40000), tight), tight)).toMatch(
      /less than one full perk/,
    );
    expect(
      partnerBudget(partner({ budgetLeftMinor: null, perk: null }), null).level,
    ).toBe("unset");
  });

  it("uses the organization's own cap, and never draws past the end", () => {
    const budget = partnerBudget(
      partner({
        perkOverride: memberPerk({ budgetCapMinor: 10000 }),
        budgetUsedMinor: 20000,
        budgetLeftMinor: 0,
      }),
      memberPerk(),
    );
    expect(budget).toMatchObject({ capMinor: 10000, percent: 100, level: "spent" });
  });

  it("stays quiet when no new order can use the perk", () => {
    const spent = { budgetUsedMinor: 100000, budgetLeftMinor: 0 };
    expect(budgetNeedsAttention(partner(spent), memberPerk())).toBe(true);
    expect(budgetNeedsAttention(partner({ ...spent, perk: null }), memberPerk())).toBe(
      false,
    );
    expect(
      budgetNeedsAttention(partner({ ...spent, status: "ended" }), memberPerk()),
    ).toBe(false);
    expect(budgetNeedsAttention(partner({ ...spent, live: false }), memberPerk())).toBe(
      false,
    );
  });

  it("puts what needs attention first and ended partners last", () => {
    const order = sortPartners(
      [
        partner({ label: "Ended", status: "ended" }),
        partner({ label: "Fine" }),
        partner({ label: "Held", live: false }),
        partner({ label: "Spent", budgetUsedMinor: 100000, budgetLeftMinor: 0 }),
      ],
      memberPerk(),
    ).map((p) => p.label);
    expect(order).toEqual(["Spent", "Held", "Fine", "Ended"]);
  });
});

describe("partners", () => {
  it("shows standing in words", () => {
    expect(partnerChip(partner()).label).toBe("Partner");
    expect(partnerChip(partner({ live: false })).label).toBe("On hold");
    expect(partnerChip(partner({ status: "ended", live: false })).label).toBe("Ended");
  });

  it("mirrors the API's rule: an approved organization with an officer of record", () => {
    const officer = { fullName: "Officer One" } as never;
    const approval = (status: string) => ({ id: "a", status }) as never;
    expect(
      canBePartner({ currentOfficer: officer, approvalCase: approval("approved") }),
    ).toBe(true);
    // A handover under review keeps the current officer.
    expect(
      canBePartner({ currentOfficer: officer, approvalCase: approval("pending") }),
    ).toBe(true);
    expect(
      canBePartner({ currentOfficer: officer, approvalCase: approval("suspended") }),
    ).toBe(false);
    expect(
      canBePartner({ currentOfficer: null, approvalCase: approval("approved") }),
    ).toBe(false);
  });

  it("checks the short name and the start date", () => {
    const draft = partnerDraft(null, "2026-11-26");
    expect(draft).toMatchObject({ label: "", partnerSince: "2026-11-26" });
    expect(partnerProblems(draft, "2026-11-26").label).toBeTruthy();
    expect(
      partnerProblems({ ...draft, label: "x".repeat(41) }, "2026-11-26").label,
    ).toMatch(/40/);
    expect(
      partnerProblems(
        { ...draft, label: "SDG", partnerSince: "2026-11-27" },
        "2026-11-26",
      ),
    ).toEqual({ partnerSince: "Pick today or an earlier date." });
  });
});

describe("errors", () => {
  it("never claims a dropped connection saved or failed", () => {
    expect(partnerErrorText(new TypeError("Failed to fetch"), "save")).toMatch(
      /cannot tell/,
    );
    expect(partnerErrorText(new TypeError("Failed to fetch"), "load")).toMatch(/offline/);
    expect(
      partnerErrorText(new ApiError(500, { error: "server_error" }), "save"),
    ).toMatch(/could not confirm/);
  });

  it("tells an older API from an organization that is not a partner", () => {
    expect(isNotAvailable(new ApiError(404, { error: "not_found" }))).toBe(true);
    expect(
      isNotAvailable(new ApiError(404, { error: "organization_partner_not_found" })),
    ).toBe(false);
  });
});
