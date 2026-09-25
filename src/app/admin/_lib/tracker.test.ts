import { describe, expect, it } from "vitest";

import {
  admitAttachments,
  AFTER_DECISION_STATUSES,
  decisionTextError,
  filterTrackerItems,
  githubEffect,
  groupBySection,
  needsDecisionCount,
  statusCounts,
  TRACKER_STATUSES,
  trackerErrorMessage,
} from "@/app/admin/_lib/tracker";
import {
  blockedItem,
  decisionItem,
  liveItem,
  openItem,
  trackerItem,
} from "@/app/admin/tracker/__tests__/fixtures";
import { ApiError } from "@/lib/api/client";

function file(name: string, type: string, size = 1024): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("tracker statuses", () => {
  it("keeps the six contract values with the report's labels", () => {
    expect(TRACKER_STATUSES.map((s) => [s.value, s.label])).toEqual([
      ["open", "Open"],
      ["in-review", "In review"],
      ["merged-dev", "Merged (dev)"],
      ["live", "Live (prod)"],
      ["needs-decision", "Needs decision"],
      ["blocked", "Blocked"],
    ]);
    expect(AFTER_DECISION_STATUSES.map((s) => s.value)).not.toContain("needs-decision");
  });

  it("says what each status does to the GitHub issue", () => {
    expect(githubEffect("live")).toMatch(/closed as completed/);
    expect(githubEffect("needs-decision")).toMatch(/needs-decision label/);
    expect(githubEffect("open")).toMatch(/reopened if it was closed/);
  });
});

describe("sections and filters", () => {
  const items = [openItem, liveItem, decisionItem, blockedItem];

  it("orders sections as the report does and items by sheet order, unknown sections last", () => {
    const stray = trackerItem({ key: "gridgo-rider#3", section: "extras", ref: "99.0" });
    const second = trackerItem({ key: "gridgo-api#90", section: "general", order: 0, ref: "0.5" });
    const groups = groupBySection([...items, stray, second]);
    expect(groups.map((g) => g.key)).toEqual(["general", "supplier", "step-01", "step-08", "extras"]);
    expect(groups[0]!.items.map((i) => i.ref)).toEqual(["0.5", "1.0"]);
    expect(groups.at(-1)!.title).toBe("EXTRAS");
  });

  it("combines status, developer and search", () => {
    const pick = (filters: Parameters<typeof filterTrackerItems>[1]) =>
      filterTrackerItems(items, filters).map((i) => i.ref);
    expect(pick({ status: "all", developer: "Ven", query: "" })).toEqual(["4.0", "2.1"]);
    expect(pick({ status: "blocked", developer: "Ven", query: "" })).toEqual(["2.1"]);
    expect(pick({ status: "all", developer: "all", query: "PAYOUTS" })).toEqual(["31.0"]);
    expect(pick({ status: "all", developer: "all", query: "gridgo-web#50" })).toEqual(["1.0"]);
  });

  it("counts every status, zero included", () => {
    expect(statusCounts(items)).toEqual({
      open: 1,
      "in-review": 0,
      "merged-dev": 0,
      live: 1,
      "needs-decision": 1,
      blocked: 1,
    });
    expect(needsDecisionCount(items)).toBe(1);
  });
});

describe("decision form limits", () => {
  it("requires text and caps it at 5,000 characters after trimming", () => {
    expect(decisionTextError("   ")).toBe("Write the decision before saving it.");
    expect(decisionTextError(` ${"a".repeat(5000)} `)).toBeNull();
    expect(decisionTextError("a".repeat(5001))).toMatch(/5,000 characters; it is 5,001/);
  });

  it("admits PNG, JPEG, WebP and PDF up to 10 MB, six in all", () => {
    const tenMb = 10 * 1024 * 1024;
    const { accepted, problems } = admitAttachments(4, [
      file("a.png", "image/png"),
      file("b.heic", "image/heic"),
      file("c.pdf", "application/pdf", tenMb + 1),
      file("d.jpg", "image/jpeg", tenMb),
      file("e.webp", "image/webp"),
      file("f.pdf", "application/pdf"),
    ]);
    expect(accepted.map((f) => f.name)).toEqual(["a.png", "d.jpg"]);
    expect(problems).toEqual([
      "b.heic is not a PNG, JPEG, WebP or PDF.",
      "c.pdf is larger than 10 MB (10.0 MB).",
      "A decision holds 6 files at most, so 2 were left out.",
    ]);
  });
});

describe("tracker errors", () => {
  it("never shows a raw code", () => {
    expect(trackerErrorMessage(new ApiError(503, { error: "tracker_not_configured" }), "status")).toBe(
      "The tracker is not connected to GitHub yet, so nothing was changed.",
    );
    expect(trackerErrorMessage(new ApiError(403, { error: "forbidden" }), "load")).toBe(
      "The tracker is for Super Admin only.",
    );
    expect(trackerErrorMessage(new ApiError(409, { error: "x" }), "decision")).toMatch(
      /no longer waiting on a decision/,
    );
    expect(trackerErrorMessage(new Error("offline"), "upload")).toBe(
      "The file did not upload. Nothing was saved; try again.",
    );
  });
});
