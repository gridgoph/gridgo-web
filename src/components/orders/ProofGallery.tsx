"use client";

/**
 * The proof behind one payout stage, as a contact print: every picture once,
 * numbered in the order it was filed, opened large and stepped through.
 *
 * A stage can carry up to 50 pictures (gridgo-api#254, "Payout proofs"), so
 * the print shows the first few frames and folds the rest behind "Show all";
 * a frame reads its own file and signed link only when it is drawn. The ids
 * are the API's `pofFileIds`, already one per picture; this only drops a
 * repeated id, never a picture the API listed.
 *
 * Shared by the shop's own payout (job page, payouts) and the GRIDGO Team's
 * order workspace and payout desk. `deletable` lets Super Admin delete one
 * early from the large view; the button gates itself on the tree.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, FileX2, Images } from "lucide-react";

import { DeletedFilePlate } from "@/components/files/DeletedFile";
import { EarlyDeleteFileButton } from "@/components/files/EarlyDeleteFileDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { getFile, getFileDownloadUrl } from "@/lib/api/client";
import type { StoredFile } from "@/lib/api/types";
import { fileLooksLikeImage } from "@/lib/evidence";
import { fileIsGone } from "@/lib/file-retention";
import { stageProofIds } from "@/lib/payout-proofs";
import { cn } from "@/lib/utils";

type FrameState =
  | { kind: "loading" }
  | { kind: "ready"; file: StoredFile; url: string; image: boolean }
  | { kind: "gone" }
  | { kind: "failed" };

type Props = {
  fileIds: readonly string[];
  /** What one picture is called in the large view: "Proof 3 of 12". */
  label?: string;
  /** Who filed it and when, under the picture in the large view (and the frame when large). */
  captionFor?: (fileId: string, index: number) => string | null;
  /** Bigger frames with captions, for a screen whose job is to look at them. */
  large?: boolean;
  /** Frames shown before "Show all". */
  initialCount?: number;
  /** Super Admin may delete one early from the large view. */
  deletable?: boolean;
};

export function ProofGallery({
  fileIds,
  label = "Proof",
  captionFor,
  large = false,
  initialCount,
  deletable = false,
}: Props) {
  const ids = stageProofIds({ pofFileIds: [...fileIds] });
  const [frames, setFrames] = useState<Record<string, FrameState>>({});
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  const report = useCallback((fileId: string, state: FrameState) => {
    setFrames((current) => (current[fileId] === state ? current : { ...current, [fileId]: state }));
  }, []);

  const fold = initialCount ?? (large ? 6 : 8);
  // Folding away one or two frames hides more than it saves.
  const folds = ids.length > fold + 2;
  const shown = folds && !expanded ? ids.slice(0, fold) : ids;

  if (ids.length === 0) return null;

  const openId = openIndex === null ? null : (ids[openIndex] ?? null);
  const open = openId ? (frames[openId] ?? { kind: "loading" as const }) : null;
  const step = (delta: number) =>
    setOpenIndex((index) =>
      index === null ? index : (index + delta + ids.length) % ids.length,
    );
  const caption = openId !== null && openIndex !== null ? captionFor?.(openId, openIndex) : null;

  return (
    <div className="flex flex-col gap-2">
      <ol
        className={cn(
          "m-0 grid list-none p-0",
          large
            ? "grid-cols-2 gap-3 md:grid-cols-3"
            : "grid-cols-3 gap-2 sm:grid-cols-4",
        )}
      >
        {shown.map((fileId, index) => (
          <li key={fileId} className="min-w-0">
            <ProofFrame
              fileId={fileId}
              number={index + 1}
              label={label}
              large={large}
              caption={large ? (captionFor?.(fileId, index) ?? null) : null}
              onState={report}
              onOpen={() => setOpenIndex(index)}
            />
          </li>
        ))}
      </ol>

      {folds ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            <Images data-icon="inline-start" strokeWidth={1.75} aria-hidden />
            {expanded ? "Show fewer" : `Show all ${ids.length}`}
          </Button>
        </div>
      ) : null}

      <Dialog
        open={openId !== null}
        onOpenChange={(next) => {
          if (!next) setOpenIndex(null);
        }}
      >
        <DialogContent
          className="max-h-[90vh] w-[min(960px,calc(100%-2rem))] max-w-none overflow-auto bg-black p-3 sm:max-w-none"
          showCloseButton
          onKeyDown={(event) => {
            if (ids.length < 2) return;
            if (event.key === "ArrowRight") step(1);
            if (event.key === "ArrowLeft") step(-1);
          }}
        >
          {/* A folded frame is not drawn, so the large view reads it itself. */}
          {openId !== null && !shown.includes(openId) ? (
            <FrameReader fileId={openId} onState={report} />
          ) : null}
          {openId !== null && openIndex !== null && open ? (
            <>
              <DialogTitle className="text-white">
                {ids.length > 1 ? `${label} ${openIndex + 1} of ${ids.length}` : label}
              </DialogTitle>
              <DialogDescription className="text-white/70">
                {[open.kind === "ready" ? open.file.originalFilename : null, caption]
                  .filter(Boolean)
                  .join(". ") || " "}
              </DialogDescription>
              <LargeView
                fileId={openId}
                state={open}
                label={`${label} ${openIndex + 1}`}
                deletable={deletable}
                onDeleted={() => report(openId, { kind: "gone" })}
              />
              {ids.length > 1 ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    className="text-white hover:bg-white/10 hover:text-white"
                    onClick={() => step(-1)}
                  >
                    <ChevronLeft size={16} aria-hidden />
                    Previous
                  </Button>
                  <span className="text-caption tabular-nums text-white/70" aria-hidden>
                    {openIndex + 1} / {ids.length}
                  </span>
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
    </div>
  );
}

/** Reads one file and its signed link the first time the frame is drawn. */
function useProofFile(fileId: string, onState: (fileId: string, state: FrameState) => void) {
  const [state, setState] = useState<FrameState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    // One catch for the reads and for reading what came back, so a malformed
    // answer is a frame that failed to load, never an unhandled error.
    (async () => {
      try {
        const [file, url] = await Promise.all([getFile(fileId), getFileDownloadUrl(fileId)]);
        if (!file || !url) throw new Error("incomplete file answer");
        const image = fileLooksLikeImage(file);
        if (!cancelled) setState({ kind: "ready", file, url, image });
      } catch (err) {
        if (!cancelled) setState(fileIsGone(err) ? { kind: "gone" } : { kind: "failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, attempt]);

  useEffect(() => {
    onState(fileId, state);
  }, [fileId, state, onState]);

  return { state, retry: () => setAttempt((n) => n + 1) };
}

function FrameReader({
  fileId,
  onState,
}: {
  fileId: string;
  onState: (fileId: string, state: FrameState) => void;
}) {
  useProofFile(fileId, onState);
  return null;
}

function ProofFrame({
  fileId,
  number,
  label,
  large,
  caption,
  onState,
  onOpen,
}: {
  fileId: string;
  number: number;
  label: string;
  large: boolean;
  caption: string | null;
  onState: (fileId: string, state: FrameState) => void;
  onOpen: () => void;
}) {
  const { state, retry } = useProofFile(fileId, onState);
  const name = `${label} ${number}`;
  const frame = cn("relative w-full", large ? "aspect-[4/3]" : "aspect-square");

  return (
    <figure className="m-0 min-w-0">
      <div className="overflow-hidden rounded-field border border-outline-subtle bg-black">
        {state.kind === "loading" ? (
          <div className={cn(frame, "animate-pulse bg-white/10")} aria-hidden />
        ) : state.kind === "failed" ? (
          <div className={cn(frame, "flex flex-col items-center justify-center gap-1 p-2 text-center")}>
            <p className="text-caption m-0 text-white/80">Did not load</p>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10 hover:text-white"
              onClick={retry}
              aria-label={`Try ${name.toLowerCase()} again`}
            >
              Try again
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className={cn(
              frame,
              "block text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-yellow",
            )}
            aria-label={`Open ${name.toLowerCase()}${
              state.kind === "gone" ? ", deleted" : state.kind === "ready" && !state.image ? ", a document" : ""
            }`}
          >
            {state.kind === "ready" && state.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.url}
                alt=""
                loading="lazy"
                className="absolute inset-0 size-full object-cover object-center"
              />
            ) : (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center text-white/80">
                {state.kind === "gone" ? (
                  <FileX2 size={20} strokeWidth={1.75} aria-hidden />
                ) : (
                  <FileText size={20} strokeWidth={1.75} aria-hidden />
                )}
                <span className="text-caption">
                  {state.kind === "gone" ? "Deleted" : "Document"}
                </span>
              </span>
            )}
            {/* The frame number, as on a contact print: the order it was filed in. */}
            <span
              className="text-caption absolute bottom-1 left-1 rounded-sm bg-black/75 px-1.5 tabular-nums text-white"
              style={{ fontFamily: "var(--font-medium)" }}
              aria-hidden
            >
              {number}
            </span>
          </button>
        )}
      </div>
      {caption ? <figcaption className="text-caption text-text-muted m-0 mt-1">{caption}</figcaption> : null}
    </figure>
  );
}

function LargeView({
  fileId,
  state,
  label,
  deletable,
  onDeleted,
}: {
  fileId: string;
  state: FrameState;
  label: string;
  deletable: boolean;
  onDeleted: () => void;
}) {
  if (state.kind === "loading") {
    return <div className="mt-2 h-64 w-full animate-pulse rounded-md bg-white/10" aria-hidden />;
  }
  if (state.kind === "failed") {
    return (
      <p className="text-body m-0 mt-2 text-white/80">
        This picture did not load. Close this and try it again from the list.
      </p>
    );
  }
  if (state.kind === "gone") {
    return (
      <div className="bg-surface mt-2 rounded-card p-3">
        <DeletedFilePlate fileId={fileId} label={label} />
      </div>
    );
  }
  return (
    <>
      {state.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={state.url}
          alt={`${label}: ${state.file.originalFilename}`}
          className="mt-2 max-h-[70vh] w-full rounded-md object-contain"
        />
      ) : (
        <p className="text-body m-0 mt-2 text-white">
          <a
            href={state.url}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Open {state.file.originalFilename}
          </a>
          <span className="text-white/70"> in a new tab</span>
        </p>
      )}
      {deletable ? (
        <div className="mt-2 max-w-sm">
          <EarlyDeleteFileButton
            fileId={fileId}
            file={state.file}
            label={label}
            previewUrl={state.image ? state.url : null}
            tone="dark"
            onDeleted={onDeleted}
          />
        </div>
      ) : null}
    </>
  );
}
