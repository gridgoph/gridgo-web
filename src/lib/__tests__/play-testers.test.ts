import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import {
  addTesterError,
  approvalTimestamp,
  parseOptedIn,
  playClockDay,
  rosterLoadError,
  shortDay,
  testerAppFrom,
} from "@/lib/play-testers";

describe("play testers rules", () => {
  it("reads the app from the URL, client by default", () => {
    expect(testerAppFrom(null)).toBe("client");
    expect(testerAppFrom("supplier")).toBe("supplier");
    expect(testerAppFrom("rider")).toBe("rider");
    expect(testerAppFrom("admin")).toBe("client");
  });

  it("counts Google's clock from its own start date only", () => {
    expect(playClockDay(null, "2026-11-09")).toBeNull();
    expect(playClockDay("2026-11-09", "2026-11-09")).toBe(1);
    expect(playClockDay("2026-11-01", "2026-11-09")).toBe(9);
    expect(playClockDay("2026-11-10", "2026-11-09")).toBeNull();
  });

  it("never sends an approval time after now", () => {
    const now = Date.parse("2026-11-09T03:00:00.000Z"); // 11:00 Manila
    expect(approvalTimestamp("2026-11-09", now)).toBe("2026-11-09T03:00:00.000Z");
    expect(approvalTimestamp("2026-11-02", now)).toBe("2026-11-01T16:00:00.000Z");
  });

  it("takes only whole, nonnegative counts", () => {
    expect(parseOptedIn("13")).toBe(13);
    expect(parseOptedIn(" 0 ")).toBe(0);
    expect(parseOptedIn("-1")).toBeNull();
    expect(parseOptedIn("1.5")).toBeNull();
    expect(parseOptedIn("99999999999")).toBeNull();
  });

  it("names the app in add errors", () => {
    const err = new ApiError(400, { error: "role_mismatch" });
    expect(addTesterError(err, "supplier")).toBe(
      "This account has no shop membership. Add it under its own app.",
    );
    expect(addTesterError(new ApiError(409, { error: "already_enrolled" }), "rider")).toBe(
      "Already testing the Rider app.",
    );
    expect(addTesterError(new ApiError(409, { error: "ambiguous_email" }), "client")).toMatch(
      /More than one account/,
    );
  });

  it("explains refused reads by who may open the page", () => {
    expect(rosterLoadError(new ApiError(403, { error: "test_operations_forbidden" }))).toMatch(
      /Test operations/,
    );
    expect(rosterLoadError(new TypeError("fetch failed"))).toMatch(/Could not reach/);
  });

  it("prints calendar dates without shifting them", () => {
    expect(shortDay("2026-11-07")).toBe("Nov 7");
    expect(shortDay(null)).toBe("—");
  });
});

describe("Play opt-in rules", () => {
  it("mirrors the API's link checks", async () => {
    const { validOptInUrl, validGroupJoinUrl } = await import("@/lib/play-testers");
    expect(validOptInUrl("https://play.google.com/apps/testing/ph.gridgo.client")).toBe(true);
    expect(validOptInUrl("http://play.google.com/apps/testing/ph.gridgo.client")).toBe(false);
    expect(validOptInUrl("https://play.google.com/store/apps/details?id=x")).toBe(false);
    expect(validOptInUrl("https://evil.example/apps/testing/ph.gridgo.client")).toBe(false);
    expect(validGroupJoinUrl("https://groups.google.com/g/gridgo-testers")).toBe(true);
    expect(validGroupJoinUrl("https://groups.google.com/a/gridgo.ph/g/testers")).toBe(true);
    expect(validGroupJoinUrl("https://groups.google.com/forum/x")).toBe(false);
    expect(validGroupJoinUrl("https://groups.google.com:444/g/x")).toBe(false);
  });

  it("takes a target from 1 to 10000", async () => {
    const { parseTarget } = await import("@/lib/play-testers");
    expect(parseTarget("12")).toBe(12);
    expect(parseTarget("0")).toBeNull();
    expect(parseTarget("10001")).toBeNull();
    expect(parseTarget("1.5")).toBeNull();
  });

  it("says why Send is held before the click", async () => {
    const { broadcastBlocker } = await import("@/lib/play-testers");
    const on = { campaignEnabled: true, groupMode: "link" as const, groupJoinUrl: "https://groups.google.com/g/x" };
    expect(broadcastBlocker(on, false)).toBeNull();
    expect(broadcastBlocker({ ...on, campaignEnabled: false }, false)).toMatch(/campaign on/);
    expect(broadcastBlocker({ ...on, groupJoinUrl: null }, false)).toMatch(/group link/);
    expect(broadcastBlocker({ ...on, groupMode: "automatic", groupJoinUrl: null }, false)).toBeNull();
    expect(broadcastBlocker(on, true)).toMatch(/approved/);
  });
});
