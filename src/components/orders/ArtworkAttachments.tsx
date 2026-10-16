/**
 * Every file and design link the client sent, one block per item, in the
 * client's order (`src/lib/artwork-attachments.ts`). The shop's job page and
 * the GRIDGO Team's file check draw the same list.
 *
 * The main file leads its block with a preview, because it is the one printed
 * from first; every other file is a row of its label, name, type and size.
 * Opening a file asks GRIDGO for a fresh signed link and shows it here; the
 * download asks again and saves it under its own name. A link opens at its
 * host and can be copied. Each file loads and fails on its own row.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CircleCheck,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  Link2,
  RotateCw,
  Star,
  TriangleAlert,
} from "lucide-react";

import { CopyLinkButton, PROVIDER_ICONS } from "@/components/orders/design-link-parts";
import { DeletedFilePlate } from "@/components/files/DeletedFile";
import { EarlyDeleteFileButton } from "@/components/files/EarlyDeleteFileDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getFile, getFileDownloadUrl } from "@/lib/api/client";
import type { Order, StoredFile } from "@/lib/api/types";
import {
  attachmentCountLine,
  attachmentGroups,
  attachmentLinkHref,
  attachmentTitle,
  describeAttachmentFile,
  freshOrderLink,
  previewKind,
  type AttachmentEntry,
  type AttachmentFile,
  type AttachmentGroup,
  type AttachmentLink,
} from "@/lib/artwork-attachments";
import { linkDisplayParts, providerName } from "@/lib/design-links";
import { artworkSizeMismatchWarning, detectedPrintSummary } from "@/lib/evidence";
import { fileIsGone } from "@/lib/file-retention";
import { saveFileById } from "@/lib/file-save";
import { cn } from "@/lib/utils";

/**
 * `staff`: the GRIDGO Team (print size and DPI, size check, early delete
 * where the tree grants it). `shop`: the shop's own job.
 */
type Audience = "staff" | "shop";

const LINK_HELP: Record<Audience, string> = {
  staff:
    "A design link that asks for a sign-in or will not open cannot be printed from. Send the order back so the client can share it openly.",
  shop: "If a design link asks you to sign in or will not open, ask the GRIDGO Team.",
};

function entryKey(entry: AttachmentEntry): string {
  return entry.kind === "file" ? `file:${entry.fileId}` : `link:${entry.link.url}`;
}

export function ArtworkAttachments({
  order,
  audience,
  review = false,
}: {
  order: Pick<Order, "id" | "productionItems"> & Partial<Pick<Order, "size">>;
  audience: Audience;
  /** Counts what has been opened, where the file check is made. Not stored. */
  review?: boolean;
}) {
  const groups = useMemo(() => attachmentGroups(order), [order]);
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const id = order.id;
  useEffect(() => setOpened(new Set()), [id]);

  const markOpened = (key: string) =>
    setOpened((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));

  const all = groups.flatMap((group) => group.entries);
  const showItem = (order.productionItems?.length ?? 0) > 1;
  const hasLinks = all.some((entry) => entry.kind === "link");
  const openedCount = all.filter((entry) => opened.has(entryKey(entry))).length;

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="artwork-attachments">
      {review ? (
        <p className="text-body text-text-secondary m-0" role="status">
          Open each file and link before you tick the artwork check.{" "}
          <span className="text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
            {openedCount} of {all.length} opened.
          </span>
        </p>
      ) : null}
      {groups.map((group) => (
        <AttachmentBlock
          key={group.itemId}
          group={group}
          showItem={showItem}
          audience={audience}
          review={review}
          opened={opened}
          onOpened={markOpened}
        />
      ))}
      {hasLinks ? (
        <p className="text-caption text-text-muted m-0 max-w-prose">{LINK_HELP[audience]}</p>
      ) : null}
    </div>
  );
}

function AttachmentBlock({
  group,
  showItem,
  audience,
  review,
  opened,
  onOpened,
}: {
  group: AttachmentGroup;
  showItem: boolean;
  audience: Audience;
  review: boolean;
  opened: Set<string>;
  onOpened: (key: string) => void;
}) {
  // Naming a main file is only news when there is another file to tell it from.
  const markMain = group.entries.filter((entry) => entry.kind === "file").length > 1;
  const headingId = `attachments-${group.itemId}`;
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-labelledby={showItem ? headingId : undefined}>
      {showItem ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3
            id={headingId}
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {group.itemName}
          </h3>
          <span className="text-caption text-text-muted">
            {attachmentCountLine(group.entries)}
          </span>
        </div>
      ) : null}
      <ul
        className="m-0 flex list-none flex-col overflow-hidden rounded-card border border-outline bg-surface p-0"
        aria-label={showItem ? `Artwork for ${group.itemName}` : "Artwork files and links"}
      >
        {group.entries.map((entry, index) => {
          const key = entryKey(entry);
          return (
            <li
              key={key}
              className={cn("@container min-w-0", index > 0 && "border-t border-outline-subtle")}
            >
              {entry.kind === "file" ? (
                <AttachmentFileRow
                  entry={entry}
                  group={group}
                  markMain={markMain}
                  audience={audience}
                  review={review}
                  opened={opened.has(key)}
                  onOpened={() => onOpened(key)}
                />
              ) : (
                <AttachmentLinkRow
                  entry={entry}
                  review={review}
                  opened={opened.has(key)}
                  onOpened={() => onOpened(key)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function OpenedMark() {
  return (
    <span className="text-caption text-text-secondary flex shrink-0 items-center gap-1">
      <CircleCheck size={14} aria-hidden />
      Opened
    </span>
  );
}

/** The first file on the line: the one GRIDGO counts pages from. */
function MainFileMark() {
  return (
    <span
      className="text-caption text-text-primary inline-flex shrink-0 items-center gap-1 rounded-pill border border-outline px-2"
      style={{ fontFamily: "var(--font-medium)" }}
      data-testid="main-file-mark"
    >
      <Star size={12} fill="currentColor" strokeWidth={2} aria-hidden />
      Main file
    </span>
  );
}

type FileLoad =
  | { kind: "loading" }
  | { kind: "ready"; file: StoredFile }
  | { kind: "error" }
  | { kind: "gone" };

function AttachmentFileRow({
  entry,
  group,
  markMain,
  audience,
  review,
  opened,
  onOpened,
}: {
  entry: AttachmentFile;
  group: AttachmentGroup;
  markMain: boolean;
  audience: Audience;
  review: boolean;
  opened: boolean;
  onOpened: () => void;
}) {
  const { fileId, label, main } = entry;
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<FileLoad>({ kind: "loading" });
  const [viewing, setViewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    let current = true;
    setLoad({ kind: "loading" });
    getFile(fileId).then(
      (file) => {
        if (current) setLoad({ kind: "ready", file });
      },
      (err) => {
        // A deleted file answers 404: say it is gone, never "retry".
        if (current) setLoad({ kind: fileIsGone(err) ? "gone" : "error" });
      },
    );
    return () => {
      current = false;
    };
  }, [fileId, attempt]);

  const file = load.kind === "ready" ? load.file : null;
  const kind = file ? previewKind(file) : "none";
  const title = attachmentTitle(entry, file);
  const name = file?.originalFilename ?? null;
  const spoken = [label, name].filter(Boolean).join(", ") || title;
  const isMain = main && markMain;

  if (load.kind === "gone") {
    return (
      <div className="p-3">
        <DeletedFilePlate fileId={fileId} label={label ?? (main ? "Main file" : "Artwork")} />
      </div>
    );
  }

  async function onDownload() {
    if (!file) return;
    setSaveFailed(false);
    setSaving(true);
    onOpened();
    try {
      await saveFileById(fileId, file.originalFilename);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  const print = audience === "staff" && file ? detectedPrintSummary(file.detected) : null;

  return (
    <div className="flex min-w-0 flex-col" data-testid={`attachment-${fileId}`}>
      {main && (load.kind === "loading" || kind === "image") ? (
        <MainPreview
          entry={entry}
          ready={kind === "image"}
          title={title}
          name={name}
          onOpen={() => {
            setViewing(true);
            onOpened();
          }}
        />
      ) : null}
      <div className="flex min-w-0 items-center gap-1 p-1">
        <button
          type="button"
          disabled={!file}
          onClick={() => {
            setViewing(true);
            onOpened();
          }}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-field px-1.5 py-1.5 text-left hover:bg-overlay-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-default disabled:hover:bg-transparent"
          aria-label={`Open ${spoken}${isMain ? ", main file" : ""}`}
        >
          <span
            className="bg-surface-variant text-text-secondary flex size-10 shrink-0 items-center justify-center rounded-field"
            aria-hidden
          >
            {kind === "image" ? (
              <FileImage size={18} strokeWidth={1.75} />
            ) : (
              <FileText size={18} strokeWidth={1.75} />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className="text-body text-text-primary min-w-0 break-words"
                style={{ fontFamily: "var(--font-medium)" }}
              >
                {load.kind === "error" ? (label ?? "File") : title}
              </span>
              {isMain ? <MainFileMark /> : null}
            </span>
            {label && name ? (
              <span className="text-caption text-text-secondary truncate">{name}</span>
            ) : null}
            {file ? (
              <span className="text-caption text-text-muted">
                {[describeAttachmentFile(file), print].filter(Boolean).join(" · ")}
              </span>
            ) : load.kind === "loading" ? (
              <span className="h-3 w-24 animate-pulse rounded bg-surface-variant" aria-hidden />
            ) : null}
          </span>
          {review && opened ? <OpenedMark /> : null}
        </button>
        {file ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            disabled={saving}
            onClick={() => void onDownload()}
            aria-label={saving ? `Downloading ${spoken}` : `Download ${spoken}`}
          >
            <Download aria-hidden />
            <span className="hidden @[26rem]:inline" aria-hidden>
              {saving ? "Downloading…" : "Download"}
            </span>
          </Button>
        ) : null}
      </div>
      {load.kind === "error" ? (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
          <p className="text-caption text-error m-0" role="alert">
            This file could not load. Retry, or refresh the page.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setAttempt((value) => value + 1)}
            aria-label={`Retry ${label ?? "file"}`}
          >
            <RotateCw aria-hidden />
            Retry
          </Button>
        </div>
      ) : null}
      {saveFailed ? (
        <p className="text-caption text-error m-0 px-3 pb-3" role="alert">
          Could not download {spoken}. Try again.
        </p>
      ) : null}
      {file && main && audience === "staff" ? <SizeCheck group={group} file={file} /> : null}
      {file ? (
        <FileViewer
          open={viewing}
          onOpenChange={setViewing}
          fileId={fileId}
          file={file}
          title={title}
          isMain={isMain}
          audience={audience}
          saving={saving}
          onDownload={() => void onDownload()}
          onDeleted={() => {
            setViewing(false);
            setLoad({ kind: "gone" });
          }}
        />
      ) : null}
    </div>
  );
}

/** The main file, large enough to see before opening it. */
function MainPreview({
  entry,
  ready,
  title,
  name,
  onOpen,
}: {
  entry: AttachmentFile;
  ready: boolean;
  title: string;
  name: string | null;
  onOpen: () => void;
}) {
  // The order arrived with a signed link: use it, so the preview draws
  // without asking again. Only an expired one is replaced.
  const [url, setUrl] = useState<string | null>(() => freshOrderLink(entry));
  const [failed, setFailed] = useState(false);
  const { fileId } = entry;

  useEffect(() => {
    if (!ready || url) return;
    let current = true;
    getFileDownloadUrl(fileId).then(
      (next) => {
        if (current) setUrl(next);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [fileId, ready, url]);

  return (
    <div className="flex h-44 items-center justify-center border-b border-outline-subtle bg-surface-variant">
      {ready && url && !failed ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex size-full items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground"
          aria-label={`Open main file: ${name ?? title}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`Main file: ${name ?? title}`}
            className="size-full object-contain"
            onError={() => setFailed(true)}
            data-testid="attachment-preview-image"
          />
        </button>
      ) : failed ? (
        <p className="text-body text-text-secondary m-0 flex items-center gap-2 px-4 text-center">
          <FileImage size={20} aria-hidden />
          Preview unavailable. Download the file to see it.
        </p>
      ) : (
        <span className="size-full animate-pulse bg-surface-variant" aria-hidden />
      )}
    </div>
  );
}

/**
 * The print size against what was ordered, for the main file only: a logo or
 * a reference picture beside it is not meant to match the product.
 */
function SizeCheck({ group, file }: { group: AttachmentGroup; file: StoredFile }) {
  const mismatch = artworkSizeMismatchWarning(file.detected, {
    label: group.productSize,
    measurement: group.productMeasurement,
  });
  if (!mismatch) return null;
  return (
    <p className="text-caption text-error m-0 px-3 pb-3" role="status">
      {mismatch}
    </p>
  );
}

/** One file at full size, from a link asked for when it opens. */
function FileViewer({
  open,
  onOpenChange,
  fileId,
  file,
  title,
  isMain,
  audience,
  saving,
  onDownload,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: string;
  file: StoredFile;
  title: string;
  isMain: boolean;
  audience: Audience;
  saving: boolean;
  onDownload: () => void;
  onDeleted: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const kind = previewKind(file);

  useEffect(() => {
    if (!open) return;
    let current = true;
    setUrl(null);
    setFailed(false);
    getFileDownloadUrl(fileId).then(
      (next) => {
        if (current) setUrl(next);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [open, fileId]);

  const print = audience === "staff" ? detectedPrintSummary(file.detected) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[min(960px,calc(100%-2rem))] max-w-none overflow-y-auto sm:max-w-none">
        <DialogHeader>
          <DialogTitle>
            {title}
            {isMain ? <span className="text-text-muted"> · main file</span> : null}
          </DialogTitle>
          <DialogDescription>
            {[title === file.originalFilename ? null : file.originalFilename, describeAttachmentFile(file), print]
              .filter(Boolean)
              .join(" · ")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-card border border-outline-subtle bg-surface-variant">
          {failed ? (
            <p className="text-body text-text-secondary m-0 flex items-center gap-2 p-6 text-center">
              <TriangleAlert size={18} aria-hidden />
              Could not open this file. Close and try again.
            </p>
          ) : !url ? (
            <span className="h-64 w-full animate-pulse" aria-hidden />
          ) : kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={file.originalFilename} className="max-h-[65dvh] w-full object-contain" />
          ) : kind === "pdf" ? (
            <iframe
              title={`Preview ${file.originalFilename}`}
              src={`${url}#toolbar=0&navpanes=0&view=FitH`}
              className="h-[65dvh] w-full"
            />
          ) : (
            <p className="text-body text-text-secondary m-0 flex items-center gap-2 p-6 text-center">
              <FileText size={18} aria-hidden />
              No preview for this type of file. Download it to check it.
            </p>
          )}
        </div>
        <DialogFooter className="flex-wrap items-center gap-2">
          {audience === "staff" ? (
            <EarlyDeleteFileButton
              fileId={fileId}
              file={file}
              label={title}
              previewUrl={kind === "image" ? url : null}
              onDeleted={onDeleted}
            />
          ) : null}
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-body text-text-primary inline-flex min-h-11 items-center gap-1.5 rounded-field px-3 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              <ExternalLink size={16} aria-hidden />
              Open in a new tab
            </a>
          ) : null}
          <Button type="button" variant="secondary" disabled={saving} onClick={onDownload}>
            <Download data-icon="inline-start" aria-hidden />
            {saving ? "Downloading…" : "Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AttachmentLinkRow({
  entry,
  review,
  opened,
  onOpened,
}: {
  entry: AttachmentLink;
  review: boolean;
  opened: boolean;
  onOpened: () => void;
}) {
  const { link, label } = entry;
  const Icon = PROVIDER_ICONS[link.provider] ?? Link2;
  const name = providerName(link.provider);
  const href = attachmentLinkHref(entry);
  const { head, tail } = linkDisplayParts(link.url);

  const body = (
    <>
      <span
        className="bg-surface-variant text-text-secondary flex size-10 shrink-0 items-center justify-center rounded-field"
        aria-hidden
      >
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className="text-body text-text-primary min-w-0 break-words"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          {label ?? `${name} link`}
        </span>
        {/*
          The host (when a label took the title), then the address with its
          end kept: two Canva links differ only in the design id near the end.
        */}
        <span className="text-caption text-text-muted flex min-w-0" title={link.url}>
          {/* A narrow row (the rail) keeps the address; the glyph names the host. */}
          {label ? (
            <span className="hidden shrink-0 @[24rem]:inline">{name} link&nbsp;·&nbsp;</span>
          ) : null}
          <span className="truncate">{head}</span>
          {tail ? <span className="shrink-0">{tail}</span> : null}
        </span>
      </span>
    </>
  );

  return (
    <div className="flex min-w-0 items-center gap-1 p-1" data-testid="attachment-link">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onOpened}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-field px-1.5 py-1.5 hover:bg-overlay-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          {body}
          {review && opened ? <OpenedMark /> : null}
          <ExternalLink size={14} className="text-text-muted shrink-0" aria-hidden />
          <span className="sr-only">(opens {name} in a new tab)</span>
        </a>
      ) : (
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 px-1.5 py-1.5">
          {body}
          <span className="text-caption text-text-muted flex shrink-0 items-center gap-1">
            <TriangleAlert size={14} aria-hidden />
            Not a secure link
          </span>
        </div>
      )}
      <CopyLinkButton url={link.url} name={label ?? name} />
    </div>
  );
}
