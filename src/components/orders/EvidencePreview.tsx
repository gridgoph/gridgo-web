/**
 * Print-desk plate for an order file. Operations should see the picture, not
 * only the filename. Yellow tick on the dark plate is the GRIDGO signature.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";

import { DeletedFilePlate } from "@/components/files/DeletedFile";
import { EarlyDeleteFileButton } from "@/components/files/EarlyDeleteFileDialog";
import { useFileDeletionAccess } from "@/components/files/FileDeletionAccess";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { getFile, getFileDownloadUrl } from "@/lib/api/client";
import type { StoredFile } from "@/lib/api/types";
import type { OrderLineMeasurement } from "@/lib/api/types";
import type { EvidenceItem } from "@/lib/evidence";
import {
  artworkFileFacts,
  artworkSizeMismatchWarning,
  fileLooksLikeImage,
} from "@/lib/evidence";
import { fileIsGone } from "@/lib/file-retention";

type PlateProps = {
  fileId: string | null | undefined;
  label: string;
  caption?: string | null;
  empty?: string;
  /** Print-desk facts under the picture. Artwork plates turn this on. */
  showMetadata?: boolean;
  /** Catalog size on the order, compared to the file's measured print size. */
  productSize?: string | null;
  productMeasurement?: OrderLineMeasurement | null;
  /**
   * Save control for the supplier spec. Other plates — payment proof,
   * delivery photos, pickup evidence — leave this off.
   */
  downloadable?: boolean;
  /**
   * An order file Super Admin may delete before its retention period ends.
   * Only shows the action inside a tree that grants `deleteEarly`
   * (`FileDeletionAccessProvider`); account plates such as a receiving QR
   * leave this off.
   */
  deletable?: boolean;
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
  productSize,
  productMeasurement,
  downloadable = false,
  deletable = false,
}: PlateProps) {
  const access = useFileDeletionAccess();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [gone, setGone] = useState(false);
  const [pendingHold, setPendingHold] = useState(false);
  const [pending, setPending] = useState(Boolean(fileId));

  useEffect(() => {
    setGone(false);
    setPendingHold(false);
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
      .catch((err) => {
        if (cancelled) return;
        setLoaded(null);
        // A deleted file answers 404: say it is gone, never "retry".
        if (fileIsGone(err)) setGone(true);
        else setFailed(true);
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

  if (gone) {
    return <DeletedFilePlate fileId={fileId} label={label} pendingHold={pendingHold} />;
  }

  const filename = loaded?.file.originalFilename || caption || label;
  const isImage = loaded ? fileLooksLikeImage(loaded.file) : true;
  const canDelete = deletable && access.deleteEarly && loaded?.file.state === "ready";

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
          {showMetadata ? (
            <ArtworkFacts
              file={loaded.file}
              productSize={productSize}
              productMeasurement={productMeasurement}
            />
          ) : null}
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
                  productSize={productSize}
                  productMeasurement={productMeasurement}
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
          {showMetadata ? (
            <ArtworkFacts
              file={loaded.file}
              productSize={productSize}
              productMeasurement={productMeasurement}
            />
          ) : null}
        </>
      ) : null}
      {downloadable && loaded && fileId ? (
        <FileDownload fileId={fileId} filename={loaded.file.originalFilename} />
      ) : null}
      {canDelete && loaded && fileId ? (
        <div className="mt-1 max-w-sm">
          <EarlyDeleteFileButton
            fileId={fileId}
            file={loaded.file}
            label={label}
            previewUrl={loaded.url}
            onDeleted={(result) => {
              setLoaded(null);
              setPendingHold(result.state === "delete_pending");
              setGone(true);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Saves the stored object under its original name.
 *
 * The preview URL is a different request and is not reused. This one is
 * asked for on the click and not kept: it only lasts five minutes, and the
 * signed host is not this site, so a link with `download` opens the file
 * instead of saving it.
 */
/** Long enough for any browser to have started the save from the blob. */
const REVOKE_AFTER_MS = 10_000;

function FileDownload({ fileId, filename }: { fileId: string; filename: string }) {
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  async function onDownload() {
    setFailed(false);
    setSaving(true);
    try {
      const url = await getFileDownloadUrl(fileId);
      const response = await fetch(url);
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
        // Safari and some Firefox builds drop a save whose URL is revoked in
        // the same task as the click, so let the save start first.
        setTimeout(() => URL.revokeObjectURL(objectUrl), REVOKE_AFTER_MS);
      }
    } catch {
      if (live.current) setFailed(true);
    } finally {
      if (live.current) setSaving(false);
    }
  }

  return (
    <div className="mt-2 max-w-sm">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => void onDownload()}
        disabled={saving}
        aria-label={saving ? `Downloading ${filename}` : `Download ${filename}`}
      >
        <Download size={16} strokeWidth={1.75} aria-hidden />
        {saving ? "Downloading…" : "Download"}
      </Button>
      {failed ? (
        <p className="text-caption text-error m-0 mt-1" role="alert">
          Could not download this file. Try again.
        </p>
      ) : null}
    </div>
  );
}

function ArtworkFacts({
  file,
  productSize,
  productMeasurement,
  className,
}: {
  file: StoredFile;
  productSize?: string | null;
  productMeasurement?: OrderLineMeasurement | null;
  className?: string;
}) {
  const facts = artworkFileFacts(file);
  const mismatch = artworkSizeMismatchWarning(file.detected, {
    label: productSize,
    measurement: productMeasurement,
  });
  if (facts.length === 0 && !mismatch) return null;
  return (
    <div className="mt-1.5 max-w-sm">
      {facts.length ? (
        <p className={className ?? "text-caption text-text-muted m-0"}>
          {facts.join(" · ")}
        </p>
      ) : null}
      {mismatch ? (
        <p className="text-caption text-error m-0 mt-1" role="status">
          {mismatch}
        </p>
      ) : null}
    </div>
  );
}

export function EvidenceStrip({
  items,
  deletable = false,
}: {
  items: EvidenceItem[];
  /** Order files: Super Admin may delete each early (see `EvidencePlate`). */
  deletable?: boolean;
}) {
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
          productSize={item.kind === "artwork" ? item.productSize : null}
          productMeasurement={item.kind === "artwork" ? item.productMeasurement : null}
          deletable={deletable}
        />
      ))}
    </div>
  );
}
