"use client";

/**
 * Review of one organization or business application, inside the existing
 * business-client approval case (gridgoph/gridgo-client#163 and #164).
 *
 * The track decides the checklist. Operations opens each document, marks it
 * "Looks right" or "Send back" (with what to fix), and then decides the whole
 * application: Approve once every document on file looks right, or Send back
 * with a reason the marks write. Marks are not stored on their own; the
 * decision and its reason are. A business case can also ask for the optional
 * Mayor's or Barangay permit, which then blocks approval until it arrives.
 *
 * An organization case that already has a verified officer is a handover: the
 * incoming officer replaces the current one only when approved, and orders
 * placed meanwhile keep the current officer's name.
 */

import { useMemo, useState } from "react";
import { CircleCheck, FileWarning, MailCheck, RotateCcw } from "lucide-react";

import { presentVerification } from "@/app/admin/_lib/present";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Detail } from "@/components/approvals/applicant-identity";
import { EvidencePlate } from "@/components/orders/EvidencePreview";
import { OfficerHistory } from "@/components/organizations/OfficerHistory";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusChip, StatusMark } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { decideApprovalCase, isApiError, requestBusinessPermit } from "@/lib/api/client";
import type { ApprovalCaseDetail } from "@/lib/api/types";
import {
  TRACK_LABEL,
  applicationChecklist,
  applicationPerson,
  applicationTrack,
  documentFileId,
  formatDay,
  governmentIdLabel,
  missingDocuments,
  needsChecklistResubmission,
  reviewProgress,
  sendBackReason,
  type ChecklistItem,
  type DocumentMark,
} from "@/lib/client-applications";
import { formatDateTime } from "@/lib/format";

const medium = { fontFamily: "var(--font-medium)" } as const;

type Mode = "review" | "approve" | "send-back" | "permit";

export function ApplicationReviewSheet({
  detail,
  onOpenChange,
  onDecided,
}: {
  detail: ApprovalCaseDetail | null;
  onOpenChange: (open: boolean) => void;
  /** After a decision lands: the queue reloads and shows this line. */
  onDecided: (message: string) => void;
}) {
  return (
    <Sheet open={detail !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
      >
        {detail ? (
          <ReviewBody
            key={`${detail.approvalCase.id}:${detail.approvalCase.version}`}
            detail={detail}
            onDecided={onDecided}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function applicationTitle(detail: ApprovalCaseDetail): string {
  return (
    detail.application?.businessName ||
    detail.clientProfile?.businessName ||
    detail.applicant?.name ||
    "Business application"
  );
}

/** A pending organization case on an account that already has a verified officer. */
export function isOfficerHandover(detail: ApprovalCaseDetail): boolean {
  return (
    detail.application?.accountType === "organization" &&
    detail.approvalCase.status === "pending" &&
    Boolean(detail.organization?.currentOfficer)
  );
}

function ReviewBody({
  detail,
  onDecided,
}: {
  detail: ApprovalCaseDetail;
  onDecided: (message: string) => void;
}) {
  const application = detail.application;
  const pending = detail.approvalCase.status === "pending";
  const legacy = needsChecklistResubmission(application);
  const track = applicationTrack(application);
  const checklist = useMemo(() => applicationChecklist(application), [application]);
  const missing = missingDocuments(application);
  const person = applicationPerson(application);
  const handover = isOfficerHandover(detail);
  const isOrganization = application?.accountType === "organization";
  const title = applicationTitle(detail);

  const [marks, setMarks] = useState<Record<string, DocumentMark | undefined>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<Mode>("review");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const progress = reviewProgress(application, marks);
  const canApprove =
    pending &&
    !legacy &&
    missing.length === 0 &&
    progress.allChecked &&
    progress.redo === 0;
  const status = presentVerification(detail.approvalCase.status);

  function openSendBack() {
    setError(null);
    setReason(sendBackReason(checklist, marks, notes));
    setMode("send-back");
  }

  async function decide() {
    setBusy(true);
    setError(null);
    const expectedVersion = detail.approvalCase.version;
    try {
      if (mode === "approve") {
        await decideApprovalCase(detail.approvalCase.id, "approve", {
          expectedVersion,
          requestId: crypto.randomUUID(),
          note: reason.trim() || undefined,
        });
        onDecided(
          handover
            ? `${person?.fullName ?? "The new officer"} is now the verified officer of ${title}.`
            : `${title} is now ${isOrganization ? "an organization" : "a business"} client.`,
        );
      } else if (mode === "send-back") {
        if (!reason.trim()) {
          setError("Say what they need to fix. It is the only explanation they receive.");
          setBusy(false);
          return;
        }
        await decideApprovalCase(detail.approvalCase.id, "reject", {
          expectedVersion,
          requestId: crypto.randomUUID(),
          reason: reason.trim(),
        });
        onDecided(`${title} was sent back with your reason.`);
      } else if (mode === "permit") {
        if (!reason.trim()) {
          setError("Say why the permit is needed. The applicant reads this.");
          setBusy(false);
          return;
        }
        await requestBusinessPermit(detail.approvalCase.id, {
          expectedVersion,
          reason: reason.trim(),
        });
        onDecided(
          `${title} was asked for a business permit. Approval waits until it arrives.`,
        );
      }
    } catch (err) {
      setError(reviewErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <SheetHeader className="gap-2 border-b border-border p-4 pr-14">
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription render={<div />}>
          <span className="text-caption text-text-secondary">
            {[
              handover
                ? "Officer handover"
                : track
                  ? TRACK_LABEL[track]
                  : isOrganization
                    ? "Organization"
                    : "Business",
              detail.applicant?.name,
              detail.approvalCase.applicationRevision > 1
                ? `revision ${detail.approvalCase.applicationRevision}`
                : null,
            ]
              .filter(Boolean)
              .join(", ")}
          </span>
        </SheetDescription>
        <div>
          <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
        </div>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-5 p-4">
        {legacy ? (
          <Notice
            icon={
              <FileWarning className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
            }
          >
            This application was filed before the document checklist. It cannot be
            approved until they submit it again with every document for their track. Send
            it back to ask them to.
          </Notice>
        ) : null}

        {handover && detail.organization?.currentOfficer ? (
          <Notice
            icon={<RotateCcw className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />}
          >
            {person?.fullName ?? "A new officer"} is taking over from{" "}
            {detail.organization.currentOfficer.fullName}. Until you approve,{" "}
            {detail.organization.currentOfficer.fullName} stays the officer of record and
            orders keep their name. Sending this back keeps them in place.
          </Notice>
        ) : null}

        <section aria-labelledby="review-person" className="flex flex-col gap-3">
          <h3
            id="review-person"
            className="text-body-lg text-text-primary m-0 [font-family:var(--font-bold)]"
          >
            {isOrganization
              ? handover
                ? "Incoming officer"
                : "Officer"
              : "Owner or signatory"}
          </h3>
          {person ? (
            <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Detail label="Full name" value={person.fullName} />
              {person.dateOfBirth ? (
                <Detail label="Date of birth" value={formatDay(person.dateOfBirth)} />
              ) : null}
              {person.phone ? <Detail label="Phone" value={person.phone} /> : null}
              <Detail label="ID presented" value={governmentIdLabel(person)} />
              {person.address ? (
                <div className="sm:col-span-2">
                  <Detail label="Address" value={person.address} />
                </div>
              ) : null}
              {person.studentIdExpiresOn ? (
                <Detail
                  label="Student ID valid until"
                  value={formatDay(person.studentIdExpiresOn)}
                />
              ) : null}
            </dl>
          ) : (
            <p className="text-body text-text-secondary m-0">
              No personal details on this application.
            </p>
          )}
          {person && (person.originalId || person.detailsMatchId) ? (
            <p className="text-caption text-text-muted m-0">
              They declared the ID is the original and these details match it. Check that
              against the ID below.
            </p>
          ) : null}
        </section>

        <section aria-labelledby="review-account" className="flex flex-col gap-3">
          <h3
            id="review-account"
            className="text-body-lg text-text-primary m-0 [font-family:var(--font-bold)]"
          >
            {isOrganization ? "Organization" : "Business"}
          </h3>
          <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Detail label="Name" value={title} />
            {application?.school ? (
              <Detail label="School" value={application.school} />
            ) : null}
            {application?.businessNature ? (
              <Detail label="What they do" value={application.businessNature} />
            ) : null}
            {application?.facultyAdviserContact ? (
              <Detail label="Faculty adviser" value={application.facultyAdviserContact} />
            ) : null}
            {detail.approvalCase.submittedAt ? (
              <Detail
                label="Submitted"
                value={formatDateTime(detail.approvalCase.submittedAt)}
              />
            ) : null}
          </dl>
          {application?.organizationEmail ? (
            <p className="text-body text-text-secondary m-0 flex items-start gap-2">
              <MailCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              <span className="min-w-0 break-words">
                Shared login {application.organizationEmail}
                {application.emailVerifiedAt
                  ? `, verified with a one-time code ${formatDateTime(application.emailVerifiedAt)}`
                  : ""}
              </span>
            </p>
          ) : null}
        </section>

        {!legacy ? (
          <section aria-labelledby="review-documents" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3
                id="review-documents"
                className="text-body-lg text-text-primary m-0 [font-family:var(--font-bold)]"
              >
                Documents
              </h3>
              <p className="text-caption text-text-secondary m-0" aria-live="polite">
                {progress.checked} of {progress.onFile} look right
                {progress.redo ? `, ${progress.redo} to send back` : ""}
              </p>
            </div>
            <ChecklistTally items={checklist} marks={marks} application={detail} />
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {checklist.map((item) => (
                <DocumentRow
                  key={item.key}
                  item={item}
                  fileId={documentFileId(application, item.key)}
                  mark={marks[item.key]}
                  note={notes[item.key] ?? ""}
                  interactive={pending}
                  onMark={(mark) =>
                    setMarks((current) => ({ ...current, [item.key]: mark }))
                  }
                  onNote={(note) =>
                    setNotes((current) => ({ ...current, [item.key]: note }))
                  }
                />
              ))}
            </ul>
            {pending ? (
              <p className="text-caption text-text-muted m-0">
                Your marks write the send-back reason. They are not saved on their own.
              </p>
            ) : null}
          </section>
        ) : null}

        {isOrganization ? (
          <section aria-labelledby="review-officers" className="flex flex-col gap-3">
            <h3
              id="review-officers"
              className="text-body-lg text-text-primary m-0 [font-family:var(--font-bold)]"
            >
              Officer of record
            </h3>
            <OfficerHistory
              history={detail.organization?.officerHistory}
              current={detail.organization?.currentOfficer}
              emptyText="No verified officer yet. Approving this application makes the officer above the first one."
            />
          </section>
        ) : null}
      </div>

      {pending ? (
        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-border bg-popover p-4">
          {mode === "review" ? (
            <>
              <p className="text-caption text-text-secondary m-0">
                {approveHint({ legacy, missing, progress })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  disabled={!canApprove}
                  onClick={() => {
                    setError(null);
                    setReason("");
                    setMode("approve");
                  }}
                >
                  Approve
                </Button>
                <Button variant="secondary" onClick={openSendBack}>
                  Send back
                </Button>
                {!isOrganization && !legacy && !application?.businessPermitRequired ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setError(null);
                      setReason("");
                      setMode("permit");
                    }}
                  >
                    Ask for a business permit
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <FieldGroup>
              <Field data-invalid={error ? true : undefined}>
                <FieldLabel htmlFor="review-reason">
                  {mode === "approve"
                    ? "Note for the record (optional)"
                    : mode === "send-back"
                      ? "What they need to fix"
                      : "Why the permit is needed"}
                </FieldLabel>
                <Textarea
                  id="review-reason"
                  rows={mode === "approve" ? 2 : 4}
                  value={reason}
                  aria-invalid={error ? true : undefined}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={
                    mode === "approve"
                      ? "e.g. ID and enrolment checked against the school list"
                      : mode === "send-back"
                        ? "e.g. The student ID photo is cut off. Upload a photo showing the whole card."
                        : "e.g. The DTI certificate address differs from the bank proof."
                  }
                />
                <FieldDescription>
                  {modeConsequence(mode, {
                    handover,
                    isOrganization,
                    person: person?.fullName,
                  })}
                </FieldDescription>
              </Field>
              {error ? (
                <p className="text-body text-error m-0" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={mode === "send-back" ? "danger" : "primary"}
                  disabled={busy}
                  onClick={() => void decide()}
                >
                  {busy
                    ? "Saving…"
                    : mode === "approve"
                      ? "Approve application"
                      : mode === "send-back"
                        ? "Send back"
                        : "Ask for the permit"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setMode("review");
                    setError(null);
                  }}
                >
                  Back to review
                </Button>
              </div>
            </FieldGroup>
          )}
          {mode === "review" && error ? (
            <p className="text-body text-error m-0" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Notice({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-start gap-2 rounded-field border border-outline px-3 py-3"
      role="note"
    >
      {icon}
      <p className="text-body text-text-primary m-0 min-w-0">{children}</p>
    </div>
  );
}

/**
 * One segment per checklist document, in checklist order: filled when it
 * looks right, struck in the error colour when it goes back, hollow while
 * unread, dashed when nothing is on file. The words beside it say the same.
 */
function ChecklistTally({
  items,
  marks,
  application,
}: {
  items: readonly ChecklistItem[];
  marks: Readonly<Record<string, DocumentMark | undefined>>;
  application: ApprovalCaseDetail;
}) {
  return (
    <div className="flex gap-1" aria-hidden>
      {items.map((item) => {
        const onFile = Boolean(documentFileId(application.application, item.key));
        const mark = marks[item.key];
        const tone = !onFile
          ? item.required
            ? "border border-dashed border-error"
            : "border border-dashed border-outline"
          : mark === "ok"
            ? "bg-success"
            : mark === "redo"
              ? "bg-error"
              : "border border-outline";
        return <span key={item.key} className={`h-2 flex-1 rounded-pill ${tone}`} />;
      })}
    </div>
  );
}

function DocumentRow({
  item,
  fileId,
  mark,
  note,
  interactive,
  onMark,
  onNote,
}: {
  item: ChecklistItem;
  fileId: string | null;
  mark: DocumentMark | undefined;
  note: string;
  interactive: boolean;
  onMark: (mark: DocumentMark | undefined) => void;
  onNote: (note: string) => void;
}) {
  const noteId = `doc-note-${item.key}`;
  return (
    <li
      className={`grid grid-cols-1 gap-3 rounded-card border p-3 sm:grid-cols-[minmax(0,1fr)_12rem] ${
        mark === "ok"
          ? "border-success"
          : mark === "redo"
            ? "border-error"
            : "border-outline-subtle"
      }`}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div>
          <p
            className="text-body text-text-primary m-0 flex flex-wrap items-center gap-x-2"
            style={medium}
          >
            {item.label}
            {mark ? (
              <span className="text-caption">
                <StatusMark
                  tone={mark === "ok" ? "success" : "error"}
                  icon={mark === "ok" ? "circle-check" : "circle-x"}
                  label={mark === "ok" ? "Looks right" : "Going back"}
                />
              </span>
            ) : null}
          </p>
          <p className="text-caption text-text-muted m-0">
            {item.required ? "Required" : "Optional"}
            {item.check ? `. ${item.check}` : ""}
          </p>
        </div>
        {fileId && interactive ? (
          <ToggleGroup
            value={mark ? [mark] : []}
            onValueChange={(values) =>
              onMark((values[0] as DocumentMark | undefined) ?? undefined)
            }
            variant="outline"
            spacing={0}
            aria-label={`${item.label}: your check`}
          >
            <ToggleGroupItem value="ok" className="min-h-11 gap-1.5 px-3">
              <CircleCheck className="size-4" aria-hidden />
              Looks right
            </ToggleGroupItem>
            <ToggleGroupItem value="redo" className="min-h-11 gap-1.5 px-3">
              <RotateCcw className="size-4" aria-hidden />
              Send back
            </ToggleGroupItem>
          </ToggleGroup>
        ) : null}
        {mark === "redo" ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={noteId} className="text-caption text-text-secondary">
              What is wrong with it (the applicant reads this)
            </label>
            <Input
              id={noteId}
              value={note}
              onChange={(event) => onNote(event.target.value)}
              placeholder="e.g. Expired in August"
            />
          </div>
        ) : null}
        {!fileId ? (
          <p
            className={
              item.required
                ? "text-body text-error m-0"
                : "text-body text-text-secondary m-0"
            }
          >
            {item.required
              ? "Not on file. Approval is refused until they upload it."
              : "Not provided."}
          </p>
        ) : null}
      </div>
      {fileId ? <EvidencePlate fileId={fileId} label="Open to check" /> : null}
    </li>
  );
}

function approveHint({
  legacy,
  missing,
  progress,
}: {
  legacy: boolean;
  missing: readonly ChecklistItem[];
  progress: ReturnType<typeof reviewProgress>;
}): string {
  if (legacy) return "Approve opens once they resubmit with the full checklist.";
  if (missing.length)
    return `Approve opens once ${missing.map((item) => item.label).join(", ")} ${missing.length === 1 ? "is" : "are"} on file.`;
  if (progress.redo)
    return "You marked a document to send back. Send the application back with your reason.";
  if (!progress.allChecked)
    return `Open each document and mark it. Approve opens when all ${progress.onFile} look right.`;
  return "Every document looks right.";
}

function modeConsequence(
  mode: Mode,
  {
    handover,
    isOrganization,
    person,
  }: { handover: boolean; isOrganization: boolean; person?: string },
): string {
  if (mode === "approve") {
    if (handover)
      return `${person ?? "The incoming officer"} becomes the officer of record from now. Orders already placed keep the previous officer's name.`;
    return isOrganization
      ? `Converts this client into an organization account with ${person ?? "this officer"} as its verified officer.`
      : "Converts this client into a business account.";
  }
  if (mode === "send-back") {
    return handover
      ? "The current officer stays in place. The applicant reads this reason and can upload again."
      : "They keep ordering as a personal client and can correct the application. This reason is the only explanation they receive.";
  }
  return "Approval waits until a corrected application includes the permit. The applicant reads this reason.";
}

function reviewErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    switch (err.code) {
      case "approval_state_conflict":
      case "approval_case_stale":
        return "This application changed while you were reviewing it. Close this panel; the queue has the latest.";
      case "application_checklist_required":
        return "This application predates the document checklist. Send it back so they can resubmit with every document.";
      case "invalid_application":
        return "A document or ID on this application is no longer valid (for example, an ID has expired). Send it back so they can upload a current one.";
      case "organization_already_exists":
        return "Another organization already uses this name at this school. Send it back and ask them to check the name.";
      case "organization_email_verification_required":
        return "The organization email was not verified with a code on this application. Send it back so they can verify it.";
      case "business_application_required":
        return "A business permit only applies to business applications.";
      case "reason_required":
        return "Write a reason first.";
    }
  }
  return opsErrorMessage(err, "That decision did not go through. Try again.");
}
