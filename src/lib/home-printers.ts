/**
 * Home printers on the staff side (gridgoph/gridgo-api#412, issue report
 * 0B10F8DE; contract `gridgo-api/docs/HOME_PRINTERS_API.md`, "Staff and
 * policy").
 *
 * A home printer is a supplier who prints documents from home. Before any job
 * it needs Starter: GRIDGO staff read the date of birth off its ID, compare
 * the ID with the ID selfie, look at the test print, and the printer must have
 * agreed to keep client files private. Verified (no weekly cap) is the
 * ordinary Super Admin approval on top of that.
 *
 * Rules every screen built on this keeps:
 * - Only `GET /ops/home-printers/:supplierId` says a supplier is a home
 *   printer. An API without the route, or a supplier that is not one,
 *   answers 404 and nothing home-printer is drawn: `readHomePrinter` is null.
 * - The exact pin and street are private. They are drawn only from that
 *   read, and only when the reviewer asks to see them.
 * - The minimum age, the weekly cap and the window are GRIDGO settings: every
 *   figure comes from a read. The only fallback is the API's own default age.
 */

export type HomeLevel = "pending" | "starter" | "verified";

/** The API's three Starter evidence slots, in the order a reviewer reads them. */
export type StarterSlot = "valid_id" | "id_selfie" | "sample_work";
export const STARTER_SLOTS: readonly StarterSlot[] = ["valid_id", "id_selfie", "sample_work"];

/** Verified evidence: barangay clearance or a business permit (DTI), plus TIN. */
export type VerifiedPaper = "barangay_clearance" | "business_permit" | "tin";

export type HomePrinterStatus = {
  level: HomeLevel;
  verified: boolean;
  online: boolean;
  offersPaused: boolean;
  /** The API's first reason new offers are paused, or null. */
  reason: string | null;
  deadlineAt: string | null;
  weeklyJobs: number;
  /** Null once Verified: no cap. */
  weeklyJobCap: number | null;
  offlineUntil: string | null;
  allowHomePickup: boolean;
};

export type HomePin = {
  lat: number | null;
  lng: number | null;
  barangay: string | null;
  street: string | null;
  propertyType: "house" | "boarding_house" | null;
  landmark: string | null;
};

export type StarterEvidence = {
  dateOfBirth: string | null;
  fileIds: string[];
  reviewedBy: string | null;
  reviewedAt: string | null;
};

export type HomeDocument = { fileId: string; documentType: string };

export type HomePrinterRead = {
  /** Quoted back as `expectedVersion`. */
  version: number;
  status: HomePrinterStatus;
  pin: HomePin;
  starterEvidence: StarterEvidence | null;
  documents: HomeDocument[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
function coordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const LEVELS: readonly HomeLevel[] = ["pending", "starter", "verified"];

/** The staff read, or null when GRIDGO did not send a home printer. */
export function readHomePrinter(value: unknown): HomePrinterRead | null {
  const body = record(value);
  const h = record(body?.homePrinter);
  if (!body || !h || typeof body.version !== "number") return null;
  const pin = record(body.pin);
  const point = record(pin?.point);
  const evidence = record(body.starterEvidence);
  const property = pin?.propertyType;
  return {
    version: body.version,
    status: {
      level: LEVELS.includes(h.level as HomeLevel) ? (h.level as HomeLevel) : "pending",
      verified: h.verified === true,
      online: h.online === true,
      offersPaused: h.offersPaused === true,
      reason: text(h.reason),
      deadlineAt: text(h.deadlineAt),
      weeklyJobs: count(h.weeklyJobs),
      weeklyJobCap: typeof h.weeklyJobCap === "number" && h.weeklyJobCap > 0 ? h.weeklyJobCap : null,
      offlineUntil: text(h.offlineUntil),
      allowHomePickup: h.allowHomePickup === true,
    },
    pin: {
      lat: coordinate(point?.lat),
      lng: coordinate(point?.lng),
      barangay: text(pin?.barangay),
      street: text(pin?.street),
      propertyType: property === "house" || property === "boarding_house" ? property : null,
      landmark: text(pin?.landmark),
    },
    starterEvidence: evidence
      ? {
          dateOfBirth: text(evidence.dateOfBirth),
          fileIds: Array.isArray(evidence.fileIds)
            ? evidence.fileIds.filter((id): id is string => typeof id === "string")
            : [],
          reviewedBy: text(evidence.reviewedBy),
          reviewedAt: text(evidence.reviewedAt),
        }
      : null,
    documents: (Array.isArray(body.verificationDocuments) ? body.verificationDocuments : [])
      .map(record)
      .filter((d): d is Record<string, unknown> => d != null && typeof d.fileId === "string")
      .map((d) => ({ fileId: d.fileId as string, documentType: text(d.documentType) ?? "" })),
  };
}

/** The current file for each Starter slot (the API's list is current files only). */
export function starterFiles(read: HomePrinterRead): Partial<Record<StarterSlot, HomeDocument>> {
  const out: Partial<Record<StarterSlot, HomeDocument>> = {};
  for (const doc of read.documents) {
    if ((STARTER_SLOTS as readonly string[]).includes(doc.documentType)) {
      // The newest upload wins: a later entry replaces an earlier one.
      out[doc.documentType as StarterSlot] = doc;
    }
  }
  return out;
}

export const STARTER_SLOT_LABEL: Record<StarterSlot, string> = {
  valid_id: "ID",
  id_selfie: "Selfie with the ID",
  sample_work: "Test print",
};

const SLOT_IN_SENTENCE: Record<StarterSlot, string> = {
  valid_id: "the ID",
  id_selfie: "the selfie with the ID",
  sample_work: "the test print",
};

export const VERIFIED_PAPER_LABEL: Record<VerifiedPaper, string> = {
  barangay_clearance: "Barangay clearance",
  business_permit: "Business permit (DTI)",
  tin: "TIN",
};

export function verifiedFiles(read: HomePrinterRead): Partial<Record<VerifiedPaper, HomeDocument>> {
  const out: Partial<Record<VerifiedPaper, HomeDocument>> = {};
  for (const doc of read.documents) {
    if (doc.documentType === "barangay_clearance" || doc.documentType === "business_permit" || doc.documentType === "tin") {
      out[doc.documentType] = doc;
    }
  }
  return out;
}

/**
 * The file-privacy agreement, read from the status. The API reports only the
 * first missing step, and the pin consent comes before the agreement, so an
 * unconsented pin leaves the agreement unknown.
 */
export type AgreementState = "agreed" | "missing" | "unknown";
export function agreementState(status: HomePrinterStatus): AgreementState {
  if (status.reason === "home_pin_consent_required") return "unknown";
  if (status.reason === "home_file_privacy_required") return "missing";
  return "agreed";
}

/**
 * The pause reason as the reviewer should read it. The API checks distance
 * from the pin before the online switch, so a printer that is simply offline
 * (no recent location) reports "away from pin"; read that as offline.
 */
export function effectiveReason(status: HomePrinterStatus): string | null {
  return status.reason === "home_away_from_pin" && !status.online ? "home_offline" : status.reason;
}

/** Plain words for why new offers are paused. */
export function pauseLine(status: HomePrinterStatus, formatWhen: (iso: string) => string): string | null {
  switch (effectiveReason(status)) {
    case null:
      return null;
    case "home_pin_consent_required":
      return "Paused until they agree to how their pin is shared, in the shop app.";
    case "home_file_privacy_required":
      return "Paused until they agree to keep client files private, in the shop app.";
    case "home_starter_review_required":
      return "Paused until GRIDGO approves them as Starter.";
    case "home_starter_revoked":
      return "Starter was taken away after repeated late give-backs. Review them again to restore it.";
    case "home_verification_deadline":
      return "Paused: the time to get Verified ended. Open jobs still finish.";
    case "home_weekly_cap":
      return status.weeklyJobCap
        ? `Paused: ${status.weeklyJobCap} jobs this week, the Starter limit.`
        : "Paused: the Starter weekly limit is reached.";
    case "home_fair_play_hold":
      return status.offlineUntil
        ? `Paused after late give-backs, until ${formatWhen(status.offlineUntil)}.`
        : "Paused after late give-backs.";
    case "home_away_from_pin":
      return "Paused: their phone is more than 300 m from their pin.";
    case "home_offline":
      return "Their online switch is off.";
    default:
      return "New offers are paused.";
  }
}

export const LEVEL_LABEL: Record<HomeLevel, string> = {
  pending: "Waiting for Starter",
  starter: "Starter",
  verified: "Verified",
};

/** Today in Manila as `YYYY-MM-DD`, the calendar the API checks age against. */
export function manilaToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

/** A real calendar date in `YYYY-MM-DD`, or false. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Whole years between a birth date and `today` (both `YYYY-MM-DD`), the API's rule. */
export function ageOn(birth: string, today: string): number | null {
  if (!isCalendarDate(birth) || !isCalendarDate(today)) return null;
  return (
    Number(today.slice(0, 4)) - Number(birth.slice(0, 4)) - (today.slice(5) < birth.slice(5) ? 1 : 0)
  );
}

export type AgeCheck =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "future" }
  | { kind: "under"; age: number; minimum: number }
  | { kind: "adult"; age: number; minimum: number };

export function checkAge(birth: string, minimum: number, today: string = manilaToday()): AgeCheck {
  if (!birth) return { kind: "empty" };
  const age = ageOn(birth, today);
  if (age == null) return { kind: "invalid" };
  if (birth > today) return { kind: "future" };
  return age >= minimum ? { kind: "adult", age, minimum } : { kind: "under", age, minimum };
}

/** The API's default minimum age, used only when settings did not load. */
export const DEFAULT_MINIMUM_AGE = 18;

export function minimumAgeFrom(settings: unknown): number {
  const value = record(record(settings)?.homePrinter)?.minimumAgeYears;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_MINIMUM_AGE;
}

/** What still stops Approve as Starter, in the reviewer's words. Empty when it can be sent. */
export function starterBlockers(
  read: HomePrinterRead,
  age: AgeCheck,
  /** The reviewer ticked that they compared the ID with the selfie and looked at the test print. */
  checked: boolean,
): string[] {
  const files = starterFiles(read);
  const out: string[] = [];
  const missing = STARTER_SLOTS.filter((slot) => !files[slot]).map((slot) => SLOT_IN_SENTENCE[slot]);
  if (missing.length) out.push(`They have not sent ${listWords(missing)} yet.`);
  const agreement = agreementState(read.status);
  if (agreement === "missing") out.push("They have not agreed to keep client files private yet.");
  if (agreement === "unknown") out.push("They have not agreed to how their pin is shared yet.");
  if (age.kind === "empty") out.push("Enter the date of birth from the ID.");
  if (age.kind === "invalid") out.push("The date of birth is not a real date.");
  if (age.kind === "future") out.push("The date of birth is in the future.");
  if (age.kind === "under") out.push(`The ID shows ${age.age}. Starter needs ${age.minimum} or older.`);
  if (!missing.length && !checked) out.push("Tick that you compared the ID with the selfie and looked at the test print.");
  return out;
}

/** `a`, `a and b`, `a, b and c`. */
export function listWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** A refusal from `POST /ops/home-printers/:id/starter` in plain words. */
export function starterRefusal(code: string | undefined, minimum: number): string | null {
  switch (code) {
    case "home_adult_id_required":
      return `GRIDGO did not accept the date of birth: Starter needs an ID showing ${minimum} or older, and a real date.`;
    case "home_starter_documents_required":
      return "The ID, the ID selfie or the test print changed while you were reviewing. The current files are shown now: look at them, then approve again.";
    case "home_file_privacy_required":
      return "They have not agreed to keep client files private. Starter waits until they agree in the shop app.";
    case "shop_profile_stale":
      return "This home printer's record changed while you were reviewing. The latest is shown now: check it, then approve again.";
    case "home_printer_not_found":
      return "This supplier is no longer a home printer. Reload the page.";
    default:
      return null;
  }
}

/** Words for the Verified approval's `supplier_profile_incomplete` `missing` items a home printer adds. */
export const HOME_MISSING_WORDS: Record<string, string> = {
  starter: "Starter approval",
  business_permit_or_barangay_clearance: "a barangay clearance or business permit (DTI)",
  tin: "a TIN record",
};

export function propertyWord(type: HomePin["propertyType"]): string | null {
  return type === "house" ? "House" : type === "boarding_house" ? "Boarding house" : null;
}
