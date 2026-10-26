import { describe, expect, it, vi } from "vitest";

import {
  acceptBreakdown,
  actionTitle,
  outcomeSummary,
  planBulk,
  runBulk,
} from "@/components/issue-reports/bulk";
import type { IssueReport, IssueReportAiReview, IssueReportTriage } from "@/lib/api/types";

vi.mock("@/lib/api/client", () => ({
  isApiError: (err: unknown) => err instanceof Error && "kind" in err,
}));

const triage: IssueReportTriage = {
  validity: "unreviewed",
  category: null,
  labels: [],
  duplicateOf: null,
  triagedBy: null,
  triagedAt: null,
};

const ai: IssueReportAiReview = {
  reviewedAt: "2026-10-27T01:00:00.000Z",
  validity: "valid",
  category: "bug",
  labels: ["client-app"],
  duplicateOf: null,
  note: "A real checkout bug.",
  outcome: "pending",
};

function report(n: number, extra: Partial<IssueReport> = {}): IssueReport {
  return {
    id: `0000000${n}-0000-4000-8000-00000000000${n}`,
    issue: `Report ${n}`,
    category: "bug",
    status: "new",
    publishedIn: null,
    createdAt: "2026-10-26T09:00:00.000Z",
    updatedAt: "2026-10-26T09:00:00.000Z",
    screenshots: [],
    triage,
    aiReview: ai,
    ...extra,
  };
}

describe("planBulk", () => {
  it("accepts each report's own suggestion and skips those with none or already matching", () => {
    const duplicate = report(2, {
      aiReview: { ...ai, validity: "duplicate", category: null, labels: [], duplicateOf: report(1).id },
    });
    const plan = planBulk({ kind: "accept" }, [
      report(1),
      duplicate,
      report(3, { aiReview: null }),
      report(4, { aiReview: { ...ai, outcome: "confirmed" }, triage: { ...triage, validity: "valid" } }),
    ]);
    expect(plan.steps.map((step) => step.write)).toEqual([
      { triage: { validity: "valid", category: "bug", labels: ["client-app"] } },
      { triage: { validity: "duplicate", duplicateOf: report(1).id } },
    ]);
    expect(plan.skipped.map((entry) => entry.reason)).toEqual(["No suggestion yet", "Already matches the suggestion"]);
    expect(acceptBreakdown(plan.steps)).toBe("1 valid, 1 duplicate");
  });

  it("marks duplicates of one report, never the report itself", () => {
    const plan = planBulk({ kind: "duplicate", of: report(1).id }, [report(1), report(2)]);
    expect(plan.steps).toEqual([
      { report: report(2), write: { triage: { validity: "duplicate", duplicateOf: report(1).id } } },
    ]);
    expect(plan.skipped[0].reason).toBe("It is the report the others repeat");
  });

  it("moves status without a tracker link and skips reports already there", () => {
    const plan = planBulk({ kind: "status", status: "dismissed" }, [report(1), report(2, { status: "dismissed" })]);
    expect(plan.steps.map((step) => step.write)).toEqual([{ status: "dismissed", publishedIn: null }]);
    expect(plan.skipped[0].reason).toBe("Already dismissed");
    const published = planBulk({ kind: "status", status: "published", publishedIn: "10-27-2026" }, [report(1)]);
    expect(published.steps[0].write).toEqual({ status: "published", publishedIn: "10-27-2026" });
  });

  it("titles each action for its confirm button", () => {
    expect(actionTitle({ kind: "accept" }, 12)).toBe("Accept 12 suggestions");
    expect(actionTitle({ kind: "verdict", validity: "spam" }, 1)).toBe("Mark 1 report spam");
    expect(actionTitle({ kind: "verdict", validity: "unreviewed" }, 2)).toBe("Put 2 reports back to Needs review");
    expect(actionTitle({ kind: "duplicate", of: report(1).id }, 3)).toBe("Mark 3 reports duplicate of 00000001");
    expect(actionTitle({ kind: "status", status: "tracked" }, 4)).toBe("Move 4 reports to Tracked");
  });
});

describe("runBulk", () => {
  it("writes one report at a time and keeps going past a failure", async () => {
    const order: string[] = [];
    let inFlight = 0;
    const write = vi.fn(async (id: string) => {
      inFlight += 1;
      expect(inFlight).toBe(1);
      order.push(id);
      await Promise.resolve();
      inFlight -= 1;
      if (id === report(2).id) throw Object.assign(new Error("gone"), { kind: "not_found", code: "issue_report_not_found" });
      return { ...report(Number(id[7])), triage: { ...triage, validity: "valid" as const } };
    });
    const progress = vi.fn();
    const { steps } = planBulk({ kind: "verdict", validity: "valid" }, [report(1), report(2), report(3)]);
    const outcome = await runBulk(steps, write, { onProgress: progress });
    expect(order).toEqual([report(1).id, report(2).id, report(3).id]);
    expect(outcome.saved.map((entry) => entry.id)).toEqual([report(1).id, report(3).id]);
    expect(outcome.failed).toEqual([{ report: report(2), message: "This report no longer exists." }]);
    expect(progress).toHaveBeenCalledTimes(3);
    expect(outcomeSummary(outcome, 1)).toBe("2 saved. 1 could not be saved. 1 left as they were.");
  });

  it("stops before the next report when asked", async () => {
    let stop = false;
    const write = vi.fn(async (id: string) => {
      stop = true;
      return report(Number(id[7]));
    });
    const { steps } = planBulk({ kind: "verdict", validity: "spam" }, [report(1), report(2), report(3)]);
    const outcome = await runBulk(steps, write, { stopped: () => stop });
    expect(write).toHaveBeenCalledTimes(1);
    expect(outcome.untouched.map((entry) => entry.id)).toEqual([report(2).id, report(3).id]);
    expect(outcomeSummary(outcome, 0)).toBe("1 saved. Stopped before 2 more.");
  });
});
