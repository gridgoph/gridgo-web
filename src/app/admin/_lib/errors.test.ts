import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";

import { adminErrorMessage, pesosToMinor } from "./errors";

describe("pesosToMinor", () => {
  it("parses whole and fractional pesos", () => {
    expect(pesosToMinor("15")).toBe(1500);
    expect(pesosToMinor("15.50")).toBe(1550);
    expect(pesosToMinor("1,500.25")).toBe(150025);
  });

  it("rejects invalid input", () => {
    expect(pesosToMinor("")).toBeNull();
    expect(pesosToMinor("abc")).toBeNull();
    expect(pesosToMinor("-1")).toBeNull();
    expect(pesosToMinor("1.234")).toBeNull();
  });
});

describe("adminErrorMessage", () => {
  it("maps ApiError kinds to recovery copy", () => {
    const forbidden = new ApiError(403, { error: "forbidden" });
    expect(adminErrorMessage(forbidden, "fallback")).toMatch(/Super Admin/);
    const conflict = new ApiError(409, { error: "payout_held" });
    expect(adminErrorMessage(conflict, "fallback")).not.toMatch(/payout_held/);
  });
});
