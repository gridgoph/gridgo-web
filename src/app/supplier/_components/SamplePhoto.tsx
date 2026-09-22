"use client";

import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { getFileDownloadUrl } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type Props = {
  fileId?: string;
  alt: string;
  className?: string;
  emptyLabel?: string;
  /** Whether a click opens the loupe. Empty and failed plates never enlarge. */
  enlarge?: boolean;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;

/** Print sample in a crop-mark frame — the board's tile, not a product shot. */
export function SamplePhoto({
  fileId,
  alt,
  className,
  emptyLabel = "No sample yet",
  enlarge = true,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!fileId) {
      setSrc(null);
      return;
    }
    let gone = false;
    void getFileDownloadUrl(fileId)
      .then((url) => {
        if (!gone) setSrc(url);
      })
      .catch(() => {
        if (!gone) setSrc(null);
      });
    return () => {
      gone = true;
    };
  }, [fileId]);

  const frame = cn(
    "relative aspect-square overflow-hidden bg-surface-variant",
    className,
  );

  const picture = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="size-full object-cover" />
  ) : (
    <p className="text-caption text-text-muted m-0 flex size-full items-center justify-center px-3 text-center">
      {emptyLabel}
    </p>
  );

  return (
    <div className={frame}>
      <span aria-hidden className="pointer-events-none absolute inset-1.5 border border-outline/70" />
      <span aria-hidden className="absolute top-0 left-0 size-3 border-t border-l border-foreground" />
      <span aria-hidden className="absolute top-0 right-0 size-3 border-t border-r border-foreground" />
      <span aria-hidden className="absolute bottom-0 left-0 size-3 border-b border-l border-foreground" />
      <span aria-hidden className="absolute right-0 bottom-0 size-3 border-r border-b border-foreground" />
      {src && enlarge ? (
        <>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen(true);
            }}
            className="size-full cursor-zoom-in text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-yellow"
            aria-label={`Open ${alt} larger`}
          >
            {picture}
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent
              className="w-[min(960px,calc(100%-2rem))] max-w-none bg-white p-4 text-black sm:max-w-none"
              showCloseButton
            >
              <DialogTitle className="text-black">{alt}</DialogTitle>
              <DialogDescription className="text-black/70">
                Pinch or scroll to look closer.
              </DialogDescription>
              <ZoomablePhoto src={src} alt={alt} />
            </DialogContent>
          </Dialog>
        </>
      ) : (
        picture
      )}
    </div>
  );
}

/**
 * The loupe inside the dialog — wheel, pinch, drag, double-click.
 *
 * Copied from the payout plate's enlarge dialog: a click opens a larger
 * picture. Samples need a closer look than a QR, so the picture itself scales
 * instead of only growing the frame.
 */
function ZoomablePhoto({ src, alt }: { src: string; alt: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  function clampScale(next: number) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
  }

  function resetIfFlat(next: number) {
    if (next <= 1) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      return;
    }
    setScale(next);
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 0.9;
    resetIfFlat(clampScale(scale * factor));
  }

  function pointerDistance() {
    const points = [...pointers.current.values()];
    if (points.length < 2) return 0;
    const [a, b] = points;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    frameRef.current?.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      pinch.current = { distance: pointerDistance(), scale };
      drag.current = null;
      return;
    }
    if (scale > 1) {
      drag.current = { x: event.clientX, y: event.clientY, tx: offset.x, ty: offset.y };
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const distance = pointerDistance();
      if (pinch.current.distance > 0) {
        resetIfFlat(clampScale(pinch.current.scale * (distance / pinch.current.distance)));
      }
      return;
    }
    if (drag.current && scale > 1) {
      setOffset({
        x: drag.current.tx + event.clientX - drag.current.x,
        y: drag.current.ty + event.clientY - drag.current.y,
      });
    }
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  }

  function onDoubleClick() {
    if (scale > 1) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      return;
    }
    setScale(2);
  }

  return (
    <div
      ref={frameRef}
      className="mt-2 flex max-h-[70vh] min-h-[16rem] w-full touch-none items-center justify-center overflow-hidden bg-white"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-h-[70vh] w-full max-w-full origin-center object-contain select-none"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        }}
      />
    </div>
  );
}
