import { describe, expect, it } from "vitest";

import {
  activitySortValue,
  jobActivity,
  latestTimelineEntry,
  relativeTime,
} from "./job-activity";
import type { Order, TimelineEntry } from "@/lib/api/types";

function job(partial: Partial<Order> & Pick<Order, "id" | "state">): Order {
  return {
    clientId: "c1",
    supplierId: "user_supplier",
    riderId: null,
    title: "Job",
    deadline: null,
    address: "Somewhere",
    deliveryFeeMinor: 0,
    totalMinor: 0,
    paymentMethod: null,
    paymentStatus: "unpaid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    timeline: [],
    ...partial,
  } as Order;
}

function entry(partial: Partial<TimelineEntry>): TimelineEntry {
  return { at: "2026-08-01T00:00:00.000Z", state: "production", by: "system", note: "", ...partial };
}

describe("latestTimelineEntry", () => {
  it("returns the newest entry regardless of array order", () => {
    const found = latestTimelineEntry(
      job({
        id: "o1",
        state: "production",
        timeline: [
          entry({ at: "2026-08-02T10:00:00.000Z", note: "middle" }),
          entry({ at: "2026-08-03T10:00:00.000Z", note: "newest" }),
          entry({ at: "2026-08-01T10:00:00.000Z", note: "oldest" }),
        ],
      }),
    );
    expect(found?.note).toBe("newest");
  });

  it("ignores entries with an unparseable timestamp", () => {
    const found = latestTimelineEntry(
      job({
        id: "o1",
        state: "production",
        timeline: [entry({ at: "not-a-date", note: "junk" }), entry({ at: "2026-08-01T00:00:00.000Z", note: "real" })],
      }),
    );
    expect(found?.note).toBe("real");
  });

  it("returns null for an empty timeline", () => {
    expect(latestTimelineEntry(job({ id: "o1", state: "production" }))).toBeNull();
  });
});

describe("jobActivity", () => {
  it("uses the note from the newest timeline entry", () => {
    const activity = jobActivity(
      job({
        id: "o1",
        state: "production",
        updatedAt: "2026-08-03T10:00:00.000Z",
        timeline: [entry({ at: "2026-08-03T10:00:00.000Z", by: "user_ops", note: "Downpayment confirmed" })],
      }),
    );
    expect(activity.what).toBe("Downpayment confirmed");
    expect(activity.who).toBe("Operations");
    expect(activity.at).toBe(Date.parse("2026-08-03T10:00:00.000Z"));
  });

  it("falls back to the entry's state label when the note is blank", () => {
    const activity = jobActivity(
      job({
        id: "o1",
        state: "production",
        timeline: [entry({ at: "2026-08-03T10:00:00.000Z", state: "needs_qa", note: "   " })],
      }),
    );
    expect(activity.what).toBe("Needs QA review");
  });

  it("falls back to the job's own state when there is no timeline at all", () => {
    const activity = jobActivity(job({ id: "o1", state: "needs_qa", timeline: [] }));
    expect(activity.what).toBe("Needs QA review");
    expect(activity.who).toBe("");
  });

  it("keeps updatedAt as the clock even when the timeline is staler", () => {
    const activity = jobActivity(
      job({
        id: "o1",
        state: "production",
        updatedAt: "2026-08-05T00:00:00.000Z",
        timeline: [entry({ at: "2026-08-01T00:00:00.000Z", note: "older note" })],
      }),
    );
    expect(activity.at).toBe(Date.parse("2026-08-05T00:00:00.000Z"));
    expect(activity.what).toBe("older note");
  });

  it("uses the timeline clock when updatedAt is missing", () => {
    const activity = jobActivity(
      job({
        id: "o1",
        state: "production",
        updatedAt: "" as unknown as string,
        timeline: [entry({ at: "2026-08-04T00:00:00.000Z", note: "only clock" })],
      }),
    );
    expect(activity.at).toBe(Date.parse("2026-08-04T00:00:00.000Z"));
    expect(activity.iso).toBe("2026-08-04T00:00:00.000Z");
  });

  it("reports no clock when neither source has one", () => {
    const activity = jobActivity(
      job({ id: "o1", state: "production", updatedAt: "" as unknown as string, timeline: [] }),
    );
    expect(activity.at).toBeNull();
    expect(activity.iso).toBeNull();
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-08-10T12:00:00.000Z");

  it.each([
    ["2026-08-10T11:59:30.000Z", "just now"],
    ["2026-08-10T11:30:00.000Z", "30m ago"],
    ["2026-08-10T09:00:00.000Z", "3h ago"],
    ["2026-08-08T12:00:00.000Z", "2d ago"],
    ["2026-07-27T12:00:00.000Z", "2w ago"],
    ["2026-05-01T12:00:00.000Z", "over a month ago"],
  ])("renders %s as %s", (iso, expected) => {
    expect(relativeTime(Date.parse(iso), now)).toBe(expected);
  });

  it("renders a clock-skewed future stamp as just now rather than a negative age", () => {
    expect(relativeTime(Date.parse("2026-08-10T12:05:00.000Z"), now)).toBe("just now");
  });

  it("renders a missing clock as an em dash", () => {
    expect(relativeTime(null, now)).toBe("—");
  });
});

describe("activitySortValue", () => {
  it("orders the most recently moved job first when sorted descending", () => {
    const jobs = [
      job({ id: "old", state: "production", updatedAt: "2026-08-01T00:00:00.000Z" }),
      job({ id: "new", state: "production", updatedAt: "2026-08-09T00:00:00.000Z" }),
      job({ id: "mid", state: "production", updatedAt: "2026-08-05T00:00:00.000Z" }),
    ];
    const order = [...jobs]
      .sort((a, b) => activitySortValue(b) - activitySortValue(a))
      .map((j) => j.id);
    expect(order).toEqual(["new", "mid", "old"]);
  });

  it("sinks a job with no clock to the bottom instead of the top", () => {
    const jobs = [
      job({ id: "none", state: "production", updatedAt: "" as unknown as string }),
      job({ id: "dated", state: "production", updatedAt: "2026-08-01T00:00:00.000Z" }),
    ];
    const order = [...jobs]
      .sort((a, b) => activitySortValue(b) - activitySortValue(a))
      .map((j) => j.id);
    expect(order).toEqual(["dated", "none"]);
  });
});
