import { formatPhp } from "@/lib/format";

/**
 * Getting verified while already taking jobs (gridgo-api
 * `docs/SUPPLIER_VERIFICATION_API.md`, gridgoph/gridgo-api#411, issue report
 * F318781A).
 *
 * A shop that finished sign-up takes online jobs before GRIDGO checks its ID
 * and permit. Until it is verified, payouts stop at a cap and anything over it
 * waits; new orders pause when the window ends, while open jobs still finish.
 *
 * The shop's words are the supplier app's (`gridgo-supplier`
 * `lib/shopVerification.ts`): change both together. Three rules every screen
 * built on this keeps:
 * - The cap and the window are GRIDGO's settings. Nothing here hard-codes an
 *   amount or a number of days; every figure comes from the read.
 * - Money waiting on verification is **waiting**, never lost or "held back".
 * - Unverified is never a bad mark. No shop-facing label says what a shop is
 *   not; the only badge is the positive one, "Verified".
 *
 * An API without these routes answers 404, and then nothing new is drawn:
 * every read normalises to `null`.
 */

export type VerificationState = "not_submitted" | "being_checked" | "verified";

export type ShopVerification = {
  verified: boolean;
  verificationState: VerificationState;
  startedAt: string | null;
  deadlineAt: string | null;
  daysLeft: number;
  /** Null until the last seven days: the shop sees a countdown only then. */
  countdownDays: number | null;
  payoutCapMinor: number;
  paidBeforeVerificationMinor: number;
  remainingCapMinor: number;
  capReached: boolean;
  heldMinor: number;
  recoveryDueMinor: number;
  paidOpenRegularJobs: number;
  newOrdersPaused: boolean;
};

/** The three papers GRIDGO checks. `sample_work` belongs to the older accreditation. */
export type VerificationPaper = "valid_id" | "id_selfie" | "business_permit";

export type VerificationFile = {
  fileId: string;
  paper: VerificationPaper | null;
  /** The older accreditation's photo of work, shown to staff as such. */
  sampleWork: boolean;
  sentAt: string | null;
  contentType: string | null;
  filename: string | null;
};

/** One entry of the append-only verification ledger. */
export type VerificationLedgerEntry = {
  id: string;
  kind: string;
  payoutKey: string | null;
  orderId: string | null;
  amountMinor: number;
  at: string | null;
  reason: string | null;
};

/** One payout waiting on verification, from the ledger. */
export type WaitingPayout = {
  key: string;
  orderId: string | null;
  amountMinor: number;
  /** Why it waits: over the cap, or a third regular job with a paid stage. */
  reason: "cap" | "open_jobs";
};

export type ShopVerificationRead = {
  verification: ShopVerification;
  files: VerificationFile[];
  ledger: VerificationLedgerEntry[];
  waiting: WaitingPayout[];
};

/* --------------------------------------------------------------------------
   Reading
   -------------------------------------------------------------------------- */

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function minor(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

const STATES: readonly VerificationState[] = ["not_submitted", "being_checked", "verified"];

/** The summary, or null when GRIDGO did not send one. */
export function readVerification(value: unknown): ShopVerification | null {
  const row = record(value);
  if (!row || typeof row.verified !== "boolean") return null;
  const verified = row.verified;
  const state = STATES.includes(row.verificationState as VerificationState)
    ? (row.verificationState as VerificationState)
    : verified
      ? "verified"
      : "not_submitted";
  const countdown =
    typeof row.countdownDays === "number" && Number.isFinite(row.countdownDays)
      ? Math.max(0, Math.floor(row.countdownDays))
      : null;
  return {
    verified,
    verificationState: state,
    startedAt: text(row.startedAt),
    deadlineAt: text(row.deadlineAt),
    daysLeft: typeof row.daysLeft === "number" ? Math.max(0, Math.floor(row.daysLeft)) : 0,
    countdownDays: verified ? null : countdown,
    payoutCapMinor: minor(row.payoutCapMinor),
    paidBeforeVerificationMinor: minor(row.paidBeforeVerificationMinor),
    remainingCapMinor: minor(row.remainingCapMinor),
    capReached: !verified && row.capReached === true,
    heldMinor: minor(row.heldMinor),
    recoveryDueMinor: minor(row.recoveryDueMinor),
    paidOpenRegularJobs: minor(row.paidOpenRegularJobs),
    newOrdersPaused: row.newOrdersPaused === true,
  };
}

const PAPERS: readonly VerificationPaper[] = ["valid_id", "id_selfie", "business_permit"];

function documentTypeOf(file: Record<string, unknown>): string | null {
  const direct = text(file.verificationDocumentType) ?? text(file.documentType);
  if (direct) return direct;
  const refs = Array.isArray(file.references) ? file.references : [];
  for (const ref of refs) {
    const type = text(record(ref)?.documentType);
    if (type) return type;
  }
  return null;
}

export function readVerificationFiles(value: unknown): VerificationFile[] {
  return (Array.isArray(value) ? value : [])
    .map(record)
    .filter((file): file is Record<string, unknown> => file != null && typeof file.fileId === "string")
    .map((file) => {
      const type = documentTypeOf(file);
      return {
        fileId: file.fileId as string,
        paper: PAPERS.includes(type as VerificationPaper) ? (type as VerificationPaper) : null,
        sampleWork: type === "sample_work",
        sentAt: text(file.readyAt) ?? text(file.createdAt),
        contentType: text(file.detectedContentType) ?? text(file.declaredContentType),
        filename: text(file.originalFilename),
      };
    });
}

export function readLedger(value: unknown): VerificationLedgerEntry[] {
  if (!Array.isArray(value)) return [];
  const out: VerificationLedgerEntry[] = [];
  value.forEach((raw, index) => {
    const entry = record(raw);
    const kind = entry ? text(entry.kind) : null;
    if (!entry || !kind) return;
    out.push({
      id: text(entry.id) ?? `ledger-${index}`,
      kind,
      payoutKey: text(entry.payoutKey),
      orderId: text(entry.orderId),
      amountMinor: minor(entry.amountMinor),
      at: text(entry.at),
      reason: text(record(entry.data)?.reason),
    });
  });
  return out;
}

/**
 * Payouts whose latest ledger entry is still `held`. The ledger is
 * append-only, so a later `available`, `reserved` or `released` entry under
 * the same key means it has moved on.
 */
export function waitingPayouts(ledger: readonly VerificationLedgerEntry[]): WaitingPayout[] {
  const latest = new Map<string, VerificationLedgerEntry>();
  for (const entry of ledger) {
    if (entry.payoutKey) latest.set(entry.payoutKey, entry);
  }
  const out: WaitingPayout[] = [];
  for (const [key, entry] of latest) {
    if (entry.kind !== "held" || !entry.amountMinor) continue;
    out.push({
      key,
      orderId: entry.orderId,
      amountMinor: entry.amountMinor,
      reason: entry.reason === "verification_open_jobs" ? "open_jobs" : "cap",
    });
  }
  return out;
}

/** `GET /me/supplier-verification` (the Owner's), or null when GRIDGO sent no summary. */
export function readShopVerification(value: unknown): ShopVerificationRead | null {
  const body = record(value);
  const verification = readVerification(body?.verification);
  if (!body || !verification) return null;
  const ledger = readLedger(body.ledger);
  return {
    verification,
    files: readVerificationFiles(body.verificationDocuments),
    ledger,
    waiting: waitingPayouts(ledger),
  };
}

/* --------------------------------------------------------------------------
   The papers and why
   -------------------------------------------------------------------------- */

export type PaperDefinition = {
  paper: VerificationPaper;
  title: string;
  detail: string;
};

export const VERIFICATION_PAPERS: readonly PaperDefinition[] = [
  { paper: "valid_id", title: "Your ID", detail: "Any government ID with your photo" },
  { paper: "id_selfie", title: "Selfie with your ID", detail: "Hold the ID next to your face" },
  { paper: "business_permit", title: "Business permit", detail: "Mayor's permit or DTI · a photo is fine" },
] as const;

/** What a shop gets once verified. Each line is true of the platform today. */
export function verificationBenefits(v: ShopVerification): { title: string; detail: string }[] {
  return [
    { title: "Verified badge", detail: "Clients see it next to your shop name" },
    { title: "Seen first", detail: "Shown before shops nearby without it" },
    {
      title: "No payout limit",
      detail: v.payoutCapMinor
        ? `Until then, payouts stop at ${formatPhp(v.payoutCapMinor)}`
        : "All your pay, with no limit",
    },
    { title: "Orders never pause", detail: "New orders keep coming after your time to verify ends" },
  ];
}

/** Which papers GRIDGO already has, newest first per paper. */
export function papersOnFile(
  files: readonly VerificationFile[],
): Partial<Record<VerificationPaper, VerificationFile>> {
  const out: Partial<Record<VerificationPaper, VerificationFile>> = {};
  for (const file of files) {
    if (!file.paper) continue;
    const current = out[file.paper];
    if (!current || (file.sentAt ?? "") > (current.sentAt ?? "")) out[file.paper] = file;
  }
  return out;
}

/** The papers GRIDGO does not have yet, in the screen's order. */
export function missingPapers(files: readonly VerificationFile[]): VerificationPaper[] {
  const onFile = papersOnFile(files);
  return VERIFICATION_PAPERS.map((d) => d.paper).filter((paper) => !onFile[paper]);
}

/* --------------------------------------------------------------------------
   Words for To do and Money (the shop's)
   -------------------------------------------------------------------------- */

export type VerifyNotice = {
  /** "warning" only when new orders have actually stopped. Never "error". */
  tone: "neutral" | "warning";
  title: string;
  body: string;
  /** The short countdown chip, only in the last seven days. */
  chip: string | null;
  /** The button, when there is still something for the shop to do. */
  action: string | null;
};

export function daysLeftWord(days: number): string {
  return days === 1 ? "1 day left" : `${days} days left`;
}

const PAPER_NOUN: Record<VerificationPaper, string> = {
  valid_id: "your ID",
  id_selfie: "a selfie with your ID",
  business_permit: "your business permit",
};

function paperList(papers: readonly VerificationPaper[]): string {
  const nouns = papers.map((paper) => PAPER_NOUN[paper]);
  return nouns.length <= 1
    ? (nouns[0] ?? "")
    : `${nouns.slice(0, -1).join(", ")} and ${nouns[nouns.length - 1]}`;
}

/**
 * Where the shop is with its papers. GRIDGO says "being checked" as soon as
 * one paper is in, so "all sent" also needs every paper on file; until then
 * the cards keep asking for the rest, by name.
 */
function papersProgress(v: ShopVerification, missing: readonly VerificationPaper[]) {
  const checking = v.verificationState === "being_checked";
  const allSent = checking && missing.length === 0;
  const partly = checking && missing.length > 0;
  return {
    allSent,
    partly,
    rest: paperList(missing),
    action: allSent ? null : partly ? "Finish verifying" : "Get verified",
  };
}

/**
 * The To do card. Null when there is nothing to say: verified shops, and a
 * shop whose papers are all with GRIDGO and that has no limit in its way.
 */
export function todoVerifyNotice(
  v: ShopVerification,
  missing: readonly VerificationPaper[],
): VerifyNotice | null {
  if (v.verified) return null;
  const { allSent, partly, rest, action } = papersProgress(v, missing);

  if (v.recoveryDueMinor > 0) {
    return {
      tone: "warning",
      title: "New orders are paused",
      body: `A job was dropped after part of it was paid. ${formatPhp(v.recoveryDueMinor)} will come out of your next payouts. Your open jobs still finish.`,
      chip: null,
      action,
    };
  }
  if (v.newOrdersPaused) {
    return {
      tone: "warning",
      title: "New orders are paused",
      body: allSent
        ? "GRIDGO is checking your papers. New orders start again once you're verified. Your open jobs still finish."
        : partly
          ? `Your time to get verified has ended. Send ${rest} and new orders start again once you're verified. Your open jobs still finish.`
          : "Your time to get verified has ended. Send your papers and new orders start again once GRIDGO checks them. Your open jobs still finish.",
      chip: null,
      action,
    };
  }
  if (v.capReached) {
    return {
      tone: "neutral",
      title: `Payouts over ${formatPhp(v.payoutCapMinor)} are waiting`,
      body: allSent
        ? "GRIDGO is checking your papers. The rest is paid in full once you're verified. Keep taking jobs."
        : partly
          ? `The rest is paid in full once you're verified. Send ${rest} to finish.`
          : "The rest is paid in full once you're verified. Keep taking jobs.",
      chip: v.countdownDays != null ? daysLeftWord(v.countdownDays) : null,
      action,
    };
  }
  if (allSent) {
    if (v.countdownDays == null) return null;
    return {
      tone: "neutral",
      title: "GRIDGO is checking your papers",
      body: "Keep taking jobs while we check. We'll tell you when you're verified.",
      chip: daysLeftWord(v.countdownDays),
      action: null,
    };
  }
  if (partly) {
    return {
      tone: "neutral",
      title: "Finish getting verified",
      body: `GRIDGO is checking what you sent. Send ${rest} to finish.`,
      chip: v.countdownDays != null ? daysLeftWord(v.countdownDays) : null,
      action,
    };
  }
  if (v.countdownDays != null) {
    return {
      tone: "neutral",
      title: "Get verified to keep getting orders",
      body: "New orders pause when your time is up. Your ID and permit take about a minute.",
      chip: daysLeftWord(v.countdownDays),
      action,
    };
  }
  return {
    tone: "neutral",
    title: "Get verified, get more jobs",
    body: "Verified shops are shown first and have no payout limit.",
    chip: null,
    action,
  };
}

/** The Money banner, drawn for as long as the shop is not verified. */
export function moneyVerifyBanner(
  v: ShopVerification,
  missing: readonly VerificationPaper[],
): VerifyNotice | null {
  if (v.verified) return null;
  const { allSent, partly, rest, action } = papersProgress(v, missing);
  const cap = formatPhp(v.payoutCapMinor);
  const paid = `${formatPhp(v.paidBeforeVerificationMinor)} of ${cap} paid out so far`;
  return {
    tone: "neutral",
    title: v.capReached
      ? `Payouts over ${cap} are waiting`
      : `Get verified to unlock payouts over ${cap}`,
    body: [
      `${paid}.`,
      v.recoveryDueMinor > 0
        ? `${formatPhp(v.recoveryDueMinor)} from a dropped job will come out of your next payouts.`
        : null,
      allSent ? "GRIDGO is checking your papers." : null,
      partly ? `Send ${rest} to finish.` : null,
    ]
      .filter(Boolean)
      .join(" "),
    chip: null,
    action,
  };
}

/** One line under a waiting payout. Never "held back" or "lost". */
export function waitingReasonLine(reason: WaitingPayout["reason"]): string {
  return reason === "open_jobs"
    ? "Waiting until one of your other jobs is delivered"
    : "Waiting for your verification. Paid once you're verified.";
}

/* --------------------------------------------------------------------------
   GRIDGO staff: the verification queue
   -------------------------------------------------------------------------- */

export type ApprovalStatus = "pending" | "approved" | "rejected" | "suspended";

/** One shop on `GET /ops/supplier-verification` (and its detail). */
export type VerificationQueueEntry = {
  supplierId: string;
  approvalCaseId: string;
  approvalStatus: ApprovalStatus;
  shopName: string | null;
  verification: ShopVerification;
  files: VerificationFile[];
  /** Detail only. */
  ledger: VerificationLedgerEntry[] | null;
};

const APPROVAL_STATUSES: readonly ApprovalStatus[] = ["pending", "approved", "rejected", "suspended"];

export function readQueueEntry(value: unknown): VerificationQueueEntry | null {
  const row = record(value);
  const verification = readVerification(row?.verification);
  const supplierId = text(row?.supplierId);
  const approvalCaseId = text(row?.approvalCaseId);
  if (!row || !verification || !supplierId || !approvalCaseId) return null;
  return {
    supplierId,
    approvalCaseId,
    approvalStatus: APPROVAL_STATUSES.includes(row.approvalStatus as ApprovalStatus)
      ? (row.approvalStatus as ApprovalStatus)
      : "pending",
    shopName: text(row.shopName),
    verification,
    files: readVerificationFiles(row.verificationDocuments),
    ledger: Array.isArray(row.ledger) ? readLedger(row.ledger) : null,
  };
}

export type VerificationQueuePage = {
  entries: VerificationQueueEntry[];
  nextCursor: string | null;
};

export function readQueuePage(value: unknown): VerificationQueuePage | null {
  const body = record(value);
  if (!body || !Array.isArray(body.suppliers)) return null;
  return {
    entries: body.suppliers.map(readQueueEntry).filter((e): e is VerificationQueueEntry => e != null),
    nextCursor: text(body.nextCursor),
  };
}

/**
 * Waiting shops in the order someone should look at them: paused shops and
 * those with money to recover first, then the fewest days left, then the shop
 * that has sent the most papers (it is the quickest to decide).
 */
export function queueOrder(a: VerificationQueueEntry, b: VerificationQueueEntry): number {
  const urgent = (e: VerificationQueueEntry) =>
    e.verification.recoveryDueMinor > 0 || e.verification.newOrdersPaused ? 0 : 1;
  return (
    urgent(a) - urgent(b) ||
    a.verification.daysLeft - b.verification.daysLeft ||
    missingPapers(a.files).length - missingPapers(b.files).length ||
    (a.shopName ?? "").localeCompare(b.shopName ?? "")
  );
}

/** Staff words for a paper. */
export const STAFF_PAPER_LABEL: Record<VerificationPaper, string> = {
  valid_id: "Government ID",
  id_selfie: "Selfie with the ID",
  business_permit: "Business permit",
};

/** The window, as staff read it: always the days, not only the last week. */
export function staffDaysLine(v: ShopVerification): string {
  if (v.verified) return "Verified";
  if (!v.deadlineAt) return "No window on record";
  if (v.daysLeft <= 0) return "Window ended";
  return daysLeftWord(v.daysLeft);
}

export type StaffTone = "neutral" | "warning" | "success" | "info";

/** One status for a row: what an operator needs to know first. */
export function staffStatus(entry: VerificationQueueEntry): { tone: StaffTone; label: string } {
  const v = entry.verification;
  if (entry.approvalStatus === "approved" || v.verified) return { tone: "success", label: "Verified" };
  if (entry.approvalStatus === "rejected") return { tone: "neutral", label: "Rejected" };
  if (entry.approvalStatus === "suspended") return { tone: "neutral", label: "Suspended" };
  if (v.recoveryDueMinor > 0) return { tone: "warning", label: "Paused: money to recover" };
  if (v.newOrdersPaused) return { tone: "warning", label: "Paused: window ended" };
  if (v.verificationState === "being_checked") {
    return missingPapers(entry.files).length
      ? { tone: "info", label: "Some papers sent" }
      : { tone: "info", label: "Ready to check" };
  }
  return { tone: "neutral", label: "No papers yet" };
}

/** A ledger entry in staff words. Null for bookkeeping facts staff need not read. */
export function ledgerLine(entry: VerificationLedgerEntry): string | null {
  switch (entry.kind) {
    case "held":
      return entry.reason === "verification_open_jobs"
        ? "Waiting: two regular jobs already have a paid stage open"
        : "Waiting: over the payout cap until verified";
    case "available":
      return "Ready to pay: the wait ended";
    case "reserved":
      return "Set aside for a transfer being prepared";
    case "reservation_cancelled":
      return "Prepared transfer cancelled, nothing sent";
    case "released":
      return "Paid out";
    case "recovery_due":
      return "Owed back: a job was dropped after a stage was paid";
    case "recovered":
      return "Recovered from a payout";
    case "reminder":
      return "Reminder sent to the shop";
    default:
      return null;
  }
}

/** Ledger entries staff read, newest first. */
export function staffLedger(ledger: readonly VerificationLedgerEntry[]): {
  entry: VerificationLedgerEntry;
  line: string;
}[] {
  return ledger
    .map((entry) => ({ entry, line: ledgerLine(entry) }))
    .filter((row): row is { entry: VerificationLedgerEntry; line: string } => row.line != null)
    .reverse();
}

/** Whether a stored file is an image a browser can draw. */
export function isImageFile(file: Pick<VerificationFile, "contentType" | "filename">): boolean {
  if (file.contentType) return /^image\/(jpeg|png|webp|gif)$/.test(file.contentType);
  return /\.(jpe?g|png|webp|gif)$/i.test(file.filename ?? "");
}

/**
 * The verification rows only make sense while the server offers them. A
 * missing route (older API) or a refusal (Staff) is `null`: draw nothing new.
 */
export function verificationUnavailable(status: number | undefined): boolean {
  return status === 403 || status === 404 || status === 405;
}
