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
