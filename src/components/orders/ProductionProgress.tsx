"use client";

/**
 * The shop's progress photos, and the frame that stands in for them when none
 * has arrived.
 *
 * Mounted on the Operations / Super Admin order workspace (Production row) and
 * the supplier job page. The photos come signed on the order
 * (`productionProgress.photos[].downloadUrl`); a link that is missing, close to
 * expiry, or refused by storage is fetched again from
 * `GET /files/:fileId/download-url`, once, before the tile says so.
 *
 * The empty state is drawn as an empty frame on purpose: a gap the shape of a
 * photo reads as "something belongs here", where a sentence alone reads as a
 * status line and is skimmed past.
 */

import { useCallback, useEffect, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, ImagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { getFileDownloadUrl } from "@/lib/api/client";
import type { ProductionPhoto } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { PRODUCTION_PHOTO_COPY, signedUrlUsable } from "@/lib/production-progress";
import { cn } from "@/lib/utils";

type GalleryProps = {
  /** Oldest first; `progressPhotos(order)` sorts them. */
  photos: ProductionPhoto[];
  /** Staff-only note under a photo ("Also the start-of-production proof"). */
  noteFor?: (photo: ProductionPhoto) => string | null;
  /** Shown as the last tile: the shop's optional extra photo. */
  onAdd?: () => void;
  addLabel?: string;
  addDisabled?: boolean;
};

type Loaded = Record<string, string>;

/** Numbered because the photos are a sequence: the job, in the order it was shot. */
export function ProgressGallery({
  photos,
  noteFor,
  onAdd,
  addLabel = "Add another photo",
  addDisabled = false,
}: GalleryProps) {
  const [urls, setUrls] = useState<Loaded>({});
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const remember = useCallback((fileId: string, url: string) => {
    setUrls((current) => (current[fileId] === url ? current : { ...current, [fileId]: url }));
  }, []);

  const open = openIndex === null ? null : photos[openIndex] ?? null;
  const step = (delta: number) =>
    setOpenIndex((index) =>
      index === null ? index : (index + delta + photos.length) % photos.length,
    );

  return (
    <>
      <ol className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
        {photos.map((photo, index) => (
          <li key={photo.fileId} className="min-w-0">
            <PhotoTile
              photo={photo}
              number={index + 1}
              note={noteFor?.(photo) ?? null}
              onLoaded={remember}
              onOpen={() => setOpenIndex(index)}
            />
          </li>
        ))}
        {onAdd ? (
          <li className="min-w-0">
            <button
              type="button"
              onClick={onAdd}
              disabled={addDisabled}
              className="border-outline text-text-secondary hover:bg-overlay-hover hover:text-text-primary flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-card border-2 border-dashed bg-transparent p-3 text-center disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ImagePlus size={22} strokeWidth={1.75} aria-hidden />
              <span className="text-caption" style={{ fontFamily: "var(--font-medium)" }}>
                {addLabel}
              </span>
              <span className="text-caption text-text-muted">Optional</span>
            </button>
          </li>
        ) : null}
      </ol>

      <Dialog
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpenIndex(null);
        }}
      >
        <DialogContent
          className="max-h-[90vh] w-[min(960px,calc(100%-2rem))] max-w-none overflow-auto bg-black p-3 sm:max-w-none"
          showCloseButton
          onKeyDown={(event) => {
            if (photos.length < 2) return;
            if (event.key === "ArrowRight") step(1);
            if (event.key === "ArrowLeft") step(-1);
          }}
        >
          {open && openIndex !== null ? (
            <>
              <DialogTitle className="text-white">
                {photos.length > 1
                  ? `Progress photo ${openIndex + 1} of ${photos.length}`
                  : "Progress photo"}
              </DialogTitle>
              <DialogDescription className="text-white/70">
                Sent {formatDateTime(open.at)}
              </DialogDescription>
              {urls[open.fileId] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={urls[open.fileId]}
                  alt={`Progress photo ${openIndex + 1}, sent ${formatDateTime(open.at)}`}
                  className="mt-2 max-h-[70vh] w-full rounded-md object-contain"
                />
              ) : (
                <p className="text-body m-0 mt-2 text-white/80">
                  This photo has not loaded yet. Close this and try the photo again.
                </p>
              )}
              {photos.length > 1 ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    className="text-white hover:bg-white/10 hover:text-white"
                    onClick={() => step(-1)}
                  >
                    <ChevronLeft size={16} aria-hidden />
                    Previous
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-white hover:bg-white/10 hover:text-white"
                    onClick={() => step(1)}
                  >
                    Next
                    <ChevronRight size={16} aria-hidden />
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

type TileState =
  | { kind: "loading" }
  | { kind: "ready"; url: string; refreshed: boolean }
  | { kind: "failed" };

function PhotoTile({
  photo,
  number,
  note,
  onLoaded,
  onOpen,
}: {
  photo: ProductionPhoto;
  number: number;
  note: string | null;
  onLoaded: (fileId: string, url: string) => void;
  onOpen: () => void;
}) {
  const [state, setState] = useState<TileState>(() =>
    signedUrlUsable(photo)
      ? { kind: "ready", url: photo.downloadUrl as string, refreshed: false }
      : { kind: "loading" },
  );

  const refresh = useCallback(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    getFileDownloadUrl(photo.fileId).then(
      (url) => {
        if (!cancelled) setState({ kind: "ready", url, refreshed: true });
      },
      () => {
        if (!cancelled) setState({ kind: "failed" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [photo.fileId]);

  // A new signed link from a live refresh replaces a stale one; the same link
  // arriving again leaves a loaded picture alone.
  const signed = signedUrlUsable(photo) ? (photo.downloadUrl as string) : null;
  useEffect(() => {
    if (signed) {
      setState((current) =>
        current.kind === "ready" && current.url === signed
          ? current
          : { kind: "ready", url: signed, refreshed: false },
      );
      return;
    }
    return refresh();
  }, [signed, refresh]);

  useEffect(() => {
    if (state.kind === "ready") onLoaded(photo.fileId, state.url);
  }, [state, photo.fileId, onLoaded]);

  const sent = formatDateTime(photo.at);
  const name = `Photo ${number}`;

  return (
    <figure className="m-0 min-w-0">
      <div className="overflow-hidden rounded-card border border-outline-subtle bg-black shadow-[inset_3px_0_0_var(--color-action-yellow)]">
        {state.kind === "ready" ? (
          <button
            type="button"
            onClick={onOpen}
            className="block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-yellow"
            aria-label={`Open progress photo ${number}, sent ${sent}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.url}
              alt=""
              className="aspect-[4/3] w-full object-cover object-center"
              onError={() => {
                // Expired or refused: one fresh link, then say so.
                if (state.refreshed) setState({ kind: "failed" });
                else refresh();
              }}
            />
          </button>
        ) : state.kind === "loading" ? (
          <div className="aspect-[4/3] w-full animate-pulse bg-white/10" aria-hidden />
        ) : (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 p-3 text-center">
            <p className="text-caption m-0 text-white/80">This photo did not load.</p>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10 hover:text-white"
              onClick={() => refresh()}
            >
              Try again
            </Button>
          </div>
        )}
        <figcaption className="flex items-baseline justify-between gap-2 px-3 py-1.5">
          <span className="text-caption text-white" style={{ fontFamily: "var(--font-medium)" }}>
            {name}
          </span>
          <span className="text-caption truncate text-white/70">{sent}</span>
        </figcaption>
      </div>
      {note ? <p className="text-caption text-text-muted m-0 mt-1">{note}</p> : null}
    </figure>
  );
}

/**
 * No photo yet. The frame is the size of a photo tile's picture, dashed and
 * empty, beside the words; it is not a button, because the step that fills it
 * lives in the page's own action bar.
 */
export function WaitingForPhoto({
  body,
  title = PRODUCTION_PHOTO_COPY.waitingTitle,
  tone = "neutral",
  children,
}: {
  body: string;
  title?: string;
  /** `attention` when the photo is what holds the job up for this reader. */
  tone?: "neutral" | "attention";
  children?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-3 rounded-card border p-3 sm:flex-row sm:items-center",
        tone === "attention"
          ? "border-outline bg-surface-variant"
          : "border-outline-subtle bg-surface",
      )}
    >
      <div
        className="border-outline text-text-muted flex aspect-[4/3] w-28 shrink-0 items-center justify-center rounded-field border-2 border-dashed"
        aria-hidden
      >
        <Camera size={22} strokeWidth={1.75} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
          {title}
        </p>
        <p className="text-body text-text-secondary m-0 max-w-prose">{body}</p>
        {children}
      </div>
    </div>
  );
}
