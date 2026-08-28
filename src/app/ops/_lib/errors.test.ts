import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import { opsErrorMessage } from "@/app/ops/_lib/errors";

function conflict(code: string) {
  return new ApiError(409, { error: code, message: "ignored" });
}

describe("opsErrorMessage", () => {
  it("names a missing rider licence instead of a generic moved-on conflict", () => {
    expect(opsErrorMessage(conflict("rider_documents_incomplete"), "fallback")).toMatch(
      /driver's licence/i,
    );
  });

  it("keeps a generic conflict only when the code is unknown", () => {
    expect(opsErrorMessage(conflict("something_else"), "fallback")).toMatch(/moved on/i);
  });
});
