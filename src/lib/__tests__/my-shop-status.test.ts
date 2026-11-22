import { describe, expect, it } from "vitest";

import {
  changeSentence,
  nightChipLabel,
  normalizeMyShopStatus,
  signOf,
  shopStatusErrorCopy,
} from "@/lib/my-shop-status";

// 10:00 in Manila.
const NOW = new Date("2026-11-22T02:00:00Z");

function raw(over: Record<string, unknown> = {}) {
  return {
    supplierId: "shop_1",
    shopName: "Test Print Shop",
    version: 7,
    hours: { temporarilyClosed: false, isOpenNow: true, schedule: { week: [{ weekday: 0, opensMinute: 480, closesMinute: 1080 }] } },
    todayHours: [{ opensMinute: 480, closesMinute: 1080 }],
    isOpenNow: true,
    nextOpeningAt: null,
    expressEnabled: true,
    nightJobs: "until_23",
    nightWindow: null,
    printerDemandPings: false,
    pausedUntil: null,
    ...over,
  };
}

describe("My shop status", () => {
  it("reads GRIDGO's answer defensively", () => {
    expect(normalizeMyShopStatus(null)).toBeNull();
    expect(normalizeMyShopStatus({ version: "7" })).toBeNull();
    const status = normalizeMyShopStatus(raw({ nightJobs: "sometimes" }));
    expect(status).toMatchObject({ version: 7, shopName: "Test Print Shop", nightJobs: "off", expressEnabled: true });
  });

  it("hangs OPEN with today's hours, and the night window when it runs", () => {
    expect(signOf(normalizeMyShopStatus(raw())!, NOW)).toMatchObject({
      word: "OPEN",
      line: "8 AM – 6 PM",
      action: "close",
    });
    const night = normalizeMyShopStatus(
      raw({ nightWindow: { night: "2026-11-22", startsAt: "2026-11-22T10:00:00Z", endsAt: "2026-11-22T15:00:00Z" } }),
    )!;
    expect(signOf(night, NOW).line).toBe("Night jobs until 11 PM");
  });

  it("hangs CLOSED for a pause, a manual closure, or outside hours", () => {
    const paused = normalizeMyShopStatus(raw({ pausedUntil: "2026-11-22T03:00:00Z" }))!;
    expect(signOf(paused, NOW)).toMatchObject({ word: "CLOSED", line: "Paused until 11 AM", action: "resume" });
    const restOfDay = normalizeMyShopStatus(raw({ pausedUntil: "2026-11-22T16:00:00Z" }))!;
    expect(signOf(restOfDay, NOW).line).toBe("Paused for the rest of today");
    const closed = normalizeMyShopStatus(raw({ hours: { ...raw().hours, temporarilyClosed: true }, isOpenNow: false }))!;
    expect(signOf(closed, NOW)).toMatchObject({ word: "CLOSED", action: "open" });
    const after = normalizeMyShopStatus(raw({ isOpenNow: false, nextOpeningAt: "2026-11-23T00:00:00Z" }))!;
    expect(signOf(after, NOW)).toMatchObject({ word: "CLOSED", line: "Opens tomorrow at 8 AM", action: "hours" });
  });

  it("says what each change did, and what a refusal means", () => {
    expect(nightChipLabel("until_21")).toBe("Night until 9 PM");
    expect(nightChipLabel("off")).toBeNull();
    expect(changeSentence({ nightJobs: "until_23" })).toBe("Night jobs are on until 11 PM, after your closing time.");
    expect(changeSentence({ pause: "one_hour" })).toBe("Paused for 1 hour. Jobs you already have still finish.");
    expect(changeSentence({ pause: null })).toBe("Your shop is taking jobs again.");
    expect(shopStatusErrorCopy("shop_profile_stale")).toMatch(/changed on another screen/);
    expect(shopStatusErrorCopy("shop_owner_required")).toBe("Only the shop owner can change these.");
  });
});
