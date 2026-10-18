/**
 * Problem reports: the evidence the API gathered when a client reported a
 * problem, and Operations' written fault and remedy finding
 * (gridgo-api docs/REFUNDS_AND_FAULT_API.md, tracker 221 decision B).
 *
 * The finding is a human record. It moves no money, changes no claim and
 * pays nobody; the refund and claim screens still do that, each with its own
 * confirmation. These helpers mirror the API's checks so the form can say
 * what is missing before it is sent, and turn its error codes into words.
 */

import { isApiError } from "@/lib/api/client";
import type {
  FaultDecision,
  FaultParty,
  FaultRemedy,
  Issue,
  IssueEvidenceFile,
  IssueEvidenceGroup,
  IssueEvidenceGroupId,
} from "@/lib/api/types";
import { formatPhp, pesosToMinor } from "@/lib/format";

/** GRIDGO funding above this needs Super Admin; exactly this does not. */
export const FAULT_APPROVAL_LIMIT_MINOR = 100_000;
export const DECISION_TEXT_MAX = 2000;
export const EVIDENCE_CITATIONS_MAX = 50;

export const ISSUE_EVIDENCE_GROUPS: ReadonlyArray<{
  id: IssueEvidenceGroupId;
  title: string;
  /** What the group holds, for the reader deciding whether to open it. */
  body: string;
}> = [
  {
    id: "client_photos",
    title: "Client's problem photos",
    body: "What the client sent with the report.",
  },
  {
    id: "specification",
    title: "Approved spec and instructions",
    body: "Each line as ordered: product, quantity, options, instructions, design links, and the file warnings the client accepted.",
  },
  {
    id: "approvals",
    title: "Client approvals",
    body: "Checkout or sample approvals the client signed, with the spec they approved.",
  },
  {
    id: "file_check",
    title: "File check",
    body: "The GRIDGO Team's artwork review before the shop heard of the order.",
  },
  {
    id: "shop_qa",
    title: "Shop's finished-work photos",
    body: "The shop's finished, unpacked photos and GRIDGO's review of each attempt.",
  },
  {
    id: "rider_check",
    title: "Rider's counter check",
    body: "The rider's counts and checks at the shop, the packed photos and the shop's signature.",
  },
  {
    id: "delivery",
    title: "Delivery",
    body: "The delivery photo or signature the rider recorded.",
  },
];

export const NOT_RECORDED = "Not recorded";

export function evidenceGroup(
  issue: Issue,
  id: IssueEvidenceGroupId,
): IssueEvidenceGroup | null {
  return issue.evidenceSnapshot?.groups.find((group) => group.id === id) ?? null;
}

/**
 * Whether a captured value holds anything at all. Null, an empty list, an
 * empty object, or an object whose every field is empty all mean "not
 * recorded". That is never proof of consent or of intact goods.
 */
export function isEmptyEvidence(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.every(isEmptyEvidence);
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(isEmptyEvidence);
  }
  return false;
}

/** Every file id a captured value names, in the order it names them. */
export function fileIdsIn(value: unknown, found: string[] = []): string[] {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const entry of value) fileIdsIn(entry, found);
    return found;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if ((key === "fileId" || key.endsWith("FileId")) && typeof entry === "string") {
      if (!found.includes(entry)) found.push(entry);
    } else if ((key === "fileIds" || key.endsWith("FileIds")) && Array.isArray(entry)) {
      for (const id of entry) {
        if (typeof id === "string" && !found.includes(id)) found.push(id);
      }
    } else {
      fileIdsIn(entry, found);
    }
  }
  return found;
}

/** The snapshot's file records for the ids a group names. */
export function groupFiles(issue: Issue, group: IssueEvidenceGroup | null): IssueEvidenceFile[] {
  if (!group) return [];
  const files = issue.evidenceSnapshot?.files ?? [];
  return fileIdsIn(group.data).map(
    (fileId) => files.find((file) => file.fileId === fileId) ?? { fileId, unavailable: true },
  );
}

/**
 * Files the API gathered that no group names: other production and handover
 * evidence already attached to the order.
 */
export function otherEvidenceFiles(issue: Issue): IssueEvidenceFile[] {
  const named = new Set(
    (issue.evidenceSnapshot?.groups ?? []).flatMap((group) => fileIdsIn(group.data)),
  );
  return (issue.evidenceSnapshot?.files ?? []).filter((file) => !named.has(file.fileId));
}

const PURPOSE_LABEL: Record<string, string> = {
  artwork: "Artwork",
  mockup: "Mockup",
  finished_product_photo: "Finished-work photo",
  production_photo: "Progress photo",
  fulfilment_proof: "Shop proof",
  packing_photo: "Packed photo",
  handoff_signature: "Shop's handover signature",
  delivery_photo: "Delivery photo",
  approval_signature: "Client's approval signature",
  approval_sample_photo: "Approved sample photo",
  refund_evidence: "Client's problem photo",
};

export function evidenceFileLabel(file: IssueEvidenceFile): string {
  if (file.purpose && PURPOSE_LABEL[file.purpose]) return PURPOSE_LABEL[file.purpose];
  return "File";
}

export function evidenceFileIsImage(file: IssueEvidenceFile): boolean {
  return Boolean(file.detectedContentType?.startsWith("image/"));
}

/** The server's pre-flight result in a line, or null when it ran no check. */
export function preflightLine(file: IssueEvidenceFile): string | null {
  const check = file.artworkCheck;
  if (!check) return null;
  if (check.status === "passed") return "Automatic file check: passed";
  if (check.status === "failed") return "Automatic file check: could not be read";
  return null;
}

// ---- Fault and remedy ----

export const FAULT_CHOICES: ReadonlyArray<{ value: FaultParty; label: string }> = [
  { value: "shop", label: "The shop" },
  { value: "rider", label: "The rider" },
  { value: "gridgo", label: "GRIDGO" },
  { value: "client", label: "The client" },
];

/** In the order the written rules ask Operations to consider them. */
export const REMEDY_CHOICES: ReadonlyArray<{ value: FaultRemedy; label: string }> = [
  { value: "reprint", label: "Reprint" },
  { value: "replacement", label: "Replacement" },
  { value: "partial_refund", label: "Partial refund" },
  { value: "full_refund", label: "Full refund" },
  { value: "none", label: "No remedy" },
];

export function faultLabel(fault: string): string {
  return FAULT_CHOICES.find((choice) => choice.value === fault)?.label ?? "Someone else";
}

export function remedyLabel(remedy: string): string {
  return REMEDY_CHOICES.find((choice) => choice.value === remedy)?.label ?? "Another remedy";
}

export function isRefundRemedy(remedy: string): boolean {
  return remedy === "partial_refund" || remedy === "full_refund";
}

/** Remedies a fault allows: client fault is no remedy; every other fault needs one. */
export function remediesFor(fault: FaultParty | ""): FaultRemedy[] {
  if (fault === "client") return ["none"];
  return REMEDY_CHOICES.map((choice) => choice.value).filter((value) => value !== "none");
}

/** Rider or GRIDGO fault: GRIDGO funds the whole remedy. */
export function gridgoFundsAll(fault: FaultParty | ""): boolean {
  return fault === "rider" || fault === "gridgo";
}

/**
 * The written Operations rules from the contract, shown beside the form.
 * Guidance for a person, not a calculation: the API never decides fault.
 */
export const WRITTEN_RULES: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "Who held the goods",
    body: "Read the custody evidence in time order. Whoever held the goods when the damage first appears carries the fault. A client finding it later does not, alone, show who held the goods when it happened. Where evidence is missing, investigate and write down what you found; never assume consent, an inspection or a signature.",
  },
  {
    title: "Shop fault",
    body: "Ask the shop for a reprint at its own cost, otherwise refund. Unreleased payouts stay under the existing claim and refund holds. A 40% start payout already paid is recovered only from the shop's future earned payouts, through the existing net adjustment.",
  },
  {
    title: "Rider fault",
    body: "GRIDGO pays the remedy and the shop is paid in full. Record the incident on the rider's record by hand.",
  },
  {
    title: "GRIDGO fault",
    body: "GRIDGO pays the remedy. Above ₱1,000 of GRIDGO funding, Super Admin approves before anyone carries it out.",
  },
  {
    title: "Client fault",
    body: "A relevant warning the client accepted, or a print that matches the approved spec, can support no refund. Explain the reason and the evidence to the client. A warning with no record of acceptance is not an accepted warning.",
  },
  {
    title: "Order of remedies",
    body: "Consider a reprint or replacement first, then a partial refund, then a full refund, and write why the earlier ones do not fit. When the fault is not the client's, restore an unexpired order voucher through the refund and voucher screens; never refund voucher value as cash. Give the client the outcome within the usual two business days and note any delay.",
  },
  {
    title: "When GRIDGO fronts a shop's share",
    body: "GRIDGO can front a shop-fault gap so the client gets the full agreed refund on time, then recover it only from the shop's future earned payouts: never a negative balance, never money the shop has not earned, never a changed payout plan. Count the advance in GRIDGO's share; above ₱1,000 it needs Super Admin. Recording it here pays nobody.",
  },
];

export type DecisionDraft = {
  fault: FaultParty | "";
  remedy: FaultRemedy | "";
  reason: string;
  alternativesReason: string;
  evidenceIds: string[];
  /** Pesos as typed. */
  cost: string;
  gridgoCost: string;
};

export const EMPTY_DRAFT: DecisionDraft = {
  fault: "",
  remedy: "",
  reason: "",
  alternativesReason: "",
  evidenceIds: [],
  cost: "",
  gridgoCost: "",
};

/** A draft that starts from the current decision, for a revision. */
export function draftFrom(decision: FaultDecision | null | undefined): DecisionDraft {
  if (!decision) return EMPTY_DRAFT;
  const fault = FAULT_CHOICES.some((c) => c.value === decision.fault)
    ? (decision.fault as FaultParty)
    : "";
  const remedy = REMEDY_CHOICES.some((c) => c.value === decision.remedy)
    ? (decision.remedy as FaultRemedy)
    : "";
  return {
    fault,
    remedy,
    reason: decision.reason ?? "",
    alternativesReason: decision.alternativesReason ?? "",
    evidenceIds: decision.evidenceIds ? [...decision.evidenceIds] : [],
    cost: decision.costMinor === undefined ? "" : (decision.costMinor / 100).toFixed(2),
    gridgoCost:
      decision.gridgoCostMinor === undefined ? "" : (decision.gridgoCostMinor / 100).toFixed(2),
  };
}

export type DecisionProblems = Partial<
  Record<"fault" | "remedy" | "reason" | "alternativesReason" | "evidence" | "cost" | "gridgoCost", string>
>;

/** Pesos for the API: client fault is always zero; rider or GRIDGO fault funds it all. */
export function decisionAmounts(draft: DecisionDraft): {
  costMinor: number | null;
  gridgoCostMinor: number | null;
} {
  if (draft.fault === "client") return { costMinor: 0, gridgoCostMinor: 0 };
  const costMinor = pesosToMinor(draft.cost);
  const gridgoCostMinor = gridgoFundsAll(draft.fault) ? costMinor : pesosToMinor(draft.gridgoCost);
  return { costMinor, gridgoCostMinor };
}

/** The API's own checks, so the form names what is missing before sending. */
export function decisionProblems(draft: DecisionDraft): DecisionProblems {
  const problems: DecisionProblems = {};
  if (!draft.fault) problems.fault = "Choose who was at fault.";
  if (!draft.remedy) problems.remedy = "Choose the remedy.";
  else if (draft.fault === "client" && draft.remedy !== "none") {
    problems.remedy = "Client fault has no remedy.";
  } else if (draft.fault && draft.fault !== "client" && draft.remedy === "none") {
    problems.remedy = "Choose a remedy for this fault.";
  }
  const reason = draft.reason.trim();
  if (!reason) problems.reason = "Write the finding. The client reads it.";
  else if (draft.reason.length > DECISION_TEXT_MAX) {
    problems.reason = `Keep it to ${DECISION_TEXT_MAX.toLocaleString("en-PH")} characters.`;
  }
  if (isRefundRemedy(draft.remedy)) {
    if (!draft.alternativesReason.trim()) {
      problems.alternativesReason = "Say why a reprint or replacement does not fit.";
    } else if (draft.alternativesReason.length > DECISION_TEXT_MAX) {
      problems.alternativesReason = `Keep it to ${DECISION_TEXT_MAX.toLocaleString("en-PH")} characters.`;
    }
  }
  if (draft.evidenceIds.length === 0) problems.evidence = "Tick the evidence you relied on.";
  else if (draft.evidenceIds.length > EVIDENCE_CITATIONS_MAX) {
    problems.evidence = `Cite at most ${EVIDENCE_CITATIONS_MAX} items.`;
  }
  if (draft.fault && draft.fault !== "client") {
    const { costMinor, gridgoCostMinor } = decisionAmounts(draft);
    if (costMinor === null) problems.cost = "Enter the remedy's total cost in pesos, or 0.";
    if (!gridgoFundsAll(draft.fault)) {
      if (gridgoCostMinor === null) {
        problems.gridgoCost = "Enter GRIDGO's share in pesos, or 0.";
      } else if (costMinor !== null && gridgoCostMinor > costMinor) {
        problems.gridgoCost = "GRIDGO's share cannot be more than the total cost.";
      }
    }
  }
  return problems;
}

/**
 * Whether saving this as Operations leaves it waiting for Super Admin.
 * Super Admin's own decision is approved as it is recorded.
 */
export function needsSuperAdminApproval(gridgoCostMinor: number | null, superAdmin: boolean): boolean {
  return !superAdmin && gridgoCostMinor !== null && gridgoCostMinor > FAULT_APPROVAL_LIMIT_MINOR;
}

export const APPROVAL_LIMIT_TEXT = formatPhp(FAULT_APPROVAL_LIMIT_MINOR);

export function presentDecisionStatus(decision: FaultDecision): {
  label: string;
  tone: "success" | "warning";
  icon: "circle-check" | "clock";
} {
  return decision.status === "awaiting_approval"
    ? { label: "Waiting for Super Admin", tone: "warning", icon: "clock" }
    : { label: "Approved", tone: "success", icon: "circle-check" };
}

/** The label a citation reads as: a group's title, or the file it names. */
export function citationLabel(issue: Issue, id: string): string {
  const group = ISSUE_EVIDENCE_GROUPS.find((entry) => entry.id === id);
  if (group) return group.title;
  const file = issue.evidenceSnapshot?.files.find((entry) => entry.fileId === id);
  if (file) {
    const name = file.originalFilename ? `: ${file.originalFilename}` : "";
    return `${evidenceFileLabel(file)}${name}`;
  }
  return "A file no longer in the case";
}

/** Newest first, so the current decision leads. */
export function decisionHistory(issue: Issue): FaultDecision[] {
  return [...(issue.faultDecisionHistory ?? [])].reverse();
}

export function issueVersion(issue: Issue): number {
  return issue.version ?? 1;
}

/** Closed cases take no decision, approval or resolve. */
export function issueIsOpen(issue: Issue): boolean {
  return issue.status === "open";
}

const ERROR_COPY: Record<string, string> = {
  invalid_fault_decision: "Choose who was at fault and a remedy that fits it.",
  fault_reason_required: `Write the finding, in ${DECISION_TEXT_MAX.toLocaleString("en-PH")} characters or fewer. For a refund, also say why a reprint or replacement does not fit.`,
  fault_evidence_required:
    "Tick at least one piece of the gathered evidence you relied on (50 at most).",
  fault_client_no_refund: "Client fault has no remedy and no cost. Choose No remedy.",
  invalid_fault_funding:
    "Check the amounts: GRIDGO's share cannot be more than the total, rider or GRIDGO fault means GRIDGO pays it all, and client fault costs nothing.",
  invalid_refund_amount: "Enter the amounts as whole pesos and centavos, 0 or more.",
  fault_super_admin_required: "Only Super Admin can approve this. Ask Super Admin to open the order.",
  forbidden: "Only Operations and Super Admin can record a finding here.",
  issue_stale:
    "Someone changed this problem report while you were working. It has been reloaded: check the latest decision, then try again.",
  issue_closed: "This problem report is already closed. Nothing more can be recorded on it.",
  fault_decision_conflict:
    "The decision you were approving is no longer the one waiting. It has been reloaded: check it, then try again.",
  fault_approval_pending:
    "This finding is waiting for Super Admin to approve GRIDGO's share. It cannot be resolved until then.",
  fault_refund_not_authorized:
    "The recorded finding does not allow a refund. Record a refund remedy first, or have Super Admin approve the pending one.",
  issue_not_found: "This problem report was not found. Refresh the order.",
};

/** Codes after which the case must be re-read before another try. */
export const RELOAD_CODES = new Set(["issue_stale", "fault_decision_conflict", "issue_closed"]);

/** Plain words for this contract's codes; null leaves it to the screen's own copy. */
export function problemReportErrorCopy(err: unknown): string | null {
  return isApiError(err) ? (ERROR_COPY[err.code] ?? null) : null;
}

export function shouldReload(err: unknown): boolean {
  return isApiError(err) && RELOAD_CODES.has(err.code);
}

/** The workspace row's one line, closed. */
export function problemRowSummary(issues: Issue[] | null): string {
  if (issues === null) return "Problem reports could not be loaded. Refresh the order.";
  const open = issues.find(issueIsOpen);
  const latest = open ?? issues[0];
  if (!latest) return "No problem reported.";
  const decision = latest.faultDecision;
  if (!issueIsOpen(latest)) {
    return latest.status === "dismissed" ? "Problem report dismissed." : "Problem report resolved.";
  }
  if (!decision) return "Reported by the client. Needs a finding.";
  if (decision.status === "awaiting_approval") {
    return `${faultLabel(decision.fault)} at fault, ${remedyLabel(decision.remedy).toLowerCase()}. Waiting for Super Admin.`;
  }
  return `${faultLabel(decision.fault)} at fault, ${remedyLabel(decision.remedy).toLowerCase()}. Ready to resolve.`;
}
