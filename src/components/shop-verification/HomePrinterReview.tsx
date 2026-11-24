"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { FileText, IdCard, Printer, ScanFace, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/StatusChip";
import { approveHomeStarter, getFileDownloadUrl, isApiError } from "@/lib/api/client";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  LEVEL_LABEL,
  STARTER_SLOT_LABEL,
  VERIFIED_PAPER_LABEL,
  agreementState,
  checkAge,
  effectiveReason,
  manilaToday,
  pauseLine,
  propertyWord,
  readHomePrinter,
  starterBlockers,
  starterFiles,
  starterRefusal,
  verifiedFiles,
  type HomeDocument,
  type HomePrinterRead,
  type HomePrinterStatus,
  type StarterSlot,
  type VerifiedPaper,
} from "@/lib/home-printers";
import { isImageFile, type VerificationFile } from "@/lib/shop-verification";

/** The level as one chip with the house: what kind of supplier, and how far along. */
export function HomeLevelChip({ status }: { status: HomePrinterStatus }) {
  const tone = status.level === "verified" ? "success" : status.level === "starter" ? "info" : "neutral";
  return <StatusChip tone={tone} icon="house" label={`Home printer · ${LEVEL_LABEL[status.level]}`} />;
}

/** The kind of supplier on a queue row: a house, against a shop's plain row. */
export function HomeKindChip() {
  return <StatusChip tone="neutral" icon="house" label="Home printer" />;
}

/** The queue row's status for a home printer: what an operator needs to know first. */
export function homeRowStatus(read: HomePrinterRead): { tone: "neutral" | "warning" | "success" | "info"; label: string } {
  const s = read.status;
  if (s.level === "verified") return { tone: "success", label: "Verified" };
  if (s.reason === "home_starter_revoked") return { tone: "warning", label: "Starter needs review again" };
  if (s.level === "starter") return { tone: "info", label: "Starter" };
  const files = starterFiles(read);
  const sent = (["valid_id", "id_selfie", "sample_work"] as const).every((slot) => files[slot]);
  if (sent && agreementState(s) === "agreed") return { tone: "info", label: "Ready for Starter review" };
  return { tone: "neutral", label: "Waiting for Starter files" };
}

/** How many of the three Starter files are on file. */
export function starterFileCount(read: HomePrinterRead): number {
  return Object.keys(starterFiles(read)).length;
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="text-body text-text-primary m-0 tabular-nums" style={{ fontFamily: "var(--font-medium)" }}>
        {value}
      </dd>
      {hint ? <dd className="text-caption text-text-secondary m-0">{hint}</dd> : null}
    </div>
  );
}

/**
 * Level, this week's jobs, the pause and where they print. The street,
 * landmark and exact pin stay folded until the reviewer asks for them.
 */
export function HomePrinterFacts({ read }: { read: HomePrinterRead }) {
  const s = read.status;
  const [showAddress, setShowAddress] = useState(false);
  const pause = pauseLine(s, formatDateTime);
  const pin = read.pin;
  const property = propertyWord(pin.propertyType);
  return (
    <div className="border-outline-subtle flex flex-col gap-3 border-t pt-3" data-testid="home-printer-facts">
      <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Fact label="Level" value={LEVEL_LABEL[s.level]} hint={s.level === "verified" ? "No weekly limit" : null} />
        <Fact
          label="Jobs this week"
          value={s.weeklyJobCap ? `${s.weeklyJobs} of ${s.weeklyJobCap}` : String(s.weeklyJobs)}
          hint={s.weeklyJobCap ? "The Starter limit, last 7 days" : "Last 7 days"}
        />
        <Fact
          label="Taking offers"
          value={!s.offersPaused ? "Online" : effectiveReason(s) === "home_offline" ? "Offline" : "Paused"}
          hint={s.offersPaused ? pause : null}
        />
        <Fact
          label="Get Verified by"
          value={s.verified ? "Done" : s.deadlineAt ? formatDate(s.deadlineAt) : "No date on record"}
          hint={s.verified ? null : "New orders stop after this date until Verified"}
        />
      </dl>
      <div className="flex flex-col gap-1">
        <p className="text-caption text-text-muted m-0">Prints from</p>
        <p className="text-body text-text-primary m-0">
          {[pin.barangay ?? "Barangay not on record", property].filter(Boolean).join(" · ")}
        </p>
        {showAddress ? (
          <dl className="m-0 flex flex-col gap-0.5" data-testid="home-private-address">
            <dd className="text-body text-text-primary m-0">{pin.street ?? "No street on record"}</dd>
            {pin.landmark ? <dd className="text-caption text-text-secondary m-0">Landmark: {pin.landmark}</dd> : null}
            {pin.lat != null && pin.lng != null ? (
              <dd className="text-caption text-text-secondary m-0 tabular-nums">
                Pin {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
              </dd>
            ) : null}
          </dl>
        ) : null}
        <div>
          <Button variant="ghost" className="-ml-3" onClick={() => setShowAddress((v) => !v)} aria-expanded={showAddress}>
            {showAddress ? "Hide the private address" : "Show the private address"}
          </Button>
        </div>
        <p className="text-caption text-text-muted m-0">
          Their home. Clients see only the barangay; share the street or pin with no one.
        </p>
      </div>
    </div>
  );
}

/**
 * One evidence file. The signed link is asked for only while the plate is on
 * screen, held in memory, and opened without a referrer.
 */
function EvidencePlate({
  label,
  icon: Icon,
  doc,
  info,
  tall,
  missing = "Not sent yet",
}: {
  label: string;
  icon: LucideIcon;
  doc: HomeDocument | undefined;
  info: VerificationFile | undefined;
  tall?: boolean;
  missing?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const fileId = doc?.fileId ?? null;
  const image = info ? isImageFile(info) : true;

  useEffect(() => {
    if (!fileId) return;
    let live = true;
    setUrl(null);
    setFailed(false);
    getFileDownloadUrl(fileId)
      .then((next) => {
        if (live) setUrl(next);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [fileId]);

  return (
    <figure className="gg-card m-0 flex min-w-0 flex-col gap-2 p-2 md:p-3" data-testid="evidence-plate">
      <div
        className={`bg-surface-variant rounded-field flex items-center justify-center overflow-hidden ${
          tall ? "h-48 md:h-72" : "h-36 md:h-44"
        }`}
      >
        {!doc ? (
          <span className="text-caption text-text-muted flex flex-col items-center gap-1 p-2 text-center">
            <Icon className="size-6" strokeWidth={1.5} aria-hidden />
            {missing}
          </span>
        ) : failed ? (
          <span className="text-caption text-text-secondary p-2 text-center">Could not open this file.</span>
        ) : !url ? (
          <span className="text-caption text-text-muted">Opening…</span>
        ) : image ? (
          // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link, never optimised or cached by Next
          <img src={url} alt={label} referrerPolicy="no-referrer" className="size-full object-contain" />
        ) : (
          <span className="text-caption text-text-muted flex flex-col items-center gap-1">
            <FileText className="size-6" strokeWidth={1.5} aria-hidden />
            PDF
          </span>
        )}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-x-2">
        <span className="flex min-w-0 flex-col">
          <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
            {label}
          </span>
          {doc ? (
            <span className="text-caption text-text-muted">
              {info?.sentAt ? `Sent ${formatDateTime(info.sentAt)}` : "Sent"}
            </span>
          ) : null}
        </span>
        {doc && url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            referrerPolicy="no-referrer"
            className="text-body text-text-primary flex min-h-11 items-center underline"
            aria-label={`Open ${label} full size`}
          >
            Open
          </a>
        ) : null}
      </figcaption>
    </figure>
  );
}

/** Refusals after which the panel loads the current files before another try. */
const STALE_CODES = new Set(["home_starter_documents_required", "shop_profile_stale"]);

const SLOT_ICON: Record<StarterSlot, LucideIcon> = { valid_id: IdCard, id_selfie: ScanFace, sample_work: Printer };

/**
 * The Starter review: ID and ID selfie side by side, the test print, the file
 * agreement, the date of birth read off the ID with its age check, and one
 * Approve as Starter. Operations and Super Admin both decide (the API allows
 * both). Verified stays Super Admin's approval below.
 */
export function StarterReview({
  supplierId,
  name,
  read,
  files,
  minimumAge,
  onApproved,
  onStale,
  today = manilaToday(),
}: {
  supplierId: string;
  name: string;
  read: HomePrinterRead;
  /** The queue's file records, for content type and sent time. */
  files: readonly VerificationFile[];
  minimumAge: number;
  onApproved: (next: HomePrinterRead | null, message: string) => Promise<void> | void;
  /** The files or the record changed under the reviewer: load the current ones. */
  onStale: () => Promise<void> | void;
  today?: string;
}) {
  const ids = useId();
  const [birth, setBirth] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slotFiles = starterFiles(read);
  const info = useMemo(() => new Map(files.map((f) => [f.fileId, f])), [files]);
  const age = checkAge(birth, minimumAge, today);
  const blockers = starterBlockers(read, age, checked);
  const agreement = agreementState(read.status);
  const s = read.status;
  const reviewed = read.starterEvidence;
  const hasStarter = s.level !== "pending";
  const revoked = s.reason === "home_starter_revoked";

  async function approve() {
    if (blockers.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = await approveHomeStarter(supplierId, {
        expectedVersion: read.version,
        dateOfBirth: birth,
        reviewedFileIds: (["valid_id", "id_selfie", "sample_work"] as const)
          .map((slot) => slotFiles[slot]?.fileId)
          .filter((id): id is string => Boolean(id)),
      });
      await onApproved(
        readHomePrinter(body),
        s.weeklyJobCap
          ? `${name} is approved as Starter and can take up to ${s.weeklyJobCap} document jobs a week once online.`
          : `${name} is approved as Starter.`,
      );
    } catch (err) {
      setError(
        (isApiError(err) ? starterRefusal(err.code, minimumAge) : null) ??
          opsErrorMessage(err, "Starter was not saved. Try again."),
      );
      if (isApiError(err) && STALE_CODES.has(err.code)) {
        // What the reviewer ticked no longer matches the files on record.
        setChecked(false);
        await onStale();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={`${ids}-heading`} className="flex flex-col gap-3" data-testid="starter-review">
      <div className="flex flex-col gap-1">
        <h3 id={`${ids}-heading`} className="text-h3 text-text-primary m-0">
          Starter review
        </h3>
        <p className="text-body text-text-secondary m-0 max-w-prose">
          {hasStarter && !revoked
            ? "Approved. These are the files the reviewer checked."
            : "Check that the face on the ID matches the selfie, read the date of birth off the ID, and look at the test print."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 md:gap-3" aria-label="ID and selfie, side by side" role="group">
        {(["valid_id", "id_selfie"] as const).map((slot) => (
          <EvidencePlate
            key={slot}
            label={STARTER_SLOT_LABEL[slot]}
            icon={SLOT_ICON[slot]}
            doc={slotFiles[slot]}
            info={slotFiles[slot] ? info.get(slotFiles[slot].fileId) : undefined}
            tall
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:gap-3">
        <EvidencePlate
          label={STARTER_SLOT_LABEL.sample_work}
          icon={SLOT_ICON.sample_work}
          doc={slotFiles.sample_work}
          info={slotFiles.sample_work ? info.get(slotFiles.sample_work.fileId) : undefined}
        />
        <div className="gg-card flex flex-col justify-center gap-2 p-3" data-testid="file-agreement">
          <span className="flex items-center gap-2">
            <ShieldCheck className="text-text-secondary size-5 shrink-0" strokeWidth={1.5} aria-hidden />
            <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
              File privacy agreement
            </span>
          </span>
          {agreement === "agreed" ? (
            <StatusChip tone="success" icon="circle-check" label="Agreed" />
          ) : agreement === "missing" ? (
            <StatusChip tone="warning" icon="triangle-alert" label="Not agreed yet" />
          ) : (
            <StatusChip tone="neutral" icon="circle-dashed" label="Not reached yet" />
          )}
          <p className="text-caption text-text-secondary m-0">
            {agreement === "unknown"
              ? "They agree to it in the shop app after agreeing to how their pin is shared."
              : "To keep client files private, use them only for the job and delete them after."}
          </p>
        </div>
      </div>

      {hasStarter && !revoked ? (
        <div className="gg-card flex flex-col gap-1 p-4" data-testid="starter-record">
          <span className="flex flex-wrap items-center gap-2">
            <HomeLevelChip status={s} />
          </span>
          {reviewed?.reviewedAt ? (
            <p className="text-body text-text-primary m-0">
              Approved as Starter {formatDateTime(reviewed.reviewedAt)}
              {reviewed.dateOfBirth ? (() => {
                const a = checkAge(reviewed.dateOfBirth, minimumAge, today);
                return a.kind === "adult" || a.kind === "under" ? `. The ID shows age ${a.age}.` : ".";
              })() : "."}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="gg-card flex flex-col gap-3 p-4">
          {revoked ? (
            <p className="text-body text-text-primary m-0" role="status">
              Starter was taken away after repeated late give-backs. Approving again restores it; a 24-hour
              hold still runs out on its own.
            </p>
          ) : null}
          <Field data-invalid={age.kind === "under" || age.kind === "future" || age.kind === "invalid" || undefined}>
            <FieldLabel htmlFor={`${ids}-birth`}>Date of birth on the ID</FieldLabel>
            <Input
              id={`${ids}-birth`}
              type="date"
              value={birth}
              max={today}
              className="max-w-56"
              aria-invalid={age.kind === "under" || age.kind === "future" || age.kind === "invalid" || undefined}
              aria-describedby={`${ids}-age`}
              onChange={(event) => {
                setBirth(event.target.value);
                setError(null);
              }}
            />
            <div id={`${ids}-age`} aria-live="polite" className="flex min-h-7 items-center">
              {age.kind === "adult" ? (
                <StatusChip tone="success" icon="circle-check" label={`Age ${age.age}: ${age.minimum} or older`} />
              ) : age.kind === "under" ? (
                <StatusChip tone="error" icon="circle-x" label={`Age ${age.age}: under ${age.minimum}`} />
              ) : age.kind === "future" || age.kind === "invalid" ? (
                <StatusChip tone="error" icon="circle-x" label="Not a real date of birth" />
              ) : (
                <FieldDescription>Type it exactly as the ID shows it. Starter needs {minimumAge} or older.</FieldDescription>
              )}
            </div>
          </Field>
          <label className="flex min-h-11 items-start gap-3 py-1">
            <Checkbox
              className="mt-1"
              checked={checked}
              disabled={starterFileCount(read) < 3}
              onCheckedChange={(value) => setChecked(value === true)}
              aria-labelledby={`${ids}-check`}
            />
            <span id={`${ids}-check`} className="text-body text-text-primary">
              The face on the ID matches the selfie, and the test print is readable.
            </span>
          </label>
          {blockers.length ? (
            <ul id={`${ids}-blockers`} className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Before you can approve">
              {blockers.map((line) => (
                <li key={line} className="text-caption text-text-secondary">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
          {error ? (
            <p className="text-body text-error m-0" role="alert">
              {error}
            </p>
          ) : null}
          <div>
            <Button
              variant="primary"
              disabled={blockers.length > 0 || busy}
              aria-describedby={blockers.length ? `${ids}-blockers` : undefined}
              onClick={() => void approve()}
            >
              {busy ? "Approving…" : "Approve as Starter"}
            </Button>
          </div>
          <p className="text-caption text-text-muted m-0">
            {s.weeklyJobCap
              ? `Starter lets them take up to ${s.weeklyJobCap} document jobs a week. `
              : ""}
            Your name, the time, the date of birth and these files are recorded.
          </p>
        </div>
      )}
    </section>
  );
}

const VERIFIED_ICON: Record<VerifiedPaper, LucideIcon> = {
  barangay_clearance: FileText,
  business_permit: FileText,
  tin: FileText,
};

/** Verified papers: barangay clearance or business permit (DTI), plus TIN. */
export function HomeVerifiedPapers({ read, files }: { read: HomePrinterRead; files: readonly VerificationFile[] }) {
  const docs = verifiedFiles(read);
  const info = new Map(files.map((f) => [f.fileId, f]));
  const permit: VerifiedPaper = docs.barangay_clearance || !docs.business_permit ? "barangay_clearance" : "business_permit";
  const shown: VerifiedPaper[] = [permit, "tin"];
  return (
    <section aria-labelledby="home-verified-heading" className="flex flex-col gap-2">
      <h3 id="home-verified-heading" className="text-h3 text-text-primary m-0">
        Papers for Verified
      </h3>
      <p className="text-body text-text-secondary m-0 max-w-prose">
        A barangay clearance or a business permit (DTI), plus their TIN. They have until the Get Verified date.
      </p>
      <div className="grid grid-cols-2 gap-2 md:gap-3">
        {shown.map((paper) => (
          <EvidencePlate
            key={paper}
            label={paper === permit && !docs[paper] ? "Barangay clearance or DTI" : VERIFIED_PAPER_LABEL[paper]}
            icon={VERIFIED_ICON[paper]}
            doc={docs[paper]}
            info={docs[paper] ? info.get(docs[paper].fileId) : undefined}
          />
        ))}
      </div>
    </section>
  );
}
