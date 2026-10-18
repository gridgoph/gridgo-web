import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { FaultDecision, Issue } from "@/lib/api/types";
import { evidenceBlocks, guidanceWarningLines } from "@/lib/problem-evidence";
import {
  EMPTY_DRAFT,
  FAULT_APPROVAL_LIMIT_MINOR,
  citationLabel,
  decisionAmounts,
  decisionHistory,
  decisionProblems,
  draftFrom,
  fileIdsIn,
  groupFiles,
  isEmptyEvidence,
  needsSuperAdminApproval,
  otherEvidenceFiles,
  problemReportErrorCopy,
  problemRowSummary,
  remediesFor,
  shouldReload,
  type DecisionDraft,
} from "@/lib/problem-reports";

function issue(p: Partial<Issue> = {}): Issue {
  return {
    id: "iss_1",
    orderId: "ord_1",
    clientId: "cli_1",
    description: "Ink smudged on every copy.",
    kind: "damage",
    status: "open",
    consequence: "payout_hold",
    claimId: "clm_1",
    createdAt: "2026-10-18T02:00:00.000Z",
    updatedAt: "2026-10-18T02:00:00.000Z",
    resolvedAt: null,
    resolvedBy: null,
    resolution: null,
    version: 1,
    photoFileIds: ["file_problem"],
    evidenceSnapshot: {
      version: 1,
      capturedAt: "2026-10-18T02:00:00.000Z",
      groups: [
        { id: "specification", kind: "specification", data: { items: [], specification: {} } },
        { id: "approvals", kind: "approval", data: [] },
        { id: "file_check", kind: "preflight", data: null },
        {
          id: "shop_qa",
          kind: "shop_qa",
          data: { finished: { at: "2026-10-17T01:00:00.000Z", photoFileIds: ["file_qa"] } },
        },
        { id: "rider_check", kind: "rider_check", data: { checklist: null } },
        { id: "delivery", kind: "delivery", data: {} },
        { id: "client_photos", kind: "client_report", data: { fileIds: ["file_problem"] } },
      ],
      files: [
        {
          fileId: "file_problem",
          purpose: "refund_evidence",
          originalFilename: "smudge.jpg",
          detectedContentType: "image/jpeg",
          unavailable: false,
        },
        {
          fileId: "file_qa",
          purpose: "finished_product_photo",
          originalFilename: "done.jpg",
          detectedContentType: "image/jpeg",
          unavailable: false,
        },
        { fileId: "file_progress", purpose: "production_photo", unavailable: false },
      ],
    },
    ...p,
  };
}

function draft(p: Partial<DecisionDraft> = {}): DecisionDraft {
  return {
    ...EMPTY_DRAFT,
    fault: "shop",
    remedy: "reprint",
    reason: "The finished-work photo shows the smudge.",
    evidenceIds: ["shop_qa"],
    cost: "500",
    gridgoCost: "0",
    ...p,
  };
}

describe("evidence", () => {
  it("reads null, empty lists and all-empty objects as not recorded", () => {
    expect(isEmptyEvidence(null)).toBe(true);
    expect(isEmptyEvidence([])).toBe(true);
    expect(isEmptyEvidence({ checklist: null })).toBe(true);
    expect(isEmptyEvidence({ items: [], specification: {} })).toBe(true);
    expect(isEmptyEvidence({ fileIds: ["f"] })).toBe(false);
    // A recorded false is a fact, not an absence.
    expect(isEmptyEvidence({ passed: false })).toBe(false);
  });

  it("finds file ids the way the API gathers them", () => {
    expect(
      fileIdsIn({
        fileId: "a",
        signatureFileId: "b",
        packedPhotoFileIds: ["c", "a"],
        nested: [{ photoFileIds: ["d"] }],
      }),
    ).toEqual(["a", "b", "c", "d"]);
  });

  it("matches a group's files to the snapshot and marks unknown ones unavailable", () => {
    const report = issue();
    const qa = report.evidenceSnapshot!.groups.find((g) => g.id === "shop_qa")!;
    expect(groupFiles(report, qa).map((f) => f.originalFilename)).toEqual(["done.jpg"]);
    const ghost = { id: "delivery", kind: "delivery", data: { deliveryPhotoFileIds: ["x"] } };
    expect(groupFiles(report, ghost)).toEqual([{ fileId: "x", unavailable: true }]);
  });

  it("lists gathered files no group names as other order files", () => {
    expect(otherEvidenceFiles(issue()).map((f) => f.fileId)).toEqual(["file_progress"]);
  });

  it("labels a citation by its group or its file", () => {
    expect(citationLabel(issue(), "shop_qa")).toBe("Shop's finished-work photos");
    expect(citationLabel(issue(), "file_qa")).toBe("Finished-work photo: done.jpg");
    expect(citationLabel(issue(), "gone")).toBe("A file no longer in the case");
  });
});

describe("evidence blocks", () => {
  it("states an accepted warning and an unaccepted one differently", () => {
    const lines = guidanceWarningLines({
      files: [
        {
          fileId: "f",
          warnings: [
            { code: "low_resolution", effectiveDpi: 120, minimumDpi: 300, acceptedAt: "2026-10-01T00:00:00.000Z" },
            { code: "color_mode", colorMode: "rgb", expectedColorMode: "cmyk", acceptedAt: null },
          ],
        },
      ],
    });
    expect(lines[0]).toMatch(/^Low resolution: .*Client accepted on /);
    expect(lines[1]).toMatch(/Not accepted by the client\.$/);
  });

  it("reads a legacy approval as not recorded, never as consent", () => {
    const [block] = evidenceBlocks("approvals", [
      { phase: "checkout", status: "legacy_unrecorded", method: null, at: "2026-10-01T00:00:00.000Z" },
    ]);
    expect(block.title).toBe("Approval at checkout");
    expect(block.facts[0]).toEqual({
      label: "Result",
      value: "Not recorded (placed before approvals were kept)",
    });
  });

  it("summarises the rider's checks and count without inventing a signature", () => {
    const [block] = evidenceBlocks("rider_check", {
      checklist: {
        status: "passed",
        checks: [
          { code: "quantity_matches", passed: true },
          { code: "no_visible_damage", passed: false },
        ],
        counts: [{ lineItemId: "l1", expectedQuantity: 100, countedQuantity: 98 }],
        evidenceFileIds: [],
        failureNote: null,
        completedAt: "2026-10-17T03:00:00.000Z",
      },
    });
    const labels = block.facts.map((f) => f.label);
    expect(labels).toContain("Checks");
    expect(block.facts.find((f) => f.label === "Count")?.value).toBe(
      "98 counted of 100 expected",
    );
    expect(labels).not.toContain("Shop's signature");
  });

  it("names the spec lines with their options and instructions", () => {
    const [line] = evidenceBlocks("specification", {
      items: [
        {
          itemNameSnapshot: "Flyers A5",
          quantity: 500,
          options: [{ groupNameSnapshot: "Paper", optionLabelSnapshot: "Glossy" }],
          specialInstructions: "Trim tight.",
        },
      ],
    });
    expect(line.title).toBe("Flyers A5");
    expect(line.facts).toEqual([
      { label: "Quantity", value: "500" },
      { label: "Options", value: "Paper: Glossy" },
      { label: "Instructions", value: "Trim tight." },
    ]);
  });
});

describe("decision rules", () => {
  it("narrows remedies by fault", () => {
    expect(remediesFor("client")).toEqual(["none"]);
    expect(remediesFor("shop")).not.toContain("none");
  });

  it("accepts a complete shop-funded reprint", () => {
    expect(decisionProblems(draft())).toEqual({});
    expect(decisionAmounts(draft())).toEqual({ costMinor: 50000, gridgoCostMinor: 0 });
  });

  it("asks why not a reprint for either refund", () => {
    expect(decisionProblems(draft({ remedy: "partial_refund" })).alternativesReason).toBeDefined();
    expect(
      decisionProblems(draft({ remedy: "full_refund", alternativesReason: "Unusable." })),
    ).toEqual({});
  });

  it("makes client fault no remedy at no cost", () => {
    const client = draft({ fault: "client", remedy: "none", cost: "", gridgoCost: "" });
    expect(decisionProblems(client)).toEqual({});
    expect(decisionAmounts(client)).toEqual({ costMinor: 0, gridgoCostMinor: 0 });
    expect(decisionProblems(draft({ fault: "client", remedy: "reprint" })).remedy).toBe(
      "Client fault has no remedy.",
    );
  });

  it("has GRIDGO fund the whole of a rider or GRIDGO fault", () => {
    expect(decisionAmounts(draft({ fault: "rider", cost: "1200", gridgoCost: "5" }))).toEqual({
      costMinor: 120000,
      gridgoCostMinor: 120000,
    });
  });

  it("refuses GRIDGO paying more than the total, no evidence, or no finding", () => {
    const problems = decisionProblems(
      draft({ gridgoCost: "600", evidenceIds: [], reason: "  " }),
    );
    expect(Object.keys(problems).sort()).toEqual(["evidence", "gridgoCost", "reason"]);
  });

  it("sends GRIDGO funding above ₱1,000 to Super Admin, but not exactly ₱1,000", () => {
    expect(needsSuperAdminApproval(FAULT_APPROVAL_LIMIT_MINOR, false)).toBe(false);
    expect(needsSuperAdminApproval(FAULT_APPROVAL_LIMIT_MINOR + 1, false)).toBe(true);
    // Super Admin's own finding is approved as it is recorded.
    expect(needsSuperAdminApproval(FAULT_APPROVAL_LIMIT_MINOR + 1, true)).toBe(false);
  });

  it("starts a revision from the current finding", () => {
    const current: FaultDecision = {
      id: "idecision_1",
      fault: "gridgo",
      remedy: "full_refund",
      reason: "Lost at the hub.",
      evidenceIds: ["delivery"],
      alternativesReason: "No time to reprint.",
      costMinor: 150000,
      gridgoCostMinor: 150000,
      recordedAt: "2026-10-18T03:00:00.000Z",
      status: "awaiting_approval",
    };
    expect(draftFrom(current)).toMatchObject({
      fault: "gridgo",
      remedy: "full_refund",
      cost: "1500.00",
      gridgoCost: "1500.00",
      evidenceIds: ["delivery"],
    });
  });
});

describe("case summary and errors", () => {
  const approved: FaultDecision = {
    id: "d1",
    fault: "shop",
    remedy: "reprint",
    reason: "r",
    recordedAt: "2026-10-18T03:00:00.000Z",
    status: "approved",
  };

  it("summarises the row by where the case stands", () => {
    expect(problemRowSummary(null)).toMatch(/could not be loaded/);
    expect(problemRowSummary([])).toBe("No problem reported.");
    expect(problemRowSummary([issue()])).toBe("Reported by the client. Needs a finding.");
    expect(problemRowSummary([issue({ faultDecision: approved })])).toBe(
      "The shop at fault, reprint. Ready to resolve.",
    );
    expect(
      problemRowSummary([issue({ faultDecision: { ...approved, status: "awaiting_approval" } })]),
    ).toMatch(/Waiting for Super Admin\.$/);
    expect(problemRowSummary([issue({ status: "resolved" })])).toBe("Problem report resolved.");
  });

  it("lists the history newest first", () => {
    const later = { ...approved, id: "d2" };
    expect(decisionHistory(issue({ faultDecisionHistory: [approved, later] })).map((d) => d.id)).toEqual([
      "d2",
      "d1",
    ]);
  });

  it("puts the contract's codes in plain words and reloads on a stale case", () => {
    const stale = new ApiError(409, { error: "issue_stale", currentVersion: 3 });
    expect(problemReportErrorCopy(stale)).toMatch(/changed this problem report/);
    expect(shouldReload(stale)).toBe(true);
    const pending = new ApiError(409, { error: "fault_approval_pending" });
    expect(problemReportErrorCopy(pending)).toMatch(/waiting for Super Admin/);
    expect(shouldReload(pending)).toBe(false);
    for (const code of [
      "invalid_fault_decision",
      "fault_reason_required",
      "fault_evidence_required",
      "fault_client_no_refund",
      "invalid_fault_funding",
      "invalid_refund_amount",
      "fault_super_admin_required",
      "issue_closed",
      "fault_decision_conflict",
      "fault_refund_not_authorized",
    ]) {
      const copy = problemReportErrorCopy(new ApiError(400, { error: code }));
      expect(copy, code).toBeTruthy();
      expect(copy, code).not.toMatch(/_/);
    }
    expect(problemReportErrorCopy(new Error("x"))).toBeNull();
  });
});
