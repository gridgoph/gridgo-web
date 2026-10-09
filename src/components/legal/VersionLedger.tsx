"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import { getFileDownloadUrl } from "@/lib/api/client";
import type { LegalDocument, LegalVersion } from "@/lib/api/types";
import {
  audienceLabel,
  formatManila,
  versionPlace,
  versionStatusChip,
} from "@/lib/legal";
import { cn } from "@/lib/utils";

type Props = {
  doc: LegalDocument;
  now: number;
  selectedId: string | null;
  onSelect: (versionId: string) => void;
};

const PLACE_LABEL = {
  current: "People read this now",
  scheduled: "Scheduled",
  earlier: "Earlier",
} as const;

/**
 * Every published version, newest first. Versions really are a sequence, so
 * each carries its number; the one people read today is marked.
 */
export function VersionLedger({ doc, now, selectedId, onSelect }: Props) {
  if (!doc.versions.length) {
    return (
      <p className="text-body text-text-muted m-0 rounded-card border border-dashed border-outline p-3">
        Nothing published yet. Publish the draft to give people version 1.
      </p>
    );
  }
  const versions = [...doc.versions].sort((a, b) => b.version - a.version);
  return (
    <ol className="m-0 flex list-none flex-col p-0" aria-label="Published versions">
      {versions.map((version, index) => {
        const place = versionPlace(doc, version, now);
        const selected = version.id === selectedId;
        const last = index === versions.length - 1;
        return (
          <li key={version.id} className="relative flex gap-3">
            {/* The spine: one dot per version, filled for the one in force. */}
            <div className="flex w-5 shrink-0 flex-col items-center" aria-hidden>
              <span
                className={cn(
                  "mt-4 size-3 rounded-full border-2",
                  place === "current"
                    ? "border-text-primary bg-text-primary"
                    : place === "scheduled"
                      ? "border-info bg-surface"
                      : "border-outline bg-surface",
                )}
              />
              {!last ? <span className="bg-outline-subtle mt-1 w-px flex-1" /> : null}
            </div>
            <button
              type="button"
              onClick={() => onSelect(version.id)}
              aria-pressed={selected}
              className={cn(
                "mb-2 flex min-h-11 w-full min-w-0 flex-col items-start gap-1.5 rounded-field border px-3 py-2.5 text-left transition-colors motion-reduce:transition-none",
                selected
                  ? "border-text-primary bg-surface"
                  : "border-transparent hover:bg-surface-variant",
              )}
            >
              <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-bold)" }}>
                  Version {version.version}
                </span>
                <StatusChip {...versionStatusChip(version)} />
                {place === "current" ? (
                  <StatusChip tone="success" icon="circle-dot" label={PLACE_LABEL.current} />
                ) : place === "scheduled" ? (
                  <StatusChip tone="info" icon="clock" label={PLACE_LABEL.scheduled} />
                ) : null}
              </span>
              <span className="text-body text-text-secondary">{version.changeSummary}</span>
              <span className="text-caption text-text-muted">
                {place === "scheduled" ? "Takes effect" : "In effect from"}{" "}
                {formatManila(version.effectiveAt)}
                {version.material
                  ? place === "scheduled"
                    ? ". Everyone it applies to will have to accept again."
                    : ". Everyone it applies to had to accept again."
                  : version.placeholder
                    ? "."
                    : ". Notice only, no new acceptance."}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

type ReaderProps = {
  version: LegalVersion;
};

/**
 * One version as people read it: plain text at a reading measure, never HTML,
 * with its PDF one press away.
 */
export function LegalReader({ version }: ReaderProps) {
  const [opening, setOpening] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  async function openPdf() {
    if (!version.pdfFileId) return;
    setOpening(true);
    setPdfError(null);
    // Open the tab inside the press so pop-up blockers allow it.
    const tab = window.open("", "_blank");
    try {
      const url = await getFileDownloadUrl(version.pdfFileId);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else window.location.assign(url);
    } catch {
      tab?.close();
      setPdfError("The PDF did not open. Try again.");
    } finally {
      setOpening(false);
    }
  }

  return (
    <article className="flex flex-col gap-3" aria-label={`${version.title}, version ${version.version}`}>
      <header className="flex flex-col gap-1">
        <h3 className="text-h3 text-text-primary m-0">{version.title}</h3>
        <p className="text-caption text-text-muted m-0">
          Version {version.version} for {audienceLabel(version.audience).toLowerCase()}, published{" "}
          {formatManila(version.publishedAt)}
        </p>
      </header>
      {version.pdfFileId ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" disabled={opening} onClick={() => void openPdf()}>
            <FileText aria-hidden data-icon="inline-start" />
            {opening ? "Opening…" : "Open the PDF"}
          </Button>
          {pdfError ? (
            <span className="text-caption text-error" role="alert">
              {pdfError}
            </span>
          ) : null}
        </div>
      ) : null}
      {version.text ? (
        <div
          className="text-body-lg text-text-primary max-h-[32rem] max-w-[68ch] overflow-y-auto whitespace-pre-wrap break-words rounded-field border border-outline-subtle bg-surface p-4"
          tabIndex={0}
          aria-label="Document text"
        >
          {version.text}
        </div>
      ) : (
        <p className="text-body text-text-muted m-0">This version is the PDF only.</p>
      )}
    </article>
  );
}
