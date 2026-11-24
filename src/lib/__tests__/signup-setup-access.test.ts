import { describe, expect, it } from "vitest";

import { howYouEarnLines, shopReadyForJobs } from "@/lib/how-you-earn";
import { shopStaffAllowsPath } from "@/lib/nav";
import type { ShopMoneySettings } from "@/lib/api/types";

describe("guided setup in the supplier tree", () => {
  it("is open to a Manager (hours, staff, owner claim) and closed to Staff", () => {
    expect(shopStaffAllowsPath("/supplier/setup", true)).toBe(true);
    expect(shopStaffAllowsPath("/supplier/setup/ready", true)).toBe(true);
    expect(shopStaffAllowsPath("/supplier/setup", false)).toBe(false);
    expect(shopStaffAllowsPath("/supplier/setup/ready", false)).toBe(false);
  });

  it("still keeps Money from a Manager", () => {
    expect(shopStaffAllowsPath("/supplier/payout-account", true)).toBe(false);
    expect(shopStaffAllowsPath("/supplier/payouts", true)).toBe(false);
  });
});

const SCHEDULE: ShopMoneySettings = {
  payoutTime: "16:00",
  minimumMinor: 10000,
  payDeadline: "18:00",
  reminderTime: "09:00",
  bonusRateBps: 0,
  bonusDays: 0,
  bonusCapMinor: 0,
  businessWeekdays: [1, 2, 3, 4, 5],
  holidays: [],
  extraBusinessDates: [],
  launchedAt: null,
};

describe("How you earn", () => {
  it("reads GRIDGO's own schedule, word for word with the shop app", () => {
    expect(howYouEarnLines(SCHEDULE)).toEqual([
      "You earn on every job you finish, any time of day. Express jobs are paid daily; other jobs pay in parts as they move.",
      "GRIDGO pays you at 4:00 PM on business days, to your payout QR. ₱100.00 minimum: a smaller amount rolls over to the next day, and GRIDGO pays the transfer fee.",
    ]);
  });

  it("adds the launch bonus only when GRIDGO configured one", () => {
    const lines = howYouEarnLines({ ...SCHEDULE, bonusRateBps: 1000, bonusDays: 7, bonusCapMinor: 50000 });
    expect(lines?.[2]).toBe("Launch week: +10% on your shop pay for 7 days from your first order, up to ₱500.00.");
  });

  it("promises nothing without a schedule", () => {
    expect(howYouEarnLines(undefined)).toBeNull();
  });

  it("says Ready for jobs only on GRIDGO's readiness", () => {
    expect(shopReadyForJobs({ operational: { ready: true } })).toBe(true);
    expect(shopReadyForJobs({ operational: { ready: false } })).toBe(false);
    expect(shopReadyForJobs({})).toBeNull();
  });
});
