import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import { PromotionsShapeError, readAdminPromotions } from "@/lib/api/promotions";
import {
  CONFLICT_COPY,
  budgetBar,
  capReached,
  checkDraft,
  claimsCsv,
  draftFromSettings,
  foundingSeats,
  foundingState,
  friendPassState,
  isVersionConflict,
  parseCount,
  parseManilaTime,
  parsePesos,
  pesosInput,
  promotionsErrorText,
} from "@/lib/promotions";
import { rawPromotions } from "@/test/promotions";

const data = readAdminPromotions(rawPromotions());
const settings = data.settings;
const NOW = Date.parse("2026-10-28T02:00:00.000Z");

describe("money", () => {
  it("shows centavos as pesos without trailing zeros", () => {
    expect(pesosInput(20000)).toBe("200");
    expect(pesosInput(1550)).toBe("15.50");
    expect(pesosInput(5)).toBe("0.05");
    expect(pesosInput(900000)).toBe("9000");
  });

  it("reads typed pesos as centavos", () => {
    expect(parsePesos("200")).toEqual({ value: 20000 });
    expect(parsePesos("9,000")).toEqual({ value: 900000 });
    expect(parsePesos(" 15.5 ")).toEqual({ value: 1550 });
    expect(parsePesos("0.01")).toEqual({ value: 1 });
  });

  it("refuses blank, zero, negative and over-precise amounts", () => {
    expect(parsePesos("")).toHaveProperty("problem");
    expect(parsePesos("0")).toEqual({ problem: "Enter an amount above ₱0." });
    expect(parsePesos("-5")).toHaveProperty("problem");
    expect(parsePesos("1.005")).toHaveProperty("problem");
    expect(parsePesos("two hundred")).toHaveProperty("problem");
  });

  it("round-trips every stored amount", () => {
    for (const minor of [1, 99, 1500, 20000, 900000, 123456])
      expect(parsePesos(pesosInput(minor))).toEqual({ value: minor });
  });
});

describe("counts", () => {
  it("takes whole numbers of at least 1", () => {
    expect(parseCount("30")).toEqual({ value: 30 });
    expect(parseCount("1")).toEqual({ value: 1 });
    expect(parseCount("0")).toEqual({ problem: "Enter at least 1." });
    expect(parseCount("2.5")).toHaveProperty("problem");
    expect(parseCount("")).toHaveProperty("problem");
    expect(parseCount("2000000")).toHaveProperty("problem");
  });
});

describe("Philippine time", () => {
  it("reads a closing 23:59 as the end of that minute", () => {
    expect(parseManilaTime("2026-11-08T23:59", true)).toMatchObject({
      iso: "2026-11-08T15:59:59.000Z",
    });
    expect(parseManilaTime("2026-10-27T00:00", false)).toMatchObject({
      iso: "2026-10-26T16:00:00.000Z",
    });
    expect(parseManilaTime("", false)).toHaveProperty("problem");
  });
});

describe("checkDraft", () => {
  const base = draftFromSettings(settings);

  it("fills the form from settings in pesos and Manila time", () => {
    expect(base).toMatchObject({
      foundingAmount: "200",
      foundingSlots: "30",
      foundingStarts: "2026-10-27T00:00",
      foundingEnds: "2026-11-08T23:59",
      friendAmount: "100",
      friendUpgrade: "2026-11-01T23:59",
      budgetCap: "9000",
      survey: "15",
      invite: "15",
    });
  });

  it("sends nothing when nothing changed, dates included", () => {
    expect(checkDraft(base, settings)).toEqual({ errors: {}, patch: {}, changes: [] });
  });

  it("sends only the fields that changed, in centavos", () => {
    const result = checkDraft(
      { ...base, foundingAmount: "250", budgetCap: "10,000", invite: "20", friendEnabled: false },
      settings,
    );
    expect(result.errors).toEqual({});
    expect(result.patch).toEqual({
      founding: { amountMinor: 25000 },
      budgetCapMinor: 1000000,
      rewards: { inviteMinor: 2000 },
      friendPass: { enabled: false },
    });
    expect(result.changes).toEqual([
      "Founding amount ₱200.00 to ₱250.00",
      "Budget cap ₱9,000.00 to ₱10,000.00",
      "Invite reward ₱15.00 to ₱20.00",
      "Friend Pass turned off",
    ]);
  });

  it("treats a retyped equal amount as no change", () => {
    expect(checkDraft({ ...base, foundingAmount: "200.00" }, settings).patch).toEqual({});
  });

  it("refuses amounts that are not positive and counts below 1", () => {
    const { errors, patch } = checkDraft(
      { ...base, foundingAmount: "0", friendTotal: "0", foundingSlots: "-1", survey: "" },
      settings,
    );
    expect(Object.keys(errors).sort()).toEqual(["foundingAmount", "foundingSlots", "friendTotal", "survey"]);
    expect(patch).toEqual({});
  });

  it("wants the end after the start", () => {
    const { errors } = checkDraft({ ...base, foundingEnds: "2026-10-26T12:00" }, settings);
    expect(errors.foundingEnds).toBe("End after the start.");
  });

  it("keeps the upgrade inside the Founding window", () => {
    expect(checkDraft({ ...base, friendUpgrade: "2026-10-20T12:00" }, settings).errors.friendUpgrade).toBe(
      "Upgrade on or after the Founding start.",
    );
    expect(checkDraft({ ...base, friendUpgrade: "2026-11-09T12:00" }, settings).errors.friendUpgrade).toBe(
      "Upgrade before the Founding end.",
    );
  });

  it("sends a moved end date as an ISO instant", () => {
    const { patch, errors } = checkDraft({ ...base, foundingEnds: "2026-11-10T23:59" }, settings);
    expect(errors).toEqual({});
    expect(patch).toEqual({ founding: { endsAt: "2026-11-10T15:59:59.000Z" } });
  });
});

describe("where the promotions stand", () => {
  it("draws used seats, then claimed, then open", () => {
    const seats = foundingSeats(data.founding);
    expect(seats).toHaveLength(30);
    expect(seats.slice(0, 3)).toEqual(["used", "claimed", "open"]);
    expect(seats.filter((seat) => seat === "open")).toHaveLength(28);
  });

  it("gives every claim a seat when slots were lowered below them", () => {
    expect(foundingSeats({ ...data.founding, slots: 1, claimed: 3, used: 1 })).toEqual([
      "used",
      "claimed",
      "claimed",
    ]);
  });

  it("is open on launch day and sold out when no slots are left", () => {
    expect(foundingState(data, NOW)).toBe("open");
    expect(foundingState({ ...data, founding: { ...data.founding, available: 0 } }, NOW)).toBe("sold_out");
    expect(foundingState(data, Date.parse("2026-11-09T00:00:00Z"))).toBe("ended");
    expect(foundingState(data, Date.parse("2026-10-26T00:00:00Z"))).toBe("not_started");
  });

  it("stops both at the cap", () => {
    const tight = { ...data, budget: { ...data.budget, remainingMinor: 5000 } };
    expect(foundingState(tight, NOW)).toBe("cap_reached");
    expect(friendPassState(tight, NOW)).toBe("cap_reached");
    expect(capReached(tight)).toBe(true);
    expect(capReached(data)).toBe(false);
    const friendOnly = { ...data, budget: { ...data.budget, remainingMinor: 15000 } };
    expect(foundingState(friendOnly, NOW)).toBe("cap_reached");
    expect(friendPassState(friendOnly, NOW)).toBe("open");
  });

  it("is off when turned off, whatever else", () => {
    const off = { ...data, settings: { ...settings, founding: { ...settings.founding, enabled: false } } };
    expect(foundingState(off, NOW)).toBe("off");
  });

  it("measures redeemed inside committed against the cap", () => {
    expect(budgetBar(data.budget)).toEqual({
      redeemedPercent: (20000 / 900000) * 100,
      committedPercent: (50000 / 900000) * 100,
      over: false,
    });
    expect(budgetBar({ ...data.budget, capMinor: 40000 })).toMatchObject({ committedPercent: 100, over: true });
  });
});

describe("reading the API", () => {
  it("maps the response into the screen's shape", () => {
    expect(data.version).toBe(3);
    expect(data.founding.claims[0]).toEqual({
      voucherId: "vch_1",
      clientId: "usr_ven",
      name: "Ven Cruz",
      email: "ven@example.test",
      claimedAt: "2026-10-27T01:00:00.000Z",
      valueMinor: 20000,
      status: "used",
      viaFriendPass: false,
      upgradedAt: null,
      orderIds: ["ord_1"],
    });
    expect(data.friendPass.invites[1]).toMatchObject({
      founder: { name: "Ana Reyes" },
      friendEmail: "lee@example.test",
      friendClientId: null,
      status: "invited",
      valueMinor: null,
      invitedAt: "2026-10-27T04:00:00.000Z",
    });
  });

  it("refuses a response without settings or a version", () => {
    expect(() => readAdminPromotions({})).toThrow(PromotionsShapeError);
    expect(() => readAdminPromotions(rawPromotions({ settings: {} }))).toThrow(PromotionsShapeError);
  });
});

describe("errors", () => {
  it("recognises a stale version", () => {
    const stale = new ApiError(409, { error: "settings_version_conflict" });
    expect(isVersionConflict(stale)).toBe(true);
    expect(promotionsErrorText(stale, "x")).toBe(CONFLICT_COPY);
    expect(isVersionConflict(new ApiError(409, { error: "promotion_sold_out" }))).toBe(false);
  });

  it("says who may change promotions", () => {
    expect(promotionsErrorText(new ApiError(403, { error: "forbidden" }), "x")).toBe(
      "Only Super Admin can change promotions.",
    );
  });
});

describe("claims CSV", () => {
  it("writes one row per claim and keeps formulas as text", () => {
    const csv = claimsCsv([
      ...data.founding.claims,
      { ...data.founding.claims[1], name: "=HYPERLINK(1)", viaFriendPass: true },
    ]);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(
      '"Name","Email","Claimed (Manila)","Value (PHP)","Status","Orders","Came from a Friend Pass upgrade"',
    );
    expect(lines[1]).toContain('"200.00","Used","ord_1","No"');
    expect(lines[3]).toContain(`"'=HYPERLINK(1)"`);
    expect(lines[3]).toContain('"Yes"');
  });
});
