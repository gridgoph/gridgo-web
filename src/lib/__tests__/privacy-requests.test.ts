import { describe, expect, it } from "vitest";

import type { PrivacyRequest } from "@/lib/api/types";
import {
  daysUntil,
  dueChip,
  isoToManilaDay,
  manilaDayToDueIso,
  needsResolution,
  sortPrivacyRequests,
} from "@/lib/privacy-requests";

// 2026-10-09 10:00 in Manila.
const NOW = Date.parse("2026-10-09T02:00:00Z");

function request(over: Partial<PrivacyRequest>): PrivacyRequest {
  return {
    id: "pr",
    userId: "user_a",
    kind: "access",
    status: "pending",
    details: "",
    resolution: "",
    requestedAt: "2026-10-01T00:00:00Z",
    dueAt: "2026-10-16T00:00:00Z",
    handlerId: null,
    updatedAt: "2026-10-01T00:00:00Z",
    revision: 1,
    ...over,
  };
}

describe("due dates", () => {
  it("counts Manila calendar days, not 24-hour blocks", () => {
    // 23:30 on the 9th in Manila is still today.
    expect(daysUntil("2026-10-09T15:30:00Z", NOW)).toBe(0);
    // 00:30 on the 10th in Manila is tomorrow.
    expect(daysUntil("2026-10-09T16:30:00Z", NOW)).toBe(1);
  });

  it("says overdue and soon in words, and nothing once closed", () => {
    expect(dueChip(request({ dueAt: "2026-10-07T15:59:00Z" }), NOW)).toMatchObject({
      tone: "error",
      label: "Overdue by 2 days",
    });
    expect(dueChip(request({ dueAt: "2026-10-09T15:00:00Z" }), NOW)?.label).toBe("Due today");
    expect(dueChip(request({ dueAt: "2026-10-11T15:00:00Z" }), NOW)).toMatchObject({
      tone: "warning",
      label: "Due in 2 days",
    });
    expect(dueChip(request({ dueAt: "2026-10-20T15:00:00Z" }), NOW)?.tone).toBe("neutral");
    expect(dueChip(request({ status: "completed", dueAt: "2026-10-01T00:00:00Z" }), NOW)).toBeNull();
  });

  it("round-trips a date input as the end of that Manila day", () => {
    expect(manilaDayToDueIso("2026-10-20")).toBe("2026-10-20T15:59:00.000Z");
    expect(isoToManilaDay("2026-10-20T15:59:00.000Z")).toBe("2026-10-20");
    expect(manilaDayToDueIso("20/10/2026")).toBe("");
  });
});

it("needs a resolution only to finish a request", () => {
  expect(needsResolution("completed")).toBe(true);
  expect(needsResolution("rejected")).toBe(true);
  expect(needsResolution("in_progress")).toBe(false);
});

it("puts open requests first by due date, then closed ones newest first", () => {
  const rows = [
    request({ id: "closed-old", status: "completed", updatedAt: "2026-10-02T00:00:00Z" }),
    request({ id: "open-late", dueAt: "2026-10-20T00:00:00Z" }),
    request({ id: "closed-new", status: "rejected", updatedAt: "2026-10-05T00:00:00Z" }),
    request({ id: "open-soon", status: "in_progress", dueAt: "2026-10-10T00:00:00Z" }),
  ];
  expect(sortPrivacyRequests(rows).map((row) => row.id)).toEqual([
    "open-soon",
    "open-late",
    "closed-new",
    "closed-old",
  ]);
});
