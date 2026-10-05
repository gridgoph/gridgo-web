/**
 * Organization and business account applications, as Operations reviews them
 * in the existing business-client approval case (gridgoph/gridgo-client#163;
 * contract gridgo-api docs/ORGANIZATION_ACCOUNTS_API.md).
 *
 * Each track has its own checklist. The API refuses a submission that misses
 * a required document, so a case normally arrives complete; the checklist is
 * still drawn from the track, not from what was sent, so a gap is visible.
 * Approval revalidates every file and ID expiry on the server.
 *
 * Operations marks each document as it opens it. Those marks are a review aid
 * that writes the send-back reason; they are not stored on their own. The
 * decision (approve, or send back with that reason) is what the API records.
 *
 * Pure: no React, no fetch.
 */

import type { ApplicationPerson, BusinessApplication } from "@/lib/api/types";

export type ApplicationTrack =
  "organization" | "sole_proprietor" | "partnership" | "corporation";

export type ChecklistItem = {
  key: string;
  label: string;
  /** What Operations checks on this document. */
  check: string;
  required: boolean;
};

const DOCS: Record<string, { label: string; check: string }> = {
  government_id: {
    label: "Primary government ID",
    check:
      "Original and unexpired PhilID, ePhilID, passport, driver's licence or UMID. Name, birth date and address match the details below.",
  },
  student_id: {
    label: "Student ID",
    check: "Valid for this school year, same name as the government ID.",
  },
  enrollment_document: {
    label: "Enrolment document",
    check: "Current enrolment at the school named on the application.",
  },
  school_recognition_certificate: {
    label: "School recognition certificate",
    check: "The school recognises this organization.",
  },
  payout_bank_proof: {
    label: "Payout bank account proof",
    check: "The account is in the registered business name, not a person's.",
  },
  bir_2303: {
    label: "BIR Certificate of Registration (Form 2303)",
    check: "Registered name matches the application.",
  },
  dti_certificate: {
    label: "DTI business name certificate",
    check: "Business name matches and the certificate is current.",
  },
  sec_certificate: {
    label: "SEC certificate",
    check: "Registered name matches the application.",
  },
  articles_and_bylaws: {
    label: "Articles and by-laws",
    check: "The filed articles and by-laws for this entity.",
  },
  general_information_sheet: {
    label: "General Information Sheet",
    check: "The latest GIS on file with the SEC.",
  },
  signatory_authorization: {
    label: "Board resolution or secretary's certificate",
    check: "Notarised, and names the signatory on this application.",
  },
  business_permit: {
    label: "Mayor's or Barangay business permit",
    check: "Current, in the business name.",
  },
};

const REQUIRED: Record<ApplicationTrack, readonly string[]> = {
  organization: ["government_id", "student_id", "enrollment_document"],
  sole_proprietor: ["government_id", "payout_bank_proof", "bir_2303", "dti_certificate"],
  partnership: [
    "government_id",
    "payout_bank_proof",
    "bir_2303",
    "sec_certificate",
    "articles_and_bylaws",
    "general_information_sheet",
    "signatory_authorization",
  ],
  corporation: [
    "government_id",
    "payout_bank_proof",
    "bir_2303",
    "sec_certificate",
    "articles_and_bylaws",
    "general_information_sheet",
    "signatory_authorization",
  ],
};

export const TRACK_LABEL: Record<ApplicationTrack, string> = {
  organization: "Organization",
  sole_proprietor: "Sole proprietor",
  partnership: "Partnership",
  corporation: "Corporation",
};

export function documentLabel(key: string): string {
  return DOCS[key]?.label ?? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** `null` for a name-only application filed before the checklist existed. */
export function applicationTrack(
  application: BusinessApplication | null | undefined,
): ApplicationTrack | null {
  if (!application) return null;
  if (application.accountType === "organization") return "organization";
  const type = application.businessType;
  return type === "sole_proprietor" || type === "partnership" || type === "corporation"
    ? type
    : null;
}

/** True when the case predates the checklist and must be resubmitted before approval. */
export function needsChecklistResubmission(
  application: BusinessApplication | null | undefined,
): boolean {
  return !application || application.schemaVersion !== 1;
}

/**
 * The checklist for this application's track, required first, then the one
 * optional document (school recognition, or the business permit — required
 * once Operations has asked for it).
 */
export function applicationChecklist(
  application: BusinessApplication | null | undefined,
): ChecklistItem[] {
  const track = applicationTrack(application);
  if (!track || !application) return [];
  const item = (key: string, required: boolean): ChecklistItem => ({
    key,
    label: documentLabel(key),
    check: DOCS[key]?.check ?? "",
    required,
  });
  const items = REQUIRED[track].map((key) => item(key, true));
  if (track === "organization") items.push(item("school_recognition_certificate", false));
  else items.push(item("business_permit", Boolean(application.businessPermitRequired)));
  return items;
}

export function documentFileId(
  application: BusinessApplication | null | undefined,
  key: string,
): string | null {
  const id = application?.documents?.[key];
  return typeof id === "string" && id ? id : null;
}

/** Required documents with no file. Empty for a complete application. */
export function missingDocuments(
  application: BusinessApplication | null | undefined,
): ChecklistItem[] {
  return applicationChecklist(application).filter(
    (item) => item.required && !documentFileId(application, item.key),
  );
}

export function applicationPerson(
  application: BusinessApplication | null | undefined,
): ApplicationPerson | null {
  if (!application) return null;
  return (
    (application.accountType === "organization"
      ? application.officer
      : application.signatory) ?? null
  );
}

const ID_TYPE: Record<string, string> = {
  philid: "PhilID",
  ephilid: "ePhilID",
  passport: "Passport",
  drivers_license: "Driver's licence",
  umid: "UMID",
};

export function governmentIdLabel(person: ApplicationPerson): string {
  const type = person.governmentIdType
    ? (ID_TYPE[person.governmentIdType] ?? "Government ID")
    : "Government ID";
  if (person.governmentIdHasNoExpiry) return `${type}, no expiry`;
  return person.governmentIdExpiresOn
    ? `${type}, valid until ${formatDay(person.governmentIdExpiresOn)}`
    : type;
}

/** `2030-01-01` → `Jan 1, 2030` (as `formatDate`), read as a calendar day with no timezone shift. */
export function formatDay(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export type DocumentMark = "ok" | "redo";

/**
 * The send-back reason the marks write. The applicant reads it, so it names
 * each document in plain words with the reviewer's note, never a key.
 */
export function sendBackReason(
  items: readonly ChecklistItem[],
  marks: Readonly<Record<string, DocumentMark | undefined>>,
  notes: Readonly<Record<string, string | undefined>>,
): string {
  const redo = items.filter((item) => marks[item.key] === "redo");
  if (!redo.length) return "";
  const lines = redo.map((item) => {
    const note = notes[item.key]?.trim();
    return note ? `- ${item.label}: ${note}` : `- ${item.label}`;
  });
  return ["Please upload these again:", ...lines].join("\n");
}

/** Where the review stands: what is marked, and whether approval is honest yet. */
export function reviewProgress(
  application: BusinessApplication | null | undefined,
  marks: Readonly<Record<string, DocumentMark | undefined>>,
): { onFile: number; checked: number; redo: number; allChecked: boolean } {
  const onFile = applicationChecklist(application).filter((item) =>
    documentFileId(application, item.key),
  );
  const checked = onFile.filter((item) => marks[item.key] === "ok").length;
  const redo = onFile.filter((item) => marks[item.key] === "redo").length;
  return {
    onFile: onFile.length,
    checked,
    redo,
    allChecked: checked === onFile.length && onFile.length > 0,
  };
}
