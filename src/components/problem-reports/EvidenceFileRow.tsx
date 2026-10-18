"use client";

/**
 * One gathered evidence file as a row: what it is, the server's pre-flight
 * result, and Open. The file is read only when opened (`GET /files/:fileId`,
 * then a fresh signed link), because the snapshot stores no expiring links and
 * opening artwork is itself an audited read.
 */

import { useState } from "react";
import { ExternalLink, FileText, ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { getFile, getFileDownloadUrl } from "@/lib/api/client";
import type { IssueEvidenceFile } from "@/lib/api/types";
import { fileIsGone } from "@/lib/file-retention";
import { formatDateTime } from "@/lib/format";
import {
  evidenceFileIsImage,
  evidenceFileLabel,
  preflightLine,
} from "@/lib/problem-reports";

type Opened = { url: string; filename: string; image: boolean };

export function EvidenceFileRow({ file }: { file: IssueEvidenceFile }) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const label = evidenceFileLabel(file);
  const filename = file.originalFilename || label;
  const preflight = preflightLine(file);
  const Icon = evidenceFileIsImage(file) ? ImageIcon : FileText;

  async function open() {
    setBusy(true);
    setProblem(null);
    try {
      const stored = await getFile(file.fileId);
      const url = await getFileDownloadUrl(file.fileId);
      setOpened({
        url,
        filename: stored.originalFilename || filename,
        image: Boolean(stored.detectedContentType?.startsWith("image/")),
      });
    } catch (err) {
      setProblem(
        fileIsGone(err)
          ? "This file has been deleted since the report was filed."
          : "This file could not be opened. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <Icon className="size-4 shrink-0 text-text-muted" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body text-text-primary truncate">{label}</span>
        <span className="text-caption text-text-muted break-words">
          {file.unavailable
            ? "Not available: missing, deleted or not kept as evidence"
            : [file.originalFilename, file.createdAt ? formatDateTime(file.createdAt) : null]
                .filter(Boolean)
                .join(" · ")}
        </span>
        {preflight ? (
          <span
            className={
              file.artworkCheck?.status === "failed"
                ? "text-caption text-error"
                : "text-caption text-text-secondary"
            }
          >
            {preflight}
          </span>
        ) : null}
        {problem ? (
          <span className="text-caption text-error" role="alert">
            {problem}
          </span>
        ) : null}
      </span>
      {file.unavailable ? null : (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void open()}
          aria-label={`Open ${label}${file.originalFilename ? `: ${file.originalFilename}` : ""}`}
        >
          {busy ? "Opening…" : "Open"}
        </Button>
      )}
      <Dialog open={opened !== null} onOpenChange={(next) => !next && setOpened(null)}>
        <DialogContent
          className="max-h-[90vh] w-[min(960px,calc(100%-2rem))] max-w-none overflow-auto sm:max-w-none"
          showCloseButton
        >
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription className="break-words">{opened?.filename}</DialogDescription>
          {opened?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={opened.url}
              alt={opened.filename}
              className="mt-2 max-h-[70vh] w-full rounded-md bg-black object-contain"
            />
          ) : opened ? (
            <p className="text-body text-text-secondary m-0 mt-2">
              This file has no preview here.{" "}
              <a
                href={opened.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-text-primary underline underline-offset-2"
              >
                Open it in a new tab
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </li>
  );
}
