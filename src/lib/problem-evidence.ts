/**
 * The gathered evidence groups of a problem report, read as plain lines
 * (gridgo-api docs/REFUNDS_AND_FAULT_API.md, "Problem report and automatic
 * evidence"). The snapshot is frozen at reporting time; a later order edit
 * never changes it.
 *
 * Each reader takes the group's raw `data`, which the API copies from the
 * order as it stood, and says only what is there. A missing field is left
 * out, never filled in: no line here may suggest a consent, an inspection
 * or a signature the record does not hold.
 */

import type {
  ArtworkGuidanceRecord,
  ArtworkGuidanceWarning,
  IssueEvidenceGroupId,
  PickupCheck,
  PickupCount,
} from "@/lib/api/types";
import { acceptanceLine, warningLine, warningTitle } from "@/lib/artwork-guidance";
import { checkResults } from "@/lib/counter-check";
import { QA_CHECKS } from "@/lib/file-check";
import { formatDateTime } from "@/lib/format";

/** One fact: a short label and what was recorded. */
export type EvidenceFact = { label: string; value: string };

/** A titled run of facts, such as one order line or one approval. */
export type EvidenceBlock = { title: string; facts: EvidenceFact[] };

type Data = Record<string, unknown>;

const isObject = (value: unknown): value is Data =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const when = (value: unknown): string | null => {
  const at = text(value);
  return at && Number.isFinite(Date.parse(at)) ? formatDateTime(at) : null;
};

function fact(facts: EvidenceFact[], label: string, value: string | null | undefined) {
  if (value) facts.push({ label, value });
}

export function evidenceBlocks(id: IssueEvidenceGroupId | string, data: unknown): EvidenceBlock[] {
  switch (id) {
    case "specification":
      return specificationBlocks(data);
    case "approvals":
      return approvalBlocks(data);
    case "file_check":
      return fileCheckBlocks(data);
    case "shop_qa":
      return shopQaBlocks(data);
    case "rider_check":
      return riderCheckBlocks(data);
    case "delivery":
      return deliveryBlocks(data);
    default:
      return [];
  }
}

// ---- Approved spec and instructions ----

function optionsLine(options: unknown): string | null {
  const labels = list(options).flatMap((option) => {
    if (!isObject(option)) return [];
    const group = text(option.groupNameSnapshot);
    const label = text(option.optionLabelSnapshot);
    if (!label) return [];
    return [group ? `${group}: ${label}` : label];
  });
  return labels.length ? labels.join(" · ") : null;
}

function quantityLine(item: Data): string | null {
  const quantity = item.quantity;
  if (typeof quantity !== "number") return null;
  const pages = typeof item.documentPages === "number" ? `, ${item.documentPages} pages each` : "";
  return `${quantity.toLocaleString("en-PH")}${pages}`;
}

function linksLine(links: unknown): string | null {
  const count = list(links).length;
  if (!count) return null;
  return count === 1 ? "1 design link" : `${count} design links`;
}

/** Every warning the line's files carried, and whether the client accepted it. */
export function guidanceWarningLines(guidance: unknown): string[] {
  if (!isObject(guidance)) return [];
  const record = guidance as unknown as ArtworkGuidanceRecord;
  return list(record.files).flatMap((file) =>
    isObject(file)
      ? list(file.warnings).flatMap((warning) => {
          if (!isObject(warning) || typeof warning.code !== "string") return [];
          const typed = warning as unknown as ArtworkGuidanceWarning;
          return [`${warningTitle(typed)}: ${warningLine(typed)} ${acceptanceLine(typed)}.`];
        })
      : [],
  );
}

function specificationBlocks(data: unknown): EvidenceBlock[] {
  if (!isObject(data)) return [];
  const blocks: EvidenceBlock[] = [];
  for (const [index, entry] of list(data.items).entries()) {
    if (!isObject(entry)) continue;
    const facts: EvidenceFact[] = [];
    fact(facts, "Quantity", quantityLine(entry));
    fact(facts, "Options", optionsLine(entry.options));
    fact(facts, "Description", text(entry.descriptionSnapshot));
    fact(facts, "Instructions", text(entry.specialInstructions));
    fact(facts, "Design links", linksLine(entry.artworkLinks));
    for (const line of guidanceWarningLines(entry.artworkGuidance)) {
      facts.push({ label: "File warning", value: line });
    }
    blocks.push({ title: text(entry.itemNameSnapshot) ?? `Line ${index + 1}`, facts });
  }
  // Orders from before line items keep their spec on the order itself.
  if (isObject(data.specification)) {
    const spec = data.specification;
    const facts: EvidenceFact[] = [];
    fact(facts, "Quantity", typeof spec.quantity === "number" ? spec.quantity.toLocaleString("en-PH") : null);
    fact(facts, "Size", text(spec.size));
    fact(facts, "Material", text(spec.material));
    fact(facts, "Finish", text(spec.finish));
    fact(facts, "Instructions", text(spec.specialInstructions));
    fact(facts, "Design links", linksLine(spec.artworkLinks));
    for (const line of guidanceWarningLines(spec.artworkGuidance)) {
      facts.push({ label: "File warning", value: line });
    }
    if (facts.length) blocks.push({ title: text(spec.title) ?? "Order", facts });
  }
  const sampleRound = when(data.sampleRoundAt);
  if (sampleRound) {
    blocks.push({ title: "Sample round", facts: [{ label: "Last sample shown", value: sampleRound }] });
  }
  return blocks;
}

// ---- Client approvals ----

const APPROVAL_PHASE: Record<string, string> = {
  checkout: "Approval at checkout",
  sample: "Sample approval",
};

const APPROVAL_METHOD: Record<string, string> = {
  drawn: "Drawn signature",
  one_tap: "One-tap approval",
};

const APPROVAL_STATUS: Record<string, string> = {
  approved: "Approved",
  // Placed before approvals were kept: missing, never a consent.
  legacy_unrecorded: "Not recorded (placed before approvals were kept)",
};

function approvalBlocks(data: unknown): EvidenceBlock[] {
  return list(data).flatMap((entry, index) => {
    if (!isObject(entry)) return [];
    const facts: EvidenceFact[] = [];
    const status = text(entry.status);
    fact(facts, "Result", status ? (APPROVAL_STATUS[status] ?? "Recorded") : null);
    fact(facts, "Recorded", when(entry.at));
    const method = text(entry.method);
    fact(facts, "How", method ? (APPROVAL_METHOD[method] ?? "Recorded approval") : null);
    fact(facts, "Statement", text(entry.statement));
    fact(facts, "Approved spec", isObject(entry.snapshot) ? "Kept with the approval" : null);
    const phase = text(entry.phase);
    return [{ title: (phase && APPROVAL_PHASE[phase]) || `Approval ${index + 1}`, facts }];
  });
}

// ---- File check ----

const FILE_CHECK_STATUS: Record<string, string> = {
  pending: "Waiting for the GRIDGO Team",
  passed: "Passed",
  failed: "Sent back to the client",
  cancelled: "Cancelled",
};

function fileCheckBlocks(data: unknown): EvidenceBlock[] {
  if (!isObject(data)) return [];
  const facts: EvidenceFact[] = [];
  const status = text(data.status);
  fact(facts, "Result", status ? (FILE_CHECK_STATUS[status] ?? "Recorded") : null);
  fact(facts, "Reviewed", when(data.reviewedAt));
  fact(facts, "Sent back because", text(data.reason));
  const checks = isObject(data.checklist) && isObject(data.checklist.checks) ? data.checklist.checks : null;
  if (checks) {
    for (const check of QA_CHECKS) {
      const value = checks[check.id];
      if (typeof value === "boolean") {
        facts.push({ label: check.label, value: value ? "Ticked" : "Not ticked" });
      }
    }
  }
  return facts.length ? [{ title: "GRIDGO Team's review", facts }] : [];
}

// ---- Shop's finished-work photos ----

function photoCountLine(ids: unknown): string | null {
  const count = list(ids).length;
  if (!count) return null;
  return count === 1 ? "1 photo" : `${count} photos`;
}

const REVIEW_DECISION: Record<string, string> = {
  approved: "Approved",
  rejected: "Sent back to the shop",
};

function submissionFacts(finished: unknown, review: unknown): EvidenceFact[] {
  const facts: EvidenceFact[] = [];
  if (isObject(finished)) {
    fact(facts, "Sent", when(finished.at));
    fact(facts, "Photos", photoCountLine(finished.photoFileIds));
  }
  if (isObject(review)) {
    const decision = text(review.decision);
    fact(facts, "GRIDGO's review", decision ? (REVIEW_DECISION[decision] ?? "Reviewed") : null);
    fact(facts, "Reviewed", when(review.at));
    fact(facts, "Note to the shop", text(review.note));
  }
  return facts;
}

function shopQaBlocks(data: unknown): EvidenceBlock[] {
  if (!isObject(data)) return [];
  const blocks: EvidenceBlock[] = [];
  const latest = submissionFacts(data.finished, data.review);
  if (latest.length) blocks.push({ title: "Latest submission", facts: latest });
  for (const [index, attempt] of list(data.attempts).entries()) {
    if (!isObject(attempt)) continue;
    const facts = submissionFacts(attempt.finished, attempt.review);
    if (facts.length) blocks.push({ title: `Earlier attempt ${index + 1}`, facts });
  }
  return blocks;
}

// ---- Rider's counter check ----

const CHECKLIST_STATUS: Record<string, string> = {
  not_started: "Not started",
  passed: "Passed",
  inspected: "Inspected, not yet packed",
  failed_escalated: "Failed, sent to Operations",
  escalation_resolved: "Operations answered; checks repeated",
};

function countsLine(counts: unknown): string | null {
  const rows = list(counts).filter(isObject) as unknown as PickupCount[];
  if (!rows.length) return null;
  const expected = rows.reduce((sum, row) => sum + (row.expectedQuantity ?? 0), 0);
  const counted = rows.reduce((sum, row) => sum + (row.countedQuantity ?? 0), 0);
  return `${counted.toLocaleString("en-PH")} counted of ${expected.toLocaleString("en-PH")} expected`;
}

function checksLine(checks: unknown): string | null {
  const results = checkResults(list(checks).filter(isObject) as unknown as PickupCheck[]);
  if (!results.length) return null;
  const passed = results.filter((check) => check.passed).length;
  const failed = results.filter((check) => !check.passed).map((check) => check.label);
  return failed.length
    ? `${passed} of ${results.length} passed. Failed: ${failed.join(", ")}`
    : `All ${results.length} passed`;
}

function riderCheckBlocks(data: unknown): EvidenceBlock[] {
  if (!isObject(data)) return [];
  const blocks: EvidenceBlock[] = [];
  const checklist = data.checklist;
  if (isObject(checklist)) {
    const facts: EvidenceFact[] = [];
    const status = text(checklist.status);
    fact(facts, "Result", status ? (CHECKLIST_STATUS[status] ?? "Recorded") : null);
    fact(facts, "Completed", when(checklist.completedAt));
    fact(facts, "Checks", checksLine(checklist.checks));
    fact(facts, "Count", countsLine(checklist.counts));
    fact(facts, "Rider's note", text(checklist.failureNote));
    fact(facts, "Packed photos", photoCountLine(checklist.packedPhotoFileIds));
    fact(facts, "Photos at the counter", photoCountLine(checklist.evidenceFileIds));
    const signature = checklist.handoffSignature;
    if (isObject(signature)) {
      const signer = text(signature.signerName);
      const signed = when(signature.signedAt);
      fact(
        facts,
        "Shop's signature",
        signer && signed ? `${signer}, ${signed}` : (signer ?? signed),
      );
    }
    if (facts.length) blocks.push({ title: "Counter check", facts });
  }
  for (const [index, entry] of list(data.inspections).entries()) {
    if (!isObject(entry)) continue;
    const facts: EvidenceFact[] = [];
    fact(facts, "Completed", when(entry.completedAt));
    fact(facts, "Checks", checksLine(entry.checks));
    fact(facts, "Count", countsLine(entry.counts));
    if (facts.length) blocks.push({ title: `Inspection ${index + 1}`, facts });
  }
  const packing = list(data.packingPhotos).filter(isObject);
  if (packing.length) {
    blocks.push({
      title: "Rider's packing photos",
      facts: [
        { label: "Photos", value: photoCountLine(packing) ?? "" },
        ...(when(packing.at(-1)?.at) ? [{ label: "Latest", value: when(packing.at(-1)?.at) ?? "" }] : []),
      ],
    });
  }
  return blocks;
}

// ---- Delivery ----

const DELIVERY_EVIDENCE: Record<string, string> = {
  photo: "Photo at the door",
  signature: "Recipient's signature",
};

function deliveryBlocks(data: unknown): EvidenceBlock[] {
  if (!isObject(data)) return [];
  const facts: EvidenceFact[] = [];
  const evidence = data.deliveryEvidence;
  if (isObject(evidence)) {
    const type = text(evidence.evidenceType);
    fact(facts, "Evidence", type ? (DELIVERY_EVIDENCE[type] ?? "Recorded") : null);
    fact(facts, "Recorded", when(evidence.recordedAt));
  }
  fact(facts, "Delivery photos", photoCountLine(data.deliveryPhotoFileIds));
  fact(facts, "Other delivery proof", photoCountLine(data.deliveryProofFileIds));
  return facts.length ? [{ title: "At delivery", facts }] : [];
}
