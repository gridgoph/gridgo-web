"use client";

import { useEffect, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { getFileDownloadUrl } from "@/lib/api/client";
import type { SupportChatAttachment } from "@/lib/api/types";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;

function photoName(attachment: SupportChatAttachment): string {
  return attachment.originalFilename || "Chat photo";
}

export function ChatImage({
  attachment,
  square = false,
}: {
  attachment: SupportChatAttachment;
  square?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const name = photoName(attachment);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    void getFileDownloadUrl(attachment.fileId)
      .then((next) => {
        if (!cancelled) setUrl(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.fileId]);

  function changeZoom(next: number) {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)));
  }

  if (failed) {
    return (
      <p className="text-caption text-text-muted m-0">
        {attachment.originalFilename || "Photo could not be opened."}
      </p>
    );
  }
  if (!url) {
    return <p className="text-caption text-text-muted m-0">Loading photo…</p>;
  }
  return (
    <>
      <button
        type="button"
        aria-label={`View ${name}`}
        onClick={() => {
          setZoom(MIN_ZOOM);
          setOpen(true);
        }}
        className="block cursor-zoom-in border-0 bg-transparent p-0"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          className={
            square
              ? "aspect-square w-full rounded-[var(--radius-field)] object-cover"
              : "max-h-64 max-w-full rounded-[var(--radius-field)] object-contain"
          }
        />
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setZoom(MIN_ZOOM);
        }}
      >
        <DialogContent className="flex max-h-[92vh] w-[min(960px,calc(100%-2rem))] max-w-none flex-col gap-3 overflow-hidden sm:max-w-none">
          <DialogTitle className="pr-8">{name}</DialogTitle>
          <DialogDescription className="sr-only">
            Photo preview. Zoom in to see it larger.
          </DialogDescription>
          <div className="flex max-h-[70vh] min-h-48 items-center justify-center overflow-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`${name} preview`}
              style={{
                width: `${zoom * 100}%`,
                maxWidth: zoom === MIN_ZOOM ? "100%" : "none",
                maxHeight: zoom === MIN_ZOOM ? "70vh" : "none",
              }}
              className="object-contain"
            />
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Zoom out"
              disabled={zoom <= MIN_ZOOM}
              onClick={() => changeZoom(zoom - ZOOM_STEP)}
            >
              <ZoomOut />
            </Button>
            <p className="text-caption text-text-muted m-0 w-12 text-center tabular-nums">
              {Math.round(zoom * 100)}%
            </p>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Zoom in"
              disabled={zoom >= MAX_ZOOM}
              onClick={() => changeZoom(zoom + ZOOM_STEP)}
            >
              <ZoomIn />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
