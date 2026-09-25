import { describe, expect, it } from "vitest";

import {
  checkTrackerIssueUrl,
  parseTrackerIssueUrl,
  trackerIssueLabel,
} from "@/components/issue-reports/tracker-link";

describe("tracker issue links", () => {
  it("reads a stored link into repo and number", () => {
    expect(parseTrackerIssueUrl("https://github.com/gridgoph/gridgo-api/issues/7")).toEqual({
      url: "https://github.com/gridgoph/gridgo-api/issues/7",
      repo: "gridgo-api",
      number: 7,
    });
    expect(parseTrackerIssueUrl(null)).toBeNull();
    expect(parseTrackerIssueUrl("https://github.com/gridgoph/gridgo-api/pull/7")).toBeNull();
  });

  it("labels a link the way the chip reads", () => {
    expect(trackerIssueLabel("https://github.com/gridgoph/gridgo-web/issues/62")).toBe("gridgo-web #62");
    expect(trackerIssueLabel("https://example.com/x")).toBe("https://example.com/x");
  });

  it("accepts only gridgoph issue links, tidying what a copy adds", () => {
    expect(checkTrackerIssueUrl(" https://github.com/gridgoph/gridgo-web/issues/62?x=1 ")).toEqual({
      ok: true,
      url: "https://github.com/gridgoph/gridgo-web/issues/62",
    });
    for (const bad of [
      "http://github.com/gridgoph/gridgo-web/issues/62",
      "https://github.com/gridgoph/gridgo-web/issues/0",
      "https://github.com/gridgoph/issues/62",
      "https://gitlab.com/gridgoph/gridgo-web/issues/62",
      "https://github.com/gridgoph/gridgo-web/issues/62/extra",
    ]) {
      expect(checkTrackerIssueUrl(bad).ok, bad).toBe(false);
    }
  });
});
