"use client";

import { ExternalLink, FileText, ImagePlus, Paperclip, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import {
  admitAttachments,
  AFTER_DECISION_STATUSES,
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_COUNT,
  DECISION_TEXT_MAX,
  decisionTextError,
  formatFileSize,
  isImageAttachment,
  isTrackerStatus,
  trackerErrorMessage,
  trackerStatusMeta,
} from "@/app/admin/_lib/tracker";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusChip, StatusMark } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  getTrackerAttachmentUrl,
  recordTrackerDecision,
  uploadTrackerAttachment,
} from "@/lib/api/client";
import type {
  TrackerAttachment,
  TrackerDecision,
  TrackerItem,
  TrackerStatus,
} from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type PendingFile = {
  localId: string;
  file: File;
  /** Object URL for an image preview; null for a PDF. */
  previewUrl: string | null;
  /** Set once uploaded, so a retry after a failed save does not upload twice. */
  uploadedId?: string;
};

let nextLocalId = 0;

function toPending(file: File): PendingFile {
  nextLocalId += 1;
  const previewUrl =
    isImageAttachment(file.type) && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(file)
      : null;
  return { localId: `pick_${nextLocalId}`, file, previewUrl };
}

function revoke(pending: PendingFile) {
  if (pending.previewUrl && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(pending.previewUrl);
  }
}

/**
 * The captain's answer for one Needs decision item: text (required), up to
 * six images or PDFs, and where the item goes next. Past decisions sit below,
 * with attachment links fetched only when opened (they expire).
 */
export function DecisionPanel({
  item,
  open,
  onOpenChange,
  onSaved,
}: {
  item: TrackerItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (item: TrackerItem) => void;
}) {
  return (
    <Sheet open={open && item !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        {item ? <DecisionPanelBody key={item.key} item={item} onSaved={onSaved} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function DecisionPanelBody({
  item,
  onSaved,
}: {
  item: TrackerItem;
  onSaved: (item: TrackerItem) => void;
}) {
  const status = trackerStatusMeta(item.status);
  const [saved, setSaved] = useState<TrackerStatus | null>(null);
  const pastId = useId();
  const decisions = [...item.decisions].sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));

  return (
    <>
      <SheetHeader className="gap-2 border-b border-border p-4 pr-14">
        <SheetTitle>
          <span className="text-h3 text-text-primary">Decision for {item.ref}</span>
        </SheetTitle>
        <SheetDescription render={<div />}>
          <span className="text-body text-text-primary block">{item.requirement}</span>
        </SheetDescription>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusChip tone={status.tone} icon={status.icon} label={status.label} />
          <span className="text-caption text-text-secondary">
            {[item.module, item.developer, item.category].filter(Boolean).join(" · ")}
          </span>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-caption text-text-secondary inline-flex min-h-11 items-center gap-1 underline underline-offset-4 hover:text-text-primary"
          >
            {item.key}
            <ExternalLink size={12} aria-hidden />
            <span className="sr-only">(opens GitHub in a new tab)</span>
          </a>
        </div>
      </SheetHeader>

      <div className="flex flex-col gap-6 p-4">
        {saved ? (
          <div role="status" className="rounded-[var(--radius-field)] border border-success bg-surface p-3">
            <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
              Decision saved.
            </p>
            <p className="text-caption text-text-secondary m-0 mt-1">
              Firstmate has been told, a comment is on the GitHub issue, and {item.ref} is now{" "}
              {trackerStatusMeta(saved).label}.
            </p>
          </div>
        ) : null}

        {item.status === "needs-decision" ? (
          <DecisionForm
            item={item}
            onSaved={(updated) => {
              setSaved(updated.status);
              onSaved(updated);
            }}
          />
        ) : !saved ? (
          <p className="text-body text-text-secondary m-0">
            A decision can be recorded while the item is Needs decision. It is {status.label} now.
          </p>
        ) : null}

        <section aria-labelledby={pastId} className="flex flex-col gap-3">
          <h3
            id={pastId}
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-bold)" }}
          >
            Past decisions
          </h3>
          {decisions.length ? (
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {decisions.map((decision) => (
                <PastDecision key={decision.id} decision={decision} />
              ))}
            </ol>
          ) : (
            <p className="text-caption text-text-muted m-0">No decision recorded for this item yet.</p>
          )}
        </section>
      </div>
    </>
  );
}

function DecisionForm({
  item,
  onSaved,
}: {
  item: TrackerItem;
  onSaved: (item: TrackerItem) => void;
}) {
  const [text, setText] = useState("");
  const [textError, setTextError] = useState<string | null>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [fileProblems, setFileProblems] = useState<string[]>([]);
  const [after, setAfter] = useState<TrackerStatus>("open");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  const textId = useId();
  const filesHintId = useId();
  const afterId = useId();

  // Previews are object URLs; let them go with the panel.
  useEffect(() => () => filesRef.current.forEach(revoke), []);

  const trimmedLength = text.trim().length;
  const full = files.length >= ATTACHMENT_MAX_COUNT;

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const { accepted, problems } = admitAttachments(files.length, Array.from(list));
    setFileProblems(problems);
    if (accepted.length) setFiles((current) => [...current, ...accepted.map(toPending)]);
  }

  function removeFile(localId: string) {
    setFiles((current) => {
      const gone = current.find((entry) => entry.localId === localId);
      if (gone) revoke(gone);
      return current.filter((entry) => entry.localId !== localId);
    });
    setFileProblems([]);
  }

  async function save() {
    if (saving) return;
    const problem = decisionTextError(text);
    setTextError(problem);
    setError(null);
    if (problem) {
      textRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const ids: string[] = [];
      for (const [index, entry] of files.entries()) {
        if (entry.uploadedId) {
          ids.push(entry.uploadedId);
          continue;
        }
        setProgress(`Uploading file ${index + 1} of ${files.length}…`);
        try {
          const stored = await uploadTrackerAttachment(entry.file);
          entry.uploadedId = stored.fileId;
          ids.push(stored.fileId);
        } catch (err) {
          setError(`${entry.file.name}: ${trackerErrorMessage(err, "upload")}`);
          return;
        }
      }
      setProgress("Saving the decision…");
      const updated = await recordTrackerDecision(item, {
        text: text.trim(),
        attachmentIds: ids,
        status: after,
      });
      files.forEach(revoke);
      setFiles([]);
      setText("");
      toast.add({
        type: "success",
        title: `Decision saved for ${item.ref}.`,
        description: "Firstmate has been told.",
      });
      onSaved(updated);
    } catch (err) {
      setError(trackerErrorMessage(err, "decision"));
    } finally {
      setSaving(false);
      setProgress(null);
    }
  }

  const afterMeta = trackerStatusMeta(after);

  return (
    <form
      noValidate
      aria-label={`Record a decision for ${item.ref}`}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <FieldGroup className="gap-5">
        <Field data-invalid={textError ? true : undefined}>
          <FieldLabel htmlFor={textId}>Your decision</FieldLabel>
          <Textarea
            id={textId}
            ref={textRef}
            value={text}
            rows={6}
            aria-invalid={textError ? true : undefined}
            aria-describedby={`${textId}-hint`}
            onChange={(event) => {
              setText(event.target.value);
              if (textError) setTextError(decisionTextError(event.target.value));
            }}
            placeholder="What should the team build, and anything they must not do"
            className="min-h-32 text-body"
          />
          <div id={`${textId}-hint`} className="flex flex-wrap justify-between gap-2">
            {textError ? (
              <p role="alert" className="text-caption text-error m-0">
                {textError}
              </p>
            ) : (
              <FieldDescription>
                Posted as a comment on the GitHub issue. Files stay in GRIDGO.
              </FieldDescription>
            )}
            <span
              className={cn(
                "text-caption tabular-nums",
                trimmedLength > DECISION_TEXT_MAX ? "text-error" : "text-text-muted",
              )}
            >
              {trimmedLength.toLocaleString("en-PH")} / {DECISION_TEXT_MAX.toLocaleString("en-PH")}
            </span>
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor={`${filesHintId}-input`}>Images or PDF (optional)</FieldLabel>
          <input
            ref={inputRef}
            id={`${filesHintId}-input`}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            aria-describedby={filesHintId}
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <div
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!full && !saving) addFiles(event.dataTransfer.files);
            }}
            className="flex flex-col items-start gap-2 rounded-[var(--radius-field)] border border-dashed border-border p-3"
          >
            <Button
              type="button"
              size="sm"
              disabled={full || saving}
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus aria-hidden />
              Add images or PDF
            </Button>
            <p id={filesHintId} className="text-caption text-text-muted m-0">
              {full
                ? `${ATTACHMENT_MAX_COUNT} of ${ATTACHMENT_MAX_COUNT} files added. Remove one to add another.`
                : `Up to ${ATTACHMENT_MAX_COUNT} files, 10 MB each: PNG, JPEG, WebP or PDF. You can also drop them here.`}
            </p>
          </div>
          {fileProblems.length ? (
            <ul role="alert" className="m-0 flex list-none flex-col gap-1 p-0">
              {fileProblems.map((problem) => (
                <li key={problem} className="text-caption text-error">
                  {problem}
                </li>
              ))}
            </ul>
          ) : null}
          {files.length ? (
            <ul
              aria-label="Files to attach"
              className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3"
            >
              {files.map((entry) => (
                <li
                  key={entry.localId}
                  className="relative flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-field)] border border-border bg-surface"
                >
                  {isImageAttachment(entry.file.type) && entry.previewUrl ? (
                    // Local object URL preview, so next/image has nothing to optimise.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.previewUrl}
                      alt={`Preview of ${entry.file.name}`}
                      className="aspect-[4/3] w-full bg-muted object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted">
                      <FileText size={28} aria-hidden className="text-text-secondary" />
                    </div>
                  )}
                  <div className="flex min-w-0 flex-col px-2 py-1.5 pr-12">
                    <span className="text-caption text-text-primary truncate">{entry.file.name}</span>
                    <span className="text-caption text-text-muted">
                      {isImageAttachment(entry.file.type) ? "Image" : "PDF"},{" "}
                      {formatFileSize(entry.file.size)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={saving}
                    aria-label={`Remove ${entry.file.name}`}
                    onClick={() => removeFile(entry.localId)}
                    className="absolute right-0 bottom-0"
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </Field>

        <Field>
          <FieldLabel htmlFor={afterId}>Then set status to</FieldLabel>
          <Select
            value={after}
            onValueChange={(value) => {
              if (isTrackerStatus(value)) setAfter(value);
            }}
          >
            <SelectTrigger id={afterId} className="min-h-11 w-full bg-card sm:w-64">
              <SelectValue>
                <StatusMark tone={afterMeta.tone} icon={afterMeta.icon} label={afterMeta.label} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {AFTER_DECISION_STATUSES.map((meta) => (
                  <SelectItem key={meta.value} value={meta.value} className="min-h-11">
                    <StatusMark tone={meta.tone} icon={meta.icon} label={meta.label} />
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>{afterMeta.meaning}</FieldDescription>
        </Field>

        {error ? (
          <p role="alert" className="text-body text-error m-0">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : "Save decision"}
          </Button>
          {progress ? (
            <span role="status" className="text-caption text-text-secondary">
              {progress}
            </span>
          ) : null}
        </div>
      </FieldGroup>
    </form>
  );
}

function PastDecision({ decision }: { decision: TrackerDecision }) {
  return (
    <li className="flex flex-col gap-2 border-l-2 border-border pl-3">
      <p className="text-caption text-text-secondary m-0">
        <span className="text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
          {decision.decidedBy.name}
        </span>{" "}
        on <time dateTime={decision.decidedAt}>{formatDateTime(decision.decidedAt)}</time>
      </p>
      <p className="text-body text-text-primary m-0 whitespace-pre-wrap break-words">{decision.text}</p>
      {decision.attachments.length ? (
        <ul
          aria-label="Attachments"
          className="m-0 flex list-none flex-wrap gap-2 p-0"
        >
          {decision.attachments.map((attachment) => (
            <li key={attachment.id}>
              <AttachmentLink decisionId={decision.id} attachment={attachment} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Signed links expire in minutes, so each is fetched on click rather than
 * with the page. A blank tab opens first, inside the click, so a popup
 * blocker does not eat it while the link is fetched.
 */
function AttachmentLink({
  decisionId,
  attachment,
}: {
  decisionId: string;
  attachment: TrackerAttachment;
}) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openAttachment() {
    if (opening) return;
    setOpening(true);
    setError(null);
    const tab = window.open("", "_blank");
    try {
      const url = await getTrackerAttachmentUrl(decisionId, attachment.id);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.location.assign(url);
      }
    } catch (err) {
      tab?.close();
      setError(trackerErrorMessage(err, "attachment"));
    } finally {
      setOpening(false);
    }
  }

  const Icon = isImageAttachment(attachment.contentType) ? Paperclip : FileText;
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        disabled={opening}
        onClick={() => void openAttachment()}
        aria-label={`Open ${attachment.name}`}
        className="max-w-64"
      >
        <Icon aria-hidden />
        <span className="truncate">{attachment.name}</span>
        <span className="text-text-muted shrink-0">{formatFileSize(attachment.size)}</span>
      </Button>
      {error ? (
        <span role="alert" className="text-caption text-error">
          {error}
        </span>
      ) : null}
    </span>
  );
}
