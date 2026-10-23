/**
 * Supplier self-service legal and privacy wording.
 * Staff library routes are not this module.
 */

export type LegalVersion = {
  id: string;
  documentId: string;
  version: number;
  title: string;
  text: string;
  pdfUrl?: string | null;
  pdfFileId?: string | null;
  effectiveAt: string;
  placeholder?: boolean;
  penalties?: boolean;
  changeSummary?: string | null;
};

export type LegalPending = {
  blocking: boolean;
  pending: LegalVersion[];
  notices: LegalVersion[];
};

export type PrivacyRequest = {
  id: string;
  kind: string;
  status: string;
  details?: string | null;
  resolution?: string | null;
  requestedAt: string;
  dueAt: string;
  updatedAt?: string | null;
};

const LIBRARY_ORDER = [
  "supplier-agreement",
  "terms-of-service",
  "privacy-notice",
  "acceptable-use",
  "age-policy",
  "cookie-notice",
];

export function libraryOrder<T extends { documentId: string; title: string }>(
  documents: readonly T[],
): T[] {
  const rank = (id: string) => {
    const at = LIBRARY_ORDER.indexOf(id);
    return at === -1 ? LIBRARY_ORDER.length : at;
  };
  return [...documents].sort(
    (a, b) => rank(a.documentId) - rank(b.documentId) || a.title.localeCompare(b.title),
  );
}

export function gateHeading(pending: readonly { version: number }[]): string {
  return pending.some((doc) => doc.version > 1)
    ? "GRIDGO's terms have changed"
    : "Agree to GRIDGO's terms";
}

export function gateBody(pending: readonly { version: number }[]): string {
  return pending.some((doc) => doc.version > 1)
    ? "Read what changed, then agree to keep taking jobs. Your jobs and earnings are safe while you read."
    : "Your shop works with GRIDGO under these. Read them, then agree to open your floor. Your jobs and earnings are safe while you read.";
}

export const PENALTY_CLAUSE =
  "This version includes a clause that lets GRIDGO deduct from a job's pay when production runs late. GRIDGO does not use it during the current pilot: a late finish gets a warning, and agreeing does not change that.";

export function penaltyNote(doc: { penalties?: boolean }): string | null {
  return doc.penalties ? PENALTY_CLAUSE : null;
}

export const LEGAL_VERSION_CHANGED =
  "GRIDGO published a newer version while you were reading. Read it, then agree again.";

/** Reading the documents, privacy requests, and deletion stay open while terms wait. */
export function legalGateAllows(pathname: string): boolean {
  return (
    pathname === "/supplier/legal" ||
    pathname.startsWith("/supplier/legal/") ||
    pathname === "/supplier/privacy" ||
    pathname.startsWith("/supplier/privacy/")
  );
}

export function legalBlocksWork(
  answer: { blocking?: boolean; pending?: unknown[] } | null,
): boolean {
  return Boolean(answer?.blocking && (answer.pending?.length ?? 0) > 0);
}

export const PRIVACY_KINDS = {
  access: {
    title: "See my data",
    detail: "Ask for a copy of the personal data GRIDGO holds about you",
    explain:
      "GRIDGO checks it is you, then sends you a copy of the personal data it holds about you: your account, your shop's details and pin, your jobs, payouts and messages.",
    detailsLabel: "Anything in particular? (optional)",
    detailsRequired: false,
  },
  correction: {
    title: "Correct my data",
    detail: "Tell GRIDGO about something it has wrong",
    explain:
      "Say what is wrong and what it should be. Your shop name, contact person and number you can fix yourself in Shop details; use this for anything else.",
    detailsLabel: "What should GRIDGO correct?",
    detailsRequired: true,
  },
} as const;

export const DELETION_ROW = {
  title: "Delete my account",
  detail: "Ask GRIDGO to delete your shop account and personal data",
};

export const RETENTION_NOTE =
  "Some records stay, because the law requires GRIDGO to keep them: invoices and receipts for the jobs you made, payout records, and the record of what you agreed to. GRIDGO tells you which ones it kept when it finishes your request.";

export function privacyKindTitle(kind: string): string {
  if (kind === "deletion") return DELETION_ROW.title;
  if (kind === "access" || kind === "correction") return PRIVACY_KINDS[kind].title;
  return "Privacy request";
}

export function privacyStatusLabel(status: string): string {
  switch (status) {
    case "in_progress":
      return "In progress";
    case "completed":
      return "Done";
    case "rejected":
      return "Declined";
    default:
      return "Received";
  }
}
