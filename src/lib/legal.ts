/**
 * Legal documents (gridgo-api#202, contract `gridgo-api/docs/LEGAL_API.md`).
 *
 * Pure rules for the Super Admin library: what people see now, what a draft
 * would publish, and whether publishing makes everyone accept again. The
 * server decides; these mirror its checks so the screen can say so first.
 */

import { isApiError } from "@/lib/api/client";
import type {
  LegalAcceptance,
  LegalAudience,
  LegalDocument,
  LegalDraft,
  LegalVersion,
} from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

/** The eight launch slots, in the contract's order. */
export const LAUNCH_SLOT_ORDER = [
  "terms-of-service",
  "privacy-notice",
  "supplier-agreement",
  "rider-agreement",
  "hub-staff-terms",
  "cookie-notice",
  "age-policy",
  "acceptable-use",
] as const;

/** Signed-in people must accept these on first use, even with no material change. */
export const FIRST_USE_AGREEMENTS = new Set<string>([
  "terms-of-service",
  "privacy-notice",
  "supplier-agreement",
  "rider-agreement",
  "hub-staff-terms",
]);

/** The only document that may carry money penalties, and only as real text. */
export const PENALTY_DOCUMENT_ID = "supplier-agreement";

export const LEGAL_LIMITS = {
  title: 200,
  text: 200_000,
  changeSummary: 4_000,
  pdfBytes: 20 * 1024 * 1024,
} as const;

export const DOCUMENT_ID_PATTERN = /^[a-z][a-z0-9-]{2,79}$/;

export const LEGAL_AUDIENCES: readonly LegalAudience[] = [
  "all",
  "client",
  "supplier",
  "rider",
  "staff",
];

const AUDIENCE_LABEL: Record<LegalAudience, string> = {
  all: "Everyone",
  client: "Clients",
  supplier: "Print shops",
  rider: "Riders",
  staff: "Hub staff",
};

/** Who must accept again, in a sentence: "every print shop". */
const AUDIENCE_REACH: Record<LegalAudience, string> = {
  all: "everyone who signs in to GRIDGO (clients, print shops, riders and staff)",
  client: "every client",
  supplier: "every print shop",
  rider: "every rider",
  staff: "every hub staff member",
};

const AUDIENCE_APP: Record<LegalAudience, string> = {
  all: "every GRIDGO app",
  client: "the client app",
  supplier: "the shop app",
  rider: "the rider app",
  staff: "the GRIDGO Admin App",
};

export function audienceLabel(audience: LegalAudience | string): string {
  return AUDIENCE_LABEL[audience as LegalAudience] ?? "Unknown audience";
}

export function audienceReach(audience: LegalAudience): string {
  return AUDIENCE_REACH[audience];
}

export function audienceApp(audience: LegalAudience): string {
  return AUDIENCE_APP[audience];
}

/** Launch slots first in contract order, then added documents by title. */
export function sortLegalDocuments(documents: readonly LegalDocument[]): LegalDocument[] {
  const rank = (doc: LegalDocument) => {
    const index = (LAUNCH_SLOT_ORDER as readonly string[]).indexOf(doc.id);
    return index === -1 ? LAUNCH_SLOT_ORDER.length : index;
  };
  return [...documents].sort(
    (a, b) => rank(a) - rank(b) || a.draft.title.localeCompare(b.draft.title),
  );
}

function at(iso: string): number {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

/** Highest version already in effect: what people read today. */
export function currentVersion(doc: LegalDocument, now: number): LegalVersion | null {
  let best: LegalVersion | null = null;
  for (const version of doc.versions) {
    if (at(version.effectiveAt) > now) continue;
    if (!best || version.version > best.version) best = version;
  }
  return best;
}

/** Published versions whose date has not come yet, soonest first. */
export function scheduledVersions(doc: LegalDocument, now: number): LegalVersion[] {
  return doc.versions
    .filter((version) => at(version.effectiveAt) > now)
    .sort((a, b) => a.version - b.version);
}

/** The newest published version, in effect or not. */
export function latestVersion(doc: LegalDocument): LegalVersion | null {
  let best: LegalVersion | null = null;
  for (const version of doc.versions) if (!best || version.version > best.version) best = version;
  return best;
}

export function hasRealVersion(doc: LegalDocument): boolean {
  return doc.versions.some((version) => !version.placeholder);
}

export type VersionPlace = "current" | "scheduled" | "earlier";

export function versionPlace(
  doc: LegalDocument,
  version: LegalVersion,
  now: number,
): VersionPlace {
  if (at(version.effectiveAt) > now) return "scheduled";
  return currentVersion(doc, now)?.id === version.id ? "current" : "earlier";
}

type Chip = { tone: StatusTone; icon: StatusIconName; label: string };

/** Placeholder or Live, the version status people and apps see. */
export function versionStatusChip(version: Pick<LegalVersion, "placeholder">): Chip {
  return version.placeholder
    ? { tone: "neutral", icon: "circle-dashed", label: "Placeholder" }
    : { tone: "success", icon: "circle-check", label: "Live" };
}

/** Draft fields a publish snapshots. */
const DRAFT_FIELDS: readonly (keyof LegalDraft)[] = [
  "title",
  "audience",
  "text",
  "pdfFileId",
  "placeholder",
  "material",
  "penalties",
  "changeSummary",
  "effectiveAt",
];

function sameField(key: keyof LegalDraft, a: unknown, b: unknown): boolean {
  if (key === "effectiveAt") return at(String(a)) === at(String(b));
  if (key === "text") return String(a ?? "") === String(b ?? "");
  return (a ?? null) === (b ?? null);
}

/** The draft fields that differ between two drafts. */
export function changedDraftFields(
  before: LegalDraft,
  after: LegalDraft,
): Partial<LegalDraft> {
  const out: Partial<LegalDraft> = {};
  for (const key of DRAFT_FIELDS) {
    if (!sameField(key, before[key], after[key])) {
      (out as Record<string, unknown>)[key] = after[key];
    }
  }
  return out;
}

/**
 * Does the saved draft hold anything the newest version does not? A publish
 * snapshots the draft, so right after one they match exactly.
 */
export function draftIsUnpublished(doc: LegalDocument): boolean {
  const latest = latestVersion(doc);
  if (!latest) return true;
  // The version carries the enforced material flag and the draft the editor's
  // choice, so they can differ right after a publish. Leave it out.
  return DRAFT_FIELDS.some(
    (key) => key !== "material" && !sameField(key, doc.draft[key], latest[key]),
  );
}

export type MaterialReason = "first_real" | "audience" | "penalties" | "chosen";

export type Materiality = {
  material: boolean;
  /** Why; `null` for a placeholder or an editorial change. */
  reason: MaterialReason | null;
};

/**
 * What the API will enforce on publish (`legal.js`): placeholders are never
 * material; the first real text, an audience change and a penalties change
 * always are; otherwise the editor's choice stands.
 */
export function publishMateriality(doc: LegalDocument, draft: LegalDraft): Materiality {
  if (draft.placeholder) return { material: false, reason: null };
  const latest = latestVersion(doc);
  if (!hasRealVersion(doc)) return { material: true, reason: "first_real" };
  if (latest && latest.audience !== draft.audience) return { material: true, reason: "audience" };
  if (latest && latest.penalties !== draft.penalties) return { material: true, reason: "penalties" };
  if (draft.material) return { material: true, reason: "chosen" };
  return { material: false, reason: null };
}

export const MATERIAL_REASON_COPY: Record<Exclude<MaterialReason, "chosen">, string> = {
  first_real:
    "This is the first real text of this document, so it is always a material change.",
  audience: "The audience changed, so this is always a material change.",
  penalties:
    "Whether the agreement carries money penalties changed, so this is always a material change.",
};

export type DraftErrors = Partial<Record<keyof LegalDraft | "content", string>>;

/** Checks the API makes on save and publish, in words, before the request. */
export function validateLegalDraft(
  doc: LegalDocument | null,
  draft: LegalDraft,
  { forPublish = false }: { forPublish?: boolean } = {},
): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.title.trim()) errors.title = "Give the document a title.";
  else if (draft.title.length > LEGAL_LIMITS.title)
    errors.title = `Keep the title within ${LEGAL_LIMITS.title} characters.`;
  if (!draft.text.trim() && !draft.pdfFileId)
    errors.content = "Add the text, a PDF, or both.";
  else if (draft.text.length > LEGAL_LIMITS.text)
    errors.content = `The text is over ${LEGAL_LIMITS.text.toLocaleString("en-PH")} characters. Attach it as a PDF instead.`;
  if (!draft.changeSummary.trim())
    errors.changeSummary = "Say what changed. People see this summary with the notice.";
  else if (draft.changeSummary.length > LEGAL_LIMITS.changeSummary)
    errors.changeSummary = `Keep the summary within ${LEGAL_LIMITS.changeSummary.toLocaleString("en-PH")} characters.`;
  if (Number.isNaN(Date.parse(draft.effectiveAt)))
    errors.effectiveAt = "Choose the date and time it takes effect.";
  if (doc?.launchSlot) {
    const launch = latestVersion(doc);
    if (launch && launch.audience !== draft.audience)
      errors.audience = "A launch document's audience is fixed.";
  }
  if (draft.penalties && doc?.id !== PENALTY_DOCUMENT_ID)
    errors.penalties = "Only the Supplier Agreement can carry money penalties.";
  else if (draft.penalties && draft.placeholder)
    errors.penalties = "Money penalties need real text, not a placeholder.";
  if (forPublish && doc) {
    if (draft.placeholder && hasRealVersion(doc))
      errors.placeholder =
        "Real text is already published, so this document cannot go back to a placeholder.";
    const latest = latestVersion(doc);
    if (latest && !errors.effectiveAt && at(draft.effectiveAt) < at(latest.effectiveAt))
      errors.effectiveAt = `It cannot take effect before version ${latest.version} (${formatManila(latest.effectiveAt)}).`;
  }
  return errors;
}

/** "terms-of-service" from "Terms of Service". */
export function documentIdFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return slug;
}

export function documentIdError(id: string, taken: readonly string[]): string | null {
  if (!id) return "Give the document an ID.";
  if (!DOCUMENT_ID_PATTERN.test(id))
    return "Use 3 to 80 lowercase letters, numbers and hyphens, starting with a letter.";
  if (taken.includes(id)) return "Another document already uses this ID.";
  return null;
}

/** A fresh document's first draft: a placeholder that takes effect on publish. */
export function newDocumentDraft(title: string, audience: LegalAudience, now: Date): LegalDraft {
  return {
    title,
    audience,
    text: `Placeholder: ${title}. GRIDGO will publish the reviewed text here. This placeholder is not the final legal document.`,
    pdfFileId: null,
    placeholder: true,
    material: false,
    penalties: false,
    changeSummary: "First draft",
    effectiveAt: now.toISOString(),
  };
}

// ---- Philippine time ----------------------------------------------------
// Effective dates are entered and read in Asia/Manila (UTC+8, no DST), so the
// same moment reads the same for every Super Admin wherever they sit.

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** ISO → `YYYY-MM-DDTHH:mm` for a datetime-local input, in Manila time. */
export function isoToManilaInput(iso: string): string {
  const value = Date.parse(iso);
  if (Number.isNaN(value)) return "";
  return new Date(value + MANILA_OFFSET_MS).toISOString().slice(0, 16);
}

/** `YYYY-MM-DDTHH:mm` read as Manila time → ISO; "" when incomplete. */
export function manilaInputToIso(input: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return "";
  const value = Date.parse(`${input}:00+08:00`);
  return Number.isNaN(value) ? "" : new Date(value).toISOString();
}

export function formatManila(iso: string | null | undefined): string {
  if (!iso) return "—";
  const value = Date.parse(iso);
  if (Number.isNaN(value)) return iso;
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export function formatManilaDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const value = Date.parse(iso);
  if (Number.isNaN(value)) return iso;
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

// ---- Errors --------------------------------------------------------------

const LEGAL_ERROR_COPY: Record<string, string> = {
  legal_document_changed:
    "Someone else saved or published this document since you opened it. The latest version is loaded; check it and try again.",
  document_exists: "Another document already uses this ID. Choose a different one.",
  invalid_document_id:
    "Use 3 to 80 lowercase letters, numbers and hyphens, starting with a letter.",
  invalid_legal_document:
    "Something in the draft is missing or too long. Check the title, text or PDF, and the change summary.",
  launch_audience_immutable: "A launch document's audience is fixed.",
  cannot_restore_placeholder:
    "Real text is already published, so this document cannot go back to a placeholder.",
  effective_date_before_previous:
    "It cannot take effect before the previous version. Choose a later date.",
  invalid_penalty_document:
    "Only a real Supplier Agreement can carry money penalties.",
  legal_pdf_required:
    "The PDF is not ready or is not a PDF. Upload it again, then publish.",
  published_document_retained:
    "Published and launch documents are kept as legal evidence and cannot be deleted.",
  invalid_file_type: "Only PDF files can be attached.",
  file_too_large: "The PDF is over 20 MB. Compress it and try again.",
};

export function legalErrorMessage(err: unknown, fallback: string): string {
  if (isApiError(err)) {
    const copy = LEGAL_ERROR_COPY[err.code];
    if (copy) return copy;
    if (err.kind === "forbidden") return "Only Super Admin can change legal documents.";
    if (err.kind === "unauthorized") return "Your session expired. Sign in again.";
    if (err.kind === "not_found") return "That document no longer exists. Go back to the library.";
    if (err.kind === "server") return "The server could not finish this. Try again in a moment.";
  }
  return fallback;
}

/** A conflict that means the screen is holding a stale document. */
export function legalErrorNeedsReload(err: unknown): boolean {
  return isApiError(err) && (err.code === "legal_document_changed" || err.status === 404);
}

// ---- Acceptance standing --------------------------------------------------

export type Standing = Chip & {
  /** The version they last accepted for the document, if any. */
  acceptedVersion: number | null;
  /** A one-line explanation under the chip. */
  detail: string;
};

/**
 * Where one person stands on one document, the way `GET /me/legal/pending`
 * reasons: only document and sign-up acceptances count (artwork rights are
 * per order), a material version after their last acceptance asks again,
 * and an editorial one is only a notice.
 */
export function acceptanceStanding(
  doc: LegalDocument,
  acceptances: readonly LegalAcceptance[],
  now: number,
): Standing | null {
  const shown = currentVersion(doc, now);
  if (!shown) return null;
  const accepted = acceptances
    .filter((row) => row.document_id === doc.id && row.purpose !== "artwork")
    .map((row) => row.version);
  const last = accepted.length ? Math.max(...accepted) : null;
  if (last === null) {
    return FIRST_USE_AGREEMENTS.has(doc.id)
      ? {
          tone: "warning",
          icon: "clock",
          label: "Not accepted yet",
          acceptedVersion: null,
          detail: "Their app asks them to accept it before they continue.",
        }
      : {
          tone: "neutral",
          icon: "circle-dashed",
          label: "Not asked",
          acceptedVersion: null,
          detail: "Shown as a notice; no acceptance is required.",
        };
  }
  const lastVersion = doc.versions.find((v) => v.version === last);
  if (last >= shown.version) {
    return lastVersion?.placeholder
      ? {
          tone: "neutral",
          icon: "circle-dashed",
          label: `Accepted placeholder, version ${last}`,
          acceptedVersion: last,
          detail: "This does not count as accepting the real text.",
        }
      : {
          tone: "success",
          icon: "circle-check",
          label: `Up to date, version ${last}`,
          acceptedVersion: last,
          detail: "They accepted the version people read now.",
        };
  }
  const missedMaterial = doc.versions.some(
    (v) => v.material && !v.placeholder && v.version > last && v.version <= shown.version && at(v.effectiveAt) <= now,
  );
  return missedMaterial
    ? {
        tone: "warning",
        icon: "triangle-alert",
        label: `Must accept version ${shown.version}`,
        acceptedVersion: last,
        detail: `They accepted version ${last}. Their app stops them until they accept the new one.`,
      }
    : {
        tone: "info",
        icon: "circle-dot",
        label: `Accepted version ${last}`,
        acceptedVersion: last,
        detail: `Version ${shown.version} was an editorial change, shown to them as a notice.`,
      };
}

/** How the acceptance was given, in words. */
export function acceptanceHow(row: Pick<LegalAcceptance, "purpose" | "method">): string {
  if (row.purpose === "enrollment") return "At sign-up, ticked the box";
  if (row.purpose === "artwork") return "Artwork rights, ticked for an order";
  return row.method === "blocking_screen"
    ? "On the accept-to-continue screen"
    : "Ticked the box";
}

/** The sign-up choices recorded with Terms and Privacy; null for other rows. */
export function signupChoices(
  row: Pick<LegalAcceptance, "purpose" | "marketing" | "junior" | "guardian">,
): string | null {
  if (row.purpose !== "enrollment") return null;
  const parts = [row.marketing ? "Wants marketing" : "No marketing"];
  if (row.junior) parts.push(row.guardian ? "Under 18, guardian agreed" : "Under 18");
  else if (row.junior === false) parts.push("18 or over");
  return parts.join(". ");
}
