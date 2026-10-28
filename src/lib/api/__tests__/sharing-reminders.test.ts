import { afterEach, describe, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@/lib/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, apiRequest: request };
});

import { ApiError } from "@/lib/api/client";
import {
  SharingReportShapeError,
  deliveryReminderOf,
  formatRate,
  listDeliveryReminders,
  listMissionShares,
  manilaWeekOf,
  packagePhotoIdsOf,
  ratePercent,
  readAllReminderWeeks,
  readAllShareTaps,
  readReminderWeek,
  readWeekStart,
  reportNotOnApi,
  shiftWeek,
  sumReminderWeeks,
  weekLabel,
  weeksRange,
} from "@/lib/api/sharing-reminders";

afterEach(() => {
  request.mockReset();
});

const week = (extra: Record<string, unknown> = {}) => ({
  riderId: "rider_1",
  week: "2026-W44",
  weekStart: "2026-10-26",
  deliveries: 4,
  remindedDeliveries: 3,
  legacyDeliveries: 1,
  reminderRate: 0.75,
  surveySubmittedDeliveries: 2,
  shareTappedDeliveries: 1,
  surveyAndShareDeliveries: 1,
  ...extra,
});

describe("the share tap report", () => {
  it("reads the contract's JSON and asks for the API's largest page", async () => {
    request.mockResolvedValueOnce({
      serverTime: "2026-10-28T01:00:00.000Z",
      total: 1,
      clients: [{ clientId: "client_123", shareTaps: 3, sendToFriendTaps: 2 }],
    });
    const page = await listMissionShares({ clientId: "client_123" });
    expect(request).toHaveBeenCalledWith(
      "/ops/mission-shares?clientId=client_123&offset=0&limit=500",
    );
    expect(page).toEqual({
      total: 1,
      rows: [{ clientId: "client_123", shareTaps: 3, sendToFriendTaps: 2 }],
    });
  });

  it("reads every page to the total and keys the counts by client", async () => {
    request
      .mockResolvedValueOnce({
        total: 3,
        clients: [
          { clientId: "a", shareTaps: 1, sendToFriendTaps: 0 },
          { clientId: "b", shareTaps: 0, sendToFriendTaps: 4 },
        ],
      })
      .mockResolvedValueOnce({
        total: 3,
        clients: [{ clientId: "c", shareTaps: 2, sendToFriendTaps: 2 }],
      });
    const taps = await readAllShareTaps();
    expect(request).toHaveBeenNthCalledWith(2, "/ops/mission-shares?offset=2&limit=500");
    expect([...taps.keys()]).toEqual(["a", "b", "c"]);
    expect(taps.get("b")).toEqual({ clientId: "b", shareTaps: 0, sendToFriendTaps: 4 });
  });

  it("never invents a count: missing or negative numbers read as zero, nameless rows drop", async () => {
    request.mockResolvedValueOnce({
      total: 2,
      clients: [{ clientId: "a", shareTaps: -2 }, { shareTaps: 9 }],
    });
    const page = await listMissionShares();
    expect(page.rows).toEqual([{ clientId: "a", shareTaps: 0, sendToFriendTaps: 0 }]);
  });

  it("refuses a body that is not a report", async () => {
    request.mockResolvedValueOnce({ clients: "nope" });
    await expect(listMissionShares()).rejects.toBeInstanceOf(SharingReportShapeError);
  });
});

describe("the weekly reminder report", () => {
  it("sends the delivery-cohort range and reads each rider-week", async () => {
    request.mockResolvedValueOnce({ timezone: "Asia/Manila", total: 1, weeks: [week()] });
    const range = weeksRange("2026-10-26", "2026-10-26");
    const page = await listDeliveryReminders(range);
    expect(request).toHaveBeenCalledWith(
      "/ops/delivery-reminders?from=2026-10-25T16%3A00%3A00.000Z&to=2026-11-01T16%3A00%3A00.000Z&offset=0&limit=500",
    );
    expect(page.rows[0]).toEqual({
      riderId: "rider_1",
      week: "2026-W44",
      weekStart: "2026-10-26",
      deliveries: 4,
      remindedDeliveries: 3,
      legacyDeliveries: 1,
      surveySubmittedDeliveries: 2,
      shareTappedDeliveries: 1,
      surveyAndShareDeliveries: 1,
    });
  });

  it("reads all pages", async () => {
    request
      .mockResolvedValueOnce({ total: 2, weeks: [week()] })
      .mockResolvedValueOnce({ total: 2, weeks: [week({ riderId: "rider_2" })] });
    const rows = await readAllReminderWeeks({});
    expect(rows.map((row) => row.riderId)).toEqual(["rider_1", "rider_2"]);
  });

  it("clamps follow-through to its base so no rate can pass 100%", () => {
    expect(
      readReminderWeek(
        week({
          deliveries: 2,
          remindedDeliveries: 5,
          surveySubmittedDeliveries: 9,
          shareTappedDeliveries: 1,
          surveyAndShareDeliveries: 4,
          legacyDeliveries: 3,
        }),
      ),
    ).toMatchObject({
      deliveries: 2,
      remindedDeliveries: 2,
      surveySubmittedDeliveries: 2,
      shareTappedDeliveries: 1,
      surveyAndShareDeliveries: 1,
      legacyDeliveries: 0,
    });
  });

  it("drops a row without a rider or a readable week", () => {
    expect(readReminderWeek(week({ riderId: "" }))).toBeNull();
    expect(readReminderWeek(week({ weekStart: "last week" }))).toBeNull();
  });

  it("sums a week's riders", () => {
    const rows = [
      readReminderWeek(week())!,
      readReminderWeek(week({ riderId: "rider_2", deliveries: 1, remindedDeliveries: 1, legacyDeliveries: 0, surveySubmittedDeliveries: 1, shareTappedDeliveries: 1 }))!,
    ];
    expect(sumReminderWeeks(rows)).toEqual({
      riders: 2,
      deliveries: 5,
      remindedDeliveries: 4,
      legacyDeliveries: 1,
      surveySubmittedDeliveries: 3,
      shareTappedDeliveries: 2,
      surveyAndShareDeliveries: 2,
    });
  });

  it("knows an API from before the contract", () => {
    expect(reportNotOnApi(new ApiError(404, { error: "not_found" }))).toBe(true);
    expect(reportNotOnApi(new ApiError(403, { error: "forbidden" }))).toBe(false);
  });
});

describe("rates", () => {
  it("prints a whole percent and never NaN", () => {
    expect(ratePercent(3, 4)).toBe(75);
    expect(formatRate(3, 4)).toBe("75%");
    expect(formatRate(2, 3)).toBe("67%");
    expect(formatRate(0, 5)).toBe("0%");
    expect(formatRate(0, 0)).toBe("—");
    expect(ratePercent(1, 0)).toBeNull();
    expect(formatRate(5, 4)).toBe("100%");
  });
});

describe("Asia/Manila weeks", () => {
  it("puts Sunday night in Manila in the week it belongs to, not the UTC one", () => {
    // 1 Nov 2026 23:30 in Manila is still the week of 26 Oct.
    expect(manilaWeekOf("2026-11-01T15:30:00Z")).toEqual({
      week: "2026-W44",
      weekStart: "2026-10-26",
    });
    // 2 Nov 2026 00:30 in Manila, though still 1 Nov in UTC, is the next week.
    expect(manilaWeekOf("2026-11-01T16:30:00Z").weekStart).toBe("2026-11-02");
  });

  it("follows the ISO week-year across New Year", () => {
    expect(manilaWeekOf("2026-12-31T04:00:00Z")).toEqual({
      week: "2026-W53",
      weekStart: "2026-12-28",
    });
    expect(manilaWeekOf("2027-01-04T04:00:00Z").week).toBe("2027-W01");
  });

  it("accepts only a Monday from the address bar", () => {
    expect(readWeekStart("2026-10-26")).toBe("2026-10-26");
    expect(readWeekStart("2026-10-27")).toBeNull();
    expect(readWeekStart("2026-13-01")).toBeNull();
    expect(readWeekStart("soon")).toBeNull();
    expect(readWeekStart(null)).toBeNull();
  });

  it("moves by whole weeks and names the Monday to Sunday", () => {
    expect(shiftWeek("2026-10-26", 1)).toBe("2026-11-02");
    expect(shiftWeek("2026-01-05", -1)).toBe("2025-12-29");
    expect(weekLabel("2026-10-26")).toBe("Oct 26 – Nov 1, 2026");
  });
});

describe("the order's own reminder", () => {
  it("reads the rider's record and the package photo ids without repeats", () => {
    const order = {
      deliveryReminder: {
        protocolVersion: 1,
        remindedClient: true,
        clientAgreedToPhoto: true,
        packagePhotoFileId: "file_package",
        deliveredAt: "2026-10-28T01:00:00.000Z",
      },
      deliveryPackagePhotoFileIds: ["file_package", "file_second"],
    };
    expect(deliveryReminderOf(order)).toEqual({
      protocolVersion: 1,
      remindedClient: true,
      clientAgreedToPhoto: true,
      packagePhotoFileId: "file_package",
      deliveredAt: "2026-10-28T01:00:00.000Z",
    });
    expect(packagePhotoIdsOf(order)).toEqual(["file_package", "file_second"]);
  });

  it("is null without a record, and an older app is never read as reminded", () => {
    expect(deliveryReminderOf({})).toBeNull();
    expect(deliveryReminderOf({ deliveryReminder: null })).toBeNull();
    expect(deliveryReminderOf({ deliveryReminder: { remindedClient: "yes" } })).toMatchObject({
      protocolVersion: 0,
      remindedClient: false,
    });
    expect(packagePhotoIdsOf({})).toEqual([]);
  });
});
