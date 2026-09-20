/**
 * Print-desk plate for an order file. Operations should see the picture, not
 * only the filename. Yellow tick on the dark plate is the GRIDGO signature.
 */

"use client";

import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { getFile, getFileDownloadUrl } from "@/lib/api/client";
import type { StoredFile } from "@/lib/api/types";
import type { EvidenceItem } from "@/lib/evidence";
import { artworkFileFacts, fileLooksLikeImage } from "@/lib/evidence";

type PlateProps = {
  fileId: string | null | undefined;
  label: string;
  caption?: string | null;
  empty?: string;
  /** Print-desk facts under the picture. Artwork plates turn this on. */
  showMetadata?: boolean;
};

type Loaded = {
  file: StoredFile;
  url: string;
};

export function EvidencePlate({
  fileId,
  label,
  caption,
  empty,
  showMetadata = false,
}: PlateProps) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(Boolean(fileId));

  useEffect(() => {
    if (!fileId) {
      setLoaded(null);
      setFailed(false);
      setPending(false);
      return;
    }
    let cancelled = false;
    setPending(true);
    setFailed(false);
    Promise.all([getFile(fileId), getFileDownloadUrl(fileId)])
      .then(([file, url]) => {
        if (cancelled) return;
        setLoaded({ file, url });
        setPending(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded(null);
        setFailed(true);
        setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  if (!fileId) {
    return (
      <div>
        <p className="text-caption text-text-muted m-0">{label}</p>
        <p className="text-body text-text-secondary m-0 mt-1">
          {empty ?? "None on file"}
        </p>
      </div>
    );
  }

  const filename = loaded?.file.originalFilename || caption || label;
  const isImage = loaded ? fileLooksLikeImage(loaded.file) : true;

  return (
    <div className="min-w-0">
      <p className="text-caption text-text-muted m-0">{label}</p>
      {pending ? (
        <div
          className="mt-1.5 h-36 w-full max-w-sm animate-pulse rounded-card bg-surface-variant"
          aria-hidden
        />
      ) : failed ? (
        <p className="text-body text-text-secondary m-0 mt-1">
          Could not load this file. Retry the page.
        </p>
      ) : loaded && isImage ? (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-1.5 block w-full max-w-sm overflow-hidden rounded-card border border-outline-subtle bg-black text-left shadow-[inset_3px_0_0_#ffde58] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-yellow"
            aria-label={`Open ${label}: ${filename}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={loaded.url}
              alt={filename}
              className="aspect-[4/3] h-36 w-full object-cover object-center"
            />
            <span className="block truncate px-3 py-1.5 text-caption text-white/80">
              {filename}
            </span>
          </button>
          {showMetadata ? <ArtworkFacts file={loaded.file} /> : null}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent
              className="max-h-[90vh] w-[min(960px,calc(100%-2rem))] max-w-none overflow-auto bg-black p-3 sm:max-w-none"
              showCloseButton
            >
              <DialogTitle className="text-white">{label}</DialogTitle>
              <DialogDescription className="text-white/70">{filename}</DialogDescription>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={loaded.url}
                alt={filename}
                className="mt-2 max-h-[75vh] w-full rounded-md object-contain"
              />
              {showMetadata ? (
                <ArtworkFacts
                  file={loaded.file}
                  className="text-caption text-white/70 m-0 mt-2"
                />
              ) : null}
            </DialogContent>
          </Dialog>
        </>
      ) : loaded ? (
        <>
          <p className="text-body text-text-primary m-0 mt-1">
            <a
              href={loaded.url}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              {filename}
            </a>
            <span className="text-caption text-text-muted"> · open the file</span>
          </p>
          {showMetadata ? <ArtworkFacts file={loaded.file} /> : null}
        </>
      ) : null}
    </div>
  );
}

function ArtworkFacts({
  file,
  className,
}: {
  file: StoredFile;
  className?: string;
}) {
  const facts = artworkFileFacts(file);
  if (facts.length === 0) return null;
  return (
    <p className={className ?? "text-caption text-text-muted m-0 mt-1.5 max-w-sm"}>
      {facts.join(" · ")}
    </p>
  );
}

export function EvidenceStrip({ items }: { items: EvidenceItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <EvidencePlate
          key={`${item.kind}:${item.fileId}`}
          fileId={item.fileId}
          label={item.label}
          caption={item.caption}
          showMetadata={item.kind === "artwork"}
        />
      ))}
    </div>
  );
}
